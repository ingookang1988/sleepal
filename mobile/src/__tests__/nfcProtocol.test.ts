import { NFC_WAKE_URI, parseNfcWakeUrl } from '../nfc/protocol';

describe('NFC wake protocol', () => {
  it('accepts the contracted Android NDEF URI', () => {
    expect(parseNfcWakeUrl(NFC_WAKE_URI)).toEqual({
      version: 1,
      action: 'wake',
      deviceName: 'SLEEPPAL-PILLOW-01',
      uri: NFC_WAKE_URI,
    });
  });

  it('rejects malformed, foreign, and future-version URIs', () => {
    expect(parseNfcWakeUrl(null)).toBeNull();
    expect(parseNfcWakeUrl('https://sleepal.app/nfc/v1/wake')).toBeNull();
    expect(parseNfcWakeUrl('sleepal://other/v1/wake?device=SLEEPPAL-PILLOW-01')).toBeNull();
    expect(parseNfcWakeUrl('sleepal://nfc/v2/wake?device=SLEEPPAL-PILLOW-01')).toBeNull();
    expect(parseNfcWakeUrl('sleepal://nfc/v1/wake?device=other')).toBeNull();
  });
});
