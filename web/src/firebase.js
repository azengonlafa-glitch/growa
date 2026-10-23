// Firebase client.
// - Local demo (npm run demo): talks to the emulators, functions via httpsCallable.
// - Production (Vercel): real Firebase project from VITE_FIREBASE_* env vars,
//   functions via the Vercel API route /api/call/<name>.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const env = import.meta.env;
export const isProduction = Boolean(env.VITE_FIREBASE_API_KEY);

const app = initializeApp(isProduction
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }
  : { projectId: 'demo-medilink', apiKey: 'demo-key', authDomain: 'localhost' });

export const auth = getAuth(app);
export const db = getFirestore(app);
const functions = isProduction ? null : getFunctions(app, 'asia-southeast1');

if (!isProduction) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

// Calls a backend function and returns its data. Errors carry the server's
// Thai message and a "functions/<status>" code, the same in both modes.
export async function call(name, data = {}) {
  if (!isProduction) {
    const res = await httpsCallable(functions, name, { timeout: 120_000 })(data);
    return res.data;
  }
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api/call/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const err = new Error(body.error?.message ?? 'เกิดข้อผิดพลาด');
    err.code = `functions/${body.error?.status ?? 'internal'}`;
    throw err;
  }
  return body.result;
}
