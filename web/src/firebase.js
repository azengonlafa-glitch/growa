// Firebase client wired to the local emulators (demo project, no real keys).
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const app = initializeApp({ projectId: 'demo-medilink', apiKey: 'demo-key', authDomain: 'localhost' });

export const auth = getAuth(app);
export const db = getFirestore(app);
const functions = getFunctions(app, 'asia-southeast1');

connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectFunctionsEmulator(functions, '127.0.0.1', 5001);

// Calls a Cloud Function and returns its data; errors keep the server's Thai message.
export async function call(name, data = {}) {
  const res = await httpsCallable(functions, name, { timeout: 120_000 })(data);
  return res.data;
}
