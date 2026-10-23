// Starts the Firebase emulators for local development (Ctrl+C to stop).
import { spawnSync } from 'node:child_process';
import { emulatorEnv } from './emulator-env.mjs';

const result = spawnSync(
  'firebase emulators:start --only auth,firestore,functions,storage --project demo-medilink',
  { stdio: 'inherit', shell: true, env: emulatorEnv() },
);
process.exit(result.status ?? 1);
