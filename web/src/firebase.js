// Firebase client.
// - Local demo (npm run demo): talks to the emulators, functions via httpsCallable.
// - Production (Vercel): real Firebase project from VITE_FIREBASE_* env vars,
//   functions via the Vercel API route /api/call/<name>.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const env = import.meta.env;
const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const useEmulator = env.VITE_USE_EMULATOR === 'true' || (isLocalhost && env.VITE_FIREBASE_API_KEY === 'emulator');

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyBqhF0FuMXPrgIrAcrKDdDuAy9UU0WZfXY',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'secret-e67bc.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'secret-e67bc',
  appId: env.VITE_FIREBASE_APP_ID || '1:492222675222:web:43059db315e5875efdf837',
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
      if (err?.code === 'functions/unauthenticated' && auth.currentUser) await endStaleSession();
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
    if (body.error?.status === 'unauthenticated') await endStaleSession();
  }
  if (!res.ok || body.error) {
    const err = new Error(body.error?.message ?? 'เกิดข้อผิดพลาด');
    err.code = `functions/${body.error?.status ?? 'internal'}`;
    throw err;
  }
  return body.result;
}
