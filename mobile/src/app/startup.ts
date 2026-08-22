import { BleConnectionState } from '../ble/Nu40BleClient';

export type StartupScreen = 'connect' | 'standby' | 'face' | 'history';

type ConnectableBleClient = {
  connect(): Promise<void>;
};

export function screenAfterBleSnapshot(
  current: StartupScreen,
  state: BleConnectionState
): StartupScreen {
  if (state === 'connected') return 'face';
  if (state === 'ended') return 'standby';
  if (state === 'error') return 'connect';
  return current;
}

export async function startBleOnLaunch(client: ConnectableBleClient): Promise<void> {
  await client.connect();
}
