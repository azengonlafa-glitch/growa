// Live smoke test: calls the real Google Places API and Claude through the
// local Functions emulator. Uses the keys in functions/.secret.local and costs
// a few API calls per run. Usage: npm run smoke:live
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { emulatorEnv } from './emulator-env.mjs';

if (process.env.LIVE_SMOKE_INNER !== '1') {
  const secrets = existsSync('functions/.secret.local') ? readFileSync('functions/.secret.local', 'utf8') : '';
  const missing = ['GOOGLE_MAPS_API_KEY', 'GEMINI_API_KEY']
    .filter((k) => !new RegExp(`^${k}=\\S+`, 'm').test(secrets));
  if (missing.length) {
    console.error(`Missing in functions/.secret.local: ${missing.join(', ')}`);
    process.exit(1);
  }
  const result = spawnSync(
    'firebase emulators:exec --only auth,firestore,functions --project demo-medilink "node scripts/live-smoke.mjs"',
    { stdio: 'inherit', shell: true, env: { ...emulatorEnv(), LIVE_SMOKE_INNER: '1' } },
  );
  process.exit(result.status ?? 1);
}

// ───────────── runs inside the emulators ─────────────
const { initializeApp: initClient } = await import('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
const { connectFunctionsEmulator, getFunctions, httpsCallable } = await import('firebase/functions');
const { initializeApp: initAdmin } = await import('firebase-admin/app');
const { getAuth: getAdminAuth } = await import('firebase-admin/auth');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const { seedCatalogAndPharmacies } = await import('./seed-data.mjs');

initAdmin({ projectId: 'demo-medilink' });
const db = getFirestore();
await seedCatalogAndPharmacies(db);

const uid = 'live-smoke-user';
const email = 'live-smoke@demo.test';
const password = 'live-smoke-only';
await getAdminAuth().createUser({ uid, email, password, displayName: 'Smoke test' });
await db.doc(`patients/${uid}-self`).set({
  ownerUid: uid, isSelf: true, displayName: 'ผู้ทดสอบ', birthYear: 1995, archived: false,
  createdAt: FieldValue.serverTimestamp(),
});

const app = initClient({ projectId: 'demo-medilink', apiKey: 'demo-key' });
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
await signInWithEmailAndPassword(auth, email, password);
const fns = getFunctions(app, 'asia-southeast1');
connectFunctionsEmulator(fns, '127.0.0.1', 5001);
const call = async (name, data) => (await httpsCallable(fns, name, { timeout: 120_000 })(data)).data;

let failed = false;
const step = async (label, fn) => {
  const t = Date.now();
  try {
    await fn();
    console.log(`✔ ${label} (${Date.now() - t} ms)\n`);
  } catch (err) {
    failed = true;
    console.log(`✖ ${label}: ${err.code ?? ''} ${err.message}\n`);
  }
};

// Victory Monument, Bangkok
const location = { lat: 13.7650, lng: 100.5381 };
let firstPlaceId = null;

await step('searchPharmacies (nearby, 1.5 km)', async () => {
  const res = await call('searchPharmacies', { location, radiusM: 1500 });
  console.log(`  ${res.places.length} pharmacies from ${res.source}`);
  for (const p of res.places.slice(0, 5)) {
    console.log(`  - ${p.name} | ★${p.rating ?? '-'} (${p.userRatingCount}) | open: ${p.openNow ?? '?'}`);
  }
  if (!res.places.length) throw new Error('no results');
  firstPlaceId = res.places[0].placeId;
});

await step('searchPharmacies (text "ร้านขายยา 24 ชั่วโมง")', async () => {
  const res = await call('searchPharmacies', { location, radiusM: 5000, query: 'ร้านขายยา 24 ชั่วโมง' });
  console.log(`  ${res.places.length} results, first: ${res.places[0]?.name ?? '-'}`);
});

await step('getPharmacyPlaceDetails (first result)', async () => {
  if (!firstPlaceId) throw new Error('skipped: no place from search');
  const d = await call('getPharmacyPlaceDetails', { placeId: firstPlaceId });
  console.log(`  ${d.name} | ${d.address}`);
  console.log(`  phone: ${d.phone ?? '-'} | hours: ${d.openingHours[0] ?? '-'}`);
  console.log(`  ${d.reviews.length} reviews`);
  for (const r of d.reviews.slice(0, 2)) {
    console.log(`  - ★${r.rating} ${r.author} (${r.relativeTime}): ${r.text.slice(0, 80).replace(/\s+/g, ' ')}`);
  }
});

const show = (label, res) => console.log(`  [${label}] route=${res.route}\n  ${res.reply.replace(/\n/g, '\n  ')}`);

await step('AI triage: mild symptom over two turns', async () => {
  const { sessionId } = await call('triageStart', { patientId: `${uid}-self`, consent: true });
  show('turn 1', await call('triageSendMessage', { sessionId, text: 'มีน้ำมูกใส จาม คันจมูก มา 2 วันค่ะ' }));
  show('turn 2', await call('triageSendMessage', {
    sessionId, text: 'อายุ 31 ไม่มีโรคประจำตัว ไม่แพ้ยา ไม่ได้ใช้ยาอะไร ไม่มีไข้ อาการไม่หนัก',
  }));
  const s = (await db.doc(`triageSessions/${sessionId}`).get()).data();
  console.log(`  summary for pharmacist: ${JSON.stringify(s.summary)}`);
});

await step('AI triage: risk factor should route to pharmacist', async () => {
  const { sessionId } = await call('triageStart', { patientId: `${uid}-self`, consent: true });
  show('turn 1', await call('triageSendMessage', {
    sessionId, text: 'ตั้งครรภ์ 5 เดือน ปวดหัวมา 1 วัน อยากได้ยาแก้ปวดค่ะ ไม่แพ้ยา',
  }));
});

await step('AI triage: emergency handled before the AI', async () => {
  const { sessionId } = await call('triageStart', { patientId: `${uid}-self`, consent: true });
  show('turn 1', await call('triageSendMessage', { sessionId, text: 'พ่อเจ็บหน้าอก เหงื่อออก หายใจไม่ค่อยออก' }));
});

process.exit(failed ? 1 : 0);
