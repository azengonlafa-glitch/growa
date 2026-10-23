// Environment for running the Firebase emulators.
// - Windows: the emulator's JVM can fail with "Unable to establish loopback
//   connection" when its Unix-socket temp dir is unusable, so point it at a
//   short project-local folder.
// - Shells opened before Java was installed may not have it on PATH yet, so
//   add a Temurin JDK from the default install location when one exists.
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function javaPath() {
  if (spawnSync('java', ['-version'], { stdio: 'ignore', shell: true }).status === 0) return null;
  const root = 'C:\\Program Files\\Eclipse Adoptium';
  if (process.platform !== 'win32' || !existsSync(root)) return null;
  const jdk = readdirSync(root).filter((d) => d.startsWith('jdk')).sort().pop();
  return jdk ? join(root, jdk) : null;
}

export function emulatorEnv() {
  const socketDir = resolve('.jtmp');
  mkdirSync(socketDir, { recursive: true });
  const env = {
    ...process.env,
    JAVA_TOOL_OPTIONS: `${process.env.JAVA_TOOL_OPTIONS ?? ''} -Djdk.net.unixdomain.tmpdir=${socketDir}`.trim(),
  };
  const jdk = javaPath();
  if (jdk) {
    env.JAVA_HOME = jdk;
    const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
    env[key] = `${join(jdk, 'bin')}${delimiter}${env[key]}`;
  }
  return env;
}
