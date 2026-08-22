import { BleSnapshot } from '../ble/Nu40BleClient';

export type BridgeEnvelope<T extends string = string, P = unknown> = {
  v: 1;
  type: T;
  seq: number;
  at: number;
  payload: P;
};

export type WebReadyEnvelope = BridgeEnvelope<'web/ready', { bridgeVersion: 1 }>;
export type BoardWriteEnvelope = BridgeEnvelope<'ble/write', { line: string }>;
export type ConnectEnvelope = BridgeEnvelope<'ble/connect', Record<string, never>>;
export type WebEnvelope = WebReadyEnvelope | BoardWriteEnvelope | ConnectEnvelope;

export class BridgeSequencer {
  private sequence = 0;

  create<T extends string, P>(type: T, payload: P, at = Date.now()): BridgeEnvelope<T, P> {
    return { v: 1, type, seq: this.sequence++, at, payload };
  }
}

export function parseWebEnvelope(raw: string): WebEnvelope | null {
  try {
    const value = JSON.parse(raw) as Partial<BridgeEnvelope>;
    if (
      value.v !== 1 ||
      typeof value.type !== 'string' ||
      typeof value.seq !== 'number' ||
      typeof value.at !== 'number' ||
      typeof value.payload !== 'object' ||
      value.payload === null
    ) return null;
    if (value.type === 'web/ready' && (value.payload as { bridgeVersion?: number }).bridgeVersion === 1) {
      return value as WebReadyEnvelope;
    }
    if (value.type === 'ble/connect') return value as ConnectEnvelope;
    if (value.type === 'ble/write' && typeof (value.payload as { line?: unknown }).line === 'string') {
      return value as BoardWriteEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

export function statusPayload(snapshot: BleSnapshot) {
  return {
    state: snapshot.state,
    deviceName: snapshot.deviceName,
    reason: snapshot.error,
  };
}
