// One command for the hackathon demo: emulators + demo data + web app.
//   npm run demo   →  open http://localhost:5180   (Ctrl+C stops everything)
import { spawn, spawnSync } from 'node:child_process';
import { emulatorEnv } from './emulator-env.mjs';

const children = [];
const start = (cmd, opts = {}) => {
  const child = spawn(cmd, { stdio: 'inherit', shell: true, ...opts });
  children.push(child);
  return child;
};

function stopAll() {
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // shell: true wraps the process; kill the whole tree.
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGINT');
  }
}
process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });

async function waitForFunctions(timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch('http://127.0.0.1:4400/emulators');
      const list = await res.json();
      if (list.functions && list.firestore && list.auth) {
        // Functions are listed before their code finishes loading; give it a moment.
        await new Promise((r) => setTimeout(r, 3000));
        return;
      }
    } catch {
      // hub not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('emulators did not start in time');
}

const emulators = start('firebase emulators:start --only auth,firestore,functions --project demo-medilink', { env: emulatorEnv() });
emulators.on('exit', (code) => { if (code) { console.error('emulators exited'); stopAll(); process.exit(code); } });

await waitForFunctions();
const seed = spawnSync('node scripts/seed.mjs', { stdio: 'inherit', shell: true });
if (seed.status !== 0) { stopAll(); process.exit(1); }

// web/src/firebase.js talks to the real Firebase project unless told otherwise.
start('npm --prefix web run dev', { env: { ...process.env, VITE_USE_EMULATOR: 'true' } });
console.log('\n  MediLink demo:  http://localhost:5180\n  Demo accounts are on the login page. Ctrl+C to stop.\n');
