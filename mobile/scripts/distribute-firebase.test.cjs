const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildFirebaseArgs,
  validateInput,
} = require('./distribute-firebase.cjs');

test('Firebase App Distribution arguments keep APK and tester values as separate argv entries', () => {
  const args = buildFirebaseArgs({
    apkPath: '/tmp/Sleep Pal.apk',
    appId: '1:123:android:abc',
    projectId: 'sleepal-app',
    groups: 'sleepal-testers,qa-team',
    testers: 'tester@example.com',
    releaseNotes: 'BLE preview',
  });

  assert.deepEqual(args.slice(2), [
    'appdistribution:distribute',
    '/tmp/Sleep Pal.apk',
    '--app',
    '1:123:android:abc',
    '--project',
    'sleepal-app',
    '--groups',
    'sleepal-testers,qa-team',
    '--testers',
    'tester@example.com',
    '--release-notes',
    'BLE preview',
  ]);
});

test('input validation requires an existing APK and Firebase App ID', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sleepal-distribution-'));
  const apkPath = path.join(directory, 'sleepal.apk');
  fs.writeFileSync(apkPath, 'fixture');

  assert.throws(() => validateInput(apkPath, {}), /FIREBASE_APP_ID/);
  assert.equal(
    validateInput(apkPath, { FIREBASE_APP_ID: '1:123:android:abc' }).projectId,
    'sleepal-app'
  );
});
