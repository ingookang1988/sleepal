const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FIREBASE_TOOLS_VERSION = '15.28.1';
const DEFAULT_PROJECT_ID = 'sleepal-app';

function usage() {
  return [
    'Usage: npm run distribute:firebase -- <signed.apk>',
    '',
    'Required environment:',
    '  FIREBASE_APP_ID=1:...:android:...',
    '',
    'Optional environment:',
    '  FIREBASE_PROJECT_ID=sleepal-app',
    '  FIREBASE_TESTER_GROUPS=sleepal-testers,qa-team',
    '  FIREBASE_TESTERS=tester@example.com',
    '  FIREBASE_RELEASE_NOTES="SleepPal Android preview"',
  ].join('\n');
}

function buildFirebaseArgs({
  apkPath,
  appId,
  projectId = DEFAULT_PROJECT_ID,
  groups,
  testers,
  releaseNotes,
}) {
  const args = [
    '--yes',
    `firebase-tools@${FIREBASE_TOOLS_VERSION}`,
    'appdistribution:distribute',
    apkPath,
    '--app',
    appId,
    '--project',
    projectId,
  ];

  if (groups) args.push('--groups', groups);
  if (testers) args.push('--testers', testers);
  if (releaseNotes) args.push('--release-notes', releaseNotes);

  return args;
}

function validateInput(apkArgument, env = process.env) {
  if (!apkArgument) throw new Error(`APK path is required.\n\n${usage()}`);

  const apkPath = path.resolve(apkArgument);
  if (path.extname(apkPath).toLowerCase() !== '.apk') {
    throw new Error(`Expected an .apk file: ${apkPath}`);
  }
  if (!fs.existsSync(apkPath) || !fs.statSync(apkPath).isFile()) {
    throw new Error(`APK file does not exist: ${apkPath}`);
  }

  const appId = env.FIREBASE_APP_ID?.trim();
  if (!appId) {
    throw new Error('FIREBASE_APP_ID is required. Copy it from Firebase project settings.');
  }

  return {
    apkPath,
    appId,
    projectId: env.FIREBASE_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID,
    groups: env.FIREBASE_TESTER_GROUPS?.trim(),
    testers: env.FIREBASE_TESTERS?.trim(),
    releaseNotes: env.FIREBASE_RELEASE_NOTES?.trim(),
  };
}

function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return 0;
  }

  let input;
  try {
    input = validateInput(argv[0], env);
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  if (!input.groups && !input.testers) {
    console.warn('No tester group or tester email configured; the release will be uploaded without invitations.');
  }

  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, buildFirebaseArgs(input), {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

module.exports = {
  DEFAULT_PROJECT_ID,
  FIREBASE_TOOLS_VERSION,
  buildFirebaseArgs,
  usage,
  validateInput,
};

if (require.main === module) {
  process.exitCode = main();
}
