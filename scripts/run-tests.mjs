// Runs all tests inside the Firebase emulators.
// Pass test files as arguments to run a subset.
import { spawnSync } from 'node:child_process';
import { emulatorEnv } from './emulator-env.mjs';

const files = process.argv.slice(2).length
  ? process.argv.slice(2).join(' ')
  : 'tests/symptom-tree.test.js tests/rules.test.js tests/storage.test.js tests/functions.test.js';

const result = spawnSync(
  `firebase emulators:exec --only auth,firestore,functions,storage --project demo-medilink "node --test --test-concurrency=1 ${files}"`,
  { stdio: 'inherit', shell: true, env: emulatorEnv() },
);
process.exit(result.status ?? 1);
