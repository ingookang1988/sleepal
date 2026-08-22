import { screenAfterBleSnapshot, startBleOnLaunch } from '../app/startup';

describe('startup BLE flow', () => {
  it('starts BLE connect once when app startup calls the policy', async () => {
    const connect = jest.fn(async () => undefined);
    await startBleOnLaunch({ connect });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('opens the face immediately after BLE connects', () => {
    expect(screenAfterBleSnapshot('connect', 'scanning')).toBe('connect');
    expect(screenAfterBleSnapshot('connect', 'connecting')).toBe('connect');
    expect(screenAfterBleSnapshot('connect', 'connected')).toBe('face');
    expect(screenAfterBleSnapshot('standby', 'connected')).toBe('face');
  });

  it('keeps retry and sleeping fallbacks', () => {
    expect(screenAfterBleSnapshot('face', 'error')).toBe('connect');
    expect(screenAfterBleSnapshot('face', 'ended')).toBe('standby');
  });
});
