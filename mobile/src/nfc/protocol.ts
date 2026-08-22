export const NFC_WAKE_URI =
  'sleepal://nfc/v1/wake?device=SLEEPPAL-PILLOW-01';

export type NfcWakeRequest = {
  version: 1;
  action: 'wake';
  deviceName: string;
  uri: string;
};

const DEVICE_NAME_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{0,30}[A-Z0-9])?$/;

export function parseNfcWakeUrl(value: string | null | undefined): NfcWakeRequest | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'sleepal:') return null;
    if (url.hostname !== 'nfc') return null;
    if (url.pathname !== '/v1/wake') return null;

    const deviceName = url.searchParams.get('device');
    if (!deviceName || !DEVICE_NAME_PATTERN.test(deviceName)) return null;
    if (!deviceName.startsWith('SLEEPPAL-')) return null;

    return {
      version: 1,
      action: 'wake',
      deviceName,
      uri: url.toString(),
    };
  } catch {
    return null;
  }
}
