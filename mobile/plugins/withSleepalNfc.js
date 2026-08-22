const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

const NFC_ACTION = 'android.nfc.action.NDEF_DISCOVERED';
const NFC_SCHEME = 'sleepal';
const NFC_HOST = 'nfc';
const NFC_PATH_PREFIX = '/v1/wake';

function addUniqueNamedItem(items, name, extra = {}) {
  const list = items || [];
  if (!list.some((item) => item.$?.['android:name'] === name)) {
    list.push({ $: { 'android:name': name, ...extra } });
  }
  return list;
}

module.exports = function withSleepalNfc(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest['uses-permission'] = addUniqueNamedItem(
      manifest['uses-permission'],
      'android.permission.NFC'
    );
    manifest['uses-feature'] = addUniqueNamedItem(
      manifest['uses-feature'],
      'android.hardware.nfc',
      { 'android:required': 'false' }
    );

    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    const filters = mainActivity['intent-filter'] || [];
    const exists = filters.some((filter) =>
      filter.action?.some((action) => action.$?.['android:name'] === NFC_ACTION)
    );

    if (!exists) {
      filters.push({
        action: [{ $: { 'android:name': NFC_ACTION } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{
          $: {
            'android:scheme': NFC_SCHEME,
            'android:host': NFC_HOST,
            'android:pathPrefix': NFC_PATH_PREFIX,
          },
        }],
      });
      mainActivity['intent-filter'] = filters;
    }

    return mod;
  });
};
