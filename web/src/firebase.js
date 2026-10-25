// Firebase client.
// - Local demo (npm run demo): talks to the emulators, functions via httpsCallable.
// - Production (Vercel): real Firebase project from VITE_FIREBASE_* env vars,
//   functions via the Vercel API route /api/call/<name>.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const env = import.meta.env;
const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const useEmulator = env.VITE_USE_EMULATOR === 'true' || (isLocalhost && env.VITE_FIREBASE_API_KEY === 'emulator');

// Defaults are the current project's public web config, so a build without VITE_FIREBASE_* (a preview deployment, a fresh
// clone) still talks to the same project as the API; a different project here makes every call fail with "sign in first".
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyB35StV9a4UEY-JscGUgQhBw74uMATHdEY',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'ham-suchivit.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'ham-suchivit',
  appId: env.VITE_FIREBASE_APP_ID || '1:863362642381:web:65d1d11210ec47b6fc1484',
};

export const isProduction = !useEmulator;

const app = initializeApp(useEmulator
  ? { projectId: 'demo-medilink', apiKey: 'demo-key', authDomain: 'localhost' }
  : firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
const functions = useEmulator ? getFunctions(app, 'asia-southeast1') : null;

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

// A signed-in page whose token the server no longer accepts (a session left over from another project, or an emulator that was
// reset) is no use to anyone: refresh the token once, and if it is still refused, sign out so the login screen opens.
const SESSION_EXPIRED = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
// A demo account (public password) is simply signed in again, so a presentation carries on instead of stopping at the login screen.
async function renewDemoSession() {
  const email = auth.currentUser?.email ?? '';
  if (!email.endsWith('@demo.test')) return false;
  try {
    await signOut(auth);
    await signInWithEmailAndPassword(auth, email, 'demo-medilink');
    return true;
  } catch { return false; }
}

async function endStaleSession() {
  try { await signOut(auth); } catch { /* already signed out */ }
  const err = new Error(SESSION_EXPIRED);
  err.code = 'functions/unauthenticated';
  throw err;
}

// Calls a backend function and returns its data. Errors carry the server's
// Thai message and a "functions/<status>" code, the same in both modes.
export async function call(name, data = {}) {
  if (!isProduction) {
    try {
      const res = await httpsCallable(functions, name, { timeout: 120_000 })(data);
      return res.data;
    } catch (err) {
      if (err?.code === 'functions/unauthenticated' && auth.currentUser) {
        if (await renewDemoSession()) return (await httpsCallable(functions, name, { timeout: 120_000 })(data)).data;
        await endStaleSession();
      }
      throw err;
    }
  }
  const send = async (forceRefresh) => {
    const token = await auth.currentUser?.getIdToken(forceRefresh).catch(() => null);
    const res = await fetch(`/api/call/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ data }),
    });
    return { res, body: await res.json().catch(() => ({})) };
  };
  let { res, body } = await send(false);
  if (body.error?.status === 'unauthenticated' && auth.currentUser) {
    ({ res, body } = await send(true));
    if (body.error?.status === 'unauthenticated') {
      if (await renewDemoSession()) ({ res, body } = await send(true));
      if (body.error?.status === 'unauthenticated') await endStaleSession();
    }
  }
  if (!res.ok || body.error) {
    const err = new Error(body.error?.message ?? 'เกิดข้อผิดพลาด');
    err.code = `functions/${body.error?.status ?? 'internal'}`;
    throw err;
  }
  return body.result;
}
