import { PermissionsAndroid, Platform } from 'react-native';
import {
  BleError,
  BleManager,
  Device,
  ScanMode,
  State,
  Subscription,
} from 'react-native-ble-plx';

import { decodeAsciiBase64, encodeAsciiBase64 } from './ascii';
import {
  DEFAULT_DEVICE_PREFIX,
  MAX_NUS_LINE_BYTES,
  NUS_RX_UUID,
  NUS_SERVICE_UUID,
  NUS_TX_UUID,
} from './constants';
import { AsciiLineBuffer } from './lineBuffer';
import { isAllowedBoardWrite, parseNu40Line } from './protocol';

export type BleConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'error';

export type BleSnapshot = {
  state: BleConnectionState;
  deviceName?: string;
  deviceId?: string;
  rssi: number | null;
  lastLine?: string;
  droppedLines: number;
  error?: string;
};

type SnapshotListener = (snapshot: BleSnapshot) => void;
type LineListener = (line: string, receivedAt: number) => void;

const SCAN_TIMEOUT_MS = 12_000;

export class Nu40BleClient {
  private readonly manager = new BleManager();
  private readonly lineBuffer = new AsciiLineBuffer(MAX_NUS_LINE_BYTES);
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly lineListeners = new Set<LineListener>();
  private monitorSubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private device: Device | null = null;
  private normalEnd = false;
  private snapshot: BleSnapshot = {
    state: 'idle',
    rssi: null,
    droppedLines: 0,
  };

  constructor(
    private readonly namePrefix =
      process.env.EXPO_PUBLIC_NU40_NAME_PREFIX?.trim() || DEFAULT_DEVICE_PREFIX
  ) {}

  subscribe(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    listener(this.snapshot);
    return () => this.snapshotListeners.delete(listener);
  }

  subscribeLines(listener: LineListener): () => void {
    this.lineListeners.add(listener);
    return () => this.lineListeners.delete(listener);
  }

  getSnapshot(): BleSnapshot {
    return this.snapshot;
  }

  async connect(): Promise<void> {
    if (this.snapshot.state === 'scanning' || this.snapshot.state === 'connecting' || this.snapshot.state === 'connected') {
      return;
    }
    if (!(await this.requestPermissions())) {
      this.patchSnapshot({ state: 'error', error: 'Bluetooth 권한이 필요합니다.' });
      return;
    }

    if (!(await this.waitForPoweredOn())) {
      this.patchSnapshot({ state: 'error', error: 'Bluetooth를 켜 주세요.' });
      return;
    }

    this.normalEnd = false;
    this.reconnectAttempts = 0;
    this.lineBuffer.reset();
    this.patchSnapshot({ state: 'scanning', error: undefined, droppedLines: 0 });

    try {
      const scanned = await this.scanForDevice();
      this.patchSnapshot({
        state: 'connecting',
        deviceName: scanned.name ?? scanned.localName ?? 'NU40',
        deviceId: scanned.id,
      });

      const connected = await this.manager.connectToDevice(scanned.id);
      this.device = await connected.discoverAllServicesAndCharacteristics();
      this.bindDisconnect(this.device.id);
      this.bindNotifications(this.device.id);
      this.patchSnapshot({ state: 'connected', rssi: this.device.rssi ?? null });
    } catch (error) {
      await this.manager.stopDeviceScan().catch(() => undefined);
      this.patchSnapshot({ state: 'error', error: this.errorMessage(error) });
    }
  }

  async disconnect(): Promise<void> {
    this.normalEnd = false;
    this.clearReconnectTimer();
    this.releaseSubscriptions();
    const deviceId = this.device?.id;
    this.device = null;
    if (deviceId) await this.manager.cancelDeviceConnection(deviceId).catch(() => undefined);
    this.patchSnapshot({ state: 'idle', deviceId: undefined, deviceName: undefined, rssi: null });
  }

  async readRssi(): Promise<number | null> {
    if (!this.device || this.snapshot.state !== 'connected') return null;
    try {
      const updated = await this.manager.readRSSIForDevice(this.device.id);
      const rssi = updated.rssi ?? null;
      this.patchSnapshot({ rssi });
      return rssi;
    } catch {
      return null;
    }
  }

  async send(line: string): Promise<void> {
    if (!isAllowedBoardWrite(line)) throw new Error('허용되지 않은 NU40 명령입니다.');
    if (!this.device || this.snapshot.state !== 'connected') throw new Error('NU40이 연결되지 않았습니다.');
    await this.manager.writeCharacteristicWithResponseForDevice(
      this.device.id,
      NUS_SERVICE_UUID,
      NUS_RX_UUID,
      encodeAsciiBase64(`${line}\n`)
    );
  }

  async destroy(): Promise<void> {
    this.clearReconnectTimer();
    this.releaseSubscriptions();
    await this.manager.stopDeviceScan().catch(() => undefined);
    await this.manager.destroy();
  }

  private async scanForDevice(): Promise<Device> {
    return new Promise<Device>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        void this.manager.stopDeviceScan();
        reject(new Error(`광고 이름이 ${this.namePrefix}(으)로 시작하는 NU40을 찾지 못했습니다.`));
      }, SCAN_TIMEOUT_MS);

      const finish = (device: Device) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void this.manager.stopDeviceScan();
        resolve(device);
      };

      void this.manager
        .startDeviceScan(null, { allowDuplicates: false, scanMode: ScanMode.LowLatency }, (error, device) => {
          if (error) {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(error);
            return;
          }
          if (!device) return;
          const name = (device.name ?? device.localName ?? '').toUpperCase();
          if (this.namePrefix === '*' || name.startsWith(this.namePrefix.toUpperCase())) finish(device);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private bindNotifications(deviceId: string): void {
    this.monitorSubscription?.remove();
    this.monitorSubscription = this.manager.monitorCharacteristicForDevice(
      deviceId,
      NUS_SERVICE_UUID,
      NUS_TX_UUID,
      (error, characteristic) => {
        if (error) {
          this.patchSnapshot({ state: 'error', error: this.errorMessage(error) });
          return;
        }
        if (!characteristic?.value) return;
        const result = this.lineBuffer.push(decodeAsciiBase64(characteristic.value));
        if (result.droppedLines) {
          this.patchSnapshot({ droppedLines: this.snapshot.droppedLines + result.droppedLines });
        }
        for (const line of result.lines) this.handleLine(line);
      }
    );
  }

  private bindDisconnect(deviceId: string): void {
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = this.manager.onDeviceDisconnected(deviceId, (error) => {
      this.releaseSubscriptions();
      this.device = null;
      if (this.normalEnd) {
        this.patchSnapshot({ state: 'ended', rssi: null, error: undefined });
        return;
      }
      this.scheduleReconnect(
        deviceId,
        this.errorMessage(error ?? new Error('BLE 연결이 끊겼습니다.'))
      );
    });
  }

  private scheduleReconnect(deviceId: string, lastError: string): void {
    if (this.reconnectAttempts >= 3) {
      this.patchSnapshot({ state: 'error', rssi: null, error: lastError });
      return;
    }
    this.reconnectAttempts += 1;
    const delay = this.reconnectAttempts * 1_200;
    this.patchSnapshot({ state: 'connecting', rssi: null, error: undefined });
    this.reconnectTimer = setTimeout(() => {
      void this.reconnectKnownDevice(deviceId).catch((error) => {
        this.scheduleReconnect(deviceId, this.errorMessage(error));
      });
    }, delay);
  }

  private async reconnectKnownDevice(deviceId: string): Promise<void> {
    const connected = await this.manager.connectToDevice(deviceId);
    this.device = await connected.discoverAllServicesAndCharacteristics();
    this.bindDisconnect(deviceId);
    this.bindNotifications(deviceId);
    this.reconnectAttempts = 0;
    this.patchSnapshot({ state: 'connected', rssi: this.device.rssi ?? null, error: undefined });
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private handleLine(line: string): void {
    if (parseNu40Line(line).kind === 'sleeping') this.normalEnd = true;
    this.patchSnapshot({ lastLine: line });
    const receivedAt = Date.now();
    for (const listener of this.lineListeners) listener(line, receivedAt);
  }

  private releaseSubscriptions(): void {
    this.monitorSubscription?.remove();
    this.disconnectSubscription?.remove();
    this.monitorSubscription = null;
    this.disconnectSubscription = null;
  }

  private patchSnapshot(patch: Partial<BleSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.snapshotListeners) listener(this.snapshot);
  }

  private async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    const permissions =
      Number(Platform.Version) >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

    const result = await PermissionsAndroid.requestMultiple(permissions);
    return permissions.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
  }

  private async waitForPoweredOn(timeoutMs = 5_000): Promise<boolean> {
    if ((await this.manager.state()) === State.PoweredOn) return true;

    return new Promise<boolean>((resolve) => {
      let subscription: Subscription | null = null;
      const timeout = setTimeout(() => {
        subscription?.remove();
        resolve(false);
      }, timeoutMs);
      subscription = this.manager.onStateChange((state) => {
        if (state !== State.PoweredOn) return;
        clearTimeout(timeout);
        subscription?.remove();
        resolve(true);
      }, false);
    });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof BleError) return error.message;
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
