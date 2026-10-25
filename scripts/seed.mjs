// Seeds the local emulators with demo data and demo accounts.
// Usage (emulators running): npm run seed
// Always targets the emulators (ports from firebase.json), never a real project.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { bangkokDayStart, doseSlots, DAY_MS } from '../functions/src/schedule.js';
import { seedCatalogAndPharmacies, seedDirectory } from './seed-data.mjs';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

initializeApp({ projectId: 'demo-medilink' });
const db = getFirestore();
const auth = getAuth();

// Local emulator demo accounts only.
const DEMO_PASSWORD = 'demo-medilink';
const ACCOUNTS = [
  { uid: 'demo-mom', email: 'mom@demo.test', displayName: 'คุณแม่ (ทดสอบ)' },
  { uid: 'demo-daughter', email: 'daughter@demo.test', displayName: 'ลูกสาว (ทดสอบ)' },
  { uid: 'demo-pharmacist', email: 'pharmacist@demo.test', displayName: 'ภก. ทดสอบ' },
  { uid: 'demo-admin', email: 'admin@demo.test', displayName: 'ผู้ดูแลระบบ (ทดสอบ)', claims: { admin: true } },
];

for (const a of ACCOUNTS) {
  try {
    await auth.createUser({ uid: a.uid, email: a.email, displayName: a.displayName, password: DEMO_PASSWORD });
  } catch (err) {
    if (err.code !== 'auth/uid-already-exists') throw err;
  }
  if (a.claims) await auth.setCustomUserClaims(a.uid, a.claims);
}

await seedCatalogAndPharmacies(db);
const directoryCount = await seedDirectory(db);

const now = FieldValue.serverTimestamp();
const batch = db.batch();
for (const a of ACCOUNTS.slice(0, 3)) {
  const pid = `${a.uid}-self`;
  batch.set(db.doc(`users/${a.uid}`), {
    displayName: a.displayName, email: a.email, selfPatientId: pid, onboardedAt: now, createdAt: now,
    addresses: [{ label: 'บ้าน', line1: 'ย่านเพชรบุรี–มักกะสัน (ข้อมูลจำลอง)', geo: { lat: 13.7450, lng: 100.5520 } }],
  });
  batch.set(db.doc(`patients/${pid}`), {
    ownerUid: a.uid, isSelf: true, displayName: a.displayName, birthYear: a.uid === 'demo-mom' ? 1958 : 1990,
    archived: false, createdAt: now,
  });
}
batch.set(db.doc('patients/demo-mom-self/health/profile'), {
  allergies: [{ substance: 'penicillin', reaction: 'ผื่น', severity: 'moderate' }],
  conditions: ['ความดันโลหิตสูง'], notes: '', consent: { shareWithPharmacist: true },
  updatedAt: now, updatedBy: 'demo-mom',
});
batch.set(db.doc('patients/demo-mom-self/medications/amlodipine'), {
  name: 'แอมโลดิปีน 5 มก.', catalogId: 'amlodipine5', dosePerIntake: 1, unit: 'เม็ด',
  times: ['morning'], mealRelation: 'after', asNeeded: false, stockOnHand: 6,
  stockCountedAt: now, refillThresholdDays: 7, sourcePharmacyId: 'demoRx1', active: true,
  updatedAt: now, updatedBy: 'demo-mom',
});
batch.set(db.doc('patients/demo-mom-self/medications/metformin'), {
  name: 'เมทฟอร์มิน 500 มก.', catalogId: 'metformin500', dosePerIntake: 1, unit: 'เม็ด',
  times: ['morning', 'evening'], mealRelation: 'after', asNeeded: false, stockOnHand: 40,
  stockCountedAt: now, refillThresholdDays: 7, sourcePharmacyId: 'demoRx1', active: true,
  updatedAt: now, updatedBy: 'demo-mom',
});
batch.set(db.doc('patients/demo-mom-self/medications/simvastatin'), {
  name: 'ซิมวาสแตติน 20 มก.', catalogId: 'simvastatin20', dosePerIntake: 1, unit: 'เม็ด',
  times: ['bedtime'], mealRelation: 'none', asNeeded: false, stockOnHand: 25,
  stockCountedAt: now, refillThresholdDays: 7, active: true,
  updatedAt: now, updatedBy: 'demo-mom',
});

// Sample reviews for the demo store (fictional reviewers, clearly marked).
const SAMPLE_REVIEWS = [
  ['demo-review-1', 5, 'เภสัชกรอธิบายวิธีใช้ยาละเอียดมาก ส่งไว (รีวิวตัวอย่าง)'],
  ['demo-review-2', 4, 'สั่งเติมยาความดันให้คุณแม่สะดวกดี (รีวิวตัวอย่าง)'],
  ['demo-review-3', 5, 'ตอบคำถามเรื่องยาแพ้ได้ดี (รีวิวตัวอย่าง)'],
];
for (const [id, rating, comment] of SAMPLE_REVIEWS) {
  batch.set(db.doc(`orders/${id}`), {
    source: 'shop', placedBy: `${id}-user`, patientId: `${id}-patient`, pharmacyId: 'demoRx1',
    items: [], subtotal: 0, deliveryFee: 0, total: 0, status: 'delivered', paymentStatus: 'paid',
    sample: true, createdAt: now, updatedAt: now,
  });
  batch.set(db.doc(`pharmacyRatings/${id}`), {
    userUid: `${id}-user`, pharmacyId: 'demoRx1', rating, comment, hidden: false, sample: true, createdAt: now,
  });
}

batch.set(db.doc('patients/demo-mom-self/caregivers/demo-daughter'), {
  caregiverUid: 'demo-daughter', caregiverName: 'ลูกสาว (ทดสอบ)', patientDisplayName: 'คุณแม่ (ทดสอบ)',
  status: 'active',
  permissions: { viewMeds: true, viewHealth: true, logDoses: true, editMeds: false, requestRefill: true, viewOrders: true },
  grantedBy: 'demo-mom', createdAt: now, updatedAt: now,
});
batch.set(db.doc('pharmacies/demoRx1/staff/demo-pharmacist'), {
  role: 'pharmacist', displayName: 'ภก. ทดสอบ', licenseNo: 'DEMO-PH-01', licenseVerified: true, active: true,
});
await batch.commit();

// Ten days of dose history for the medication report: mostly on time, some late, a few confirmed misses, skips and
// doses nobody logged (those stay "not logged", never assumed missed). Deterministic, so every run looks the same.
const nowMs = Date.now();
const historyStart = bangkokDayStart(nowMs) - 10 * DAY_MS;
const medIds = ['amlodipine', 'metformin', 'simvastatin'];
const history = db.batch();
medIds.forEach((medId, mi) => {
  history.update(db.doc(`patients/demo-mom-self/medications/${medId}`), { startDate: Timestamp.fromMillis(historyStart) });
  const med = { times: { amlodipine: ['morning'], metformin: ['morning', 'evening'], simvastatin: ['bedtime'] }[medId] };
  doseSlots(med, historyStart, nowMs - 60 * 60e3).forEach((slot, i) => {
    const r = (i * 7 + mi * 3) % 10;
    if (r === 9) return; // nobody logged this one
    const status = i % 23 === 0 ? 'skipped' : r === 8 ? 'missed' : 'taken';
    const delay = r === 7 ? 95 * 60e3 : (10 + ((i * 13) % 30)) * 60e3;
    history.set(db.collection('patients/demo-mom-self/doseLogs').doc(), {
      medicationId: medId, scheduledFor: Timestamp.fromMillis(slot), status,
      loggedBy: i % 4 === 0 ? 'demo-daughter' : 'demo-mom', loggedAt: Timestamp.fromMillis(Math.min(slot + delay, nowMs)),
    });
  });
});
await history.commit();

// Don't depend on emulator triggers being registered yet: compute the stock
// estimates and the demo store's rating summary directly.
// functions/ has its own firebase-admin copy, so use its db instance.
process.env.GCLOUD_PROJECT ??= 'demo-medilink';
const { recalculateMedication } = await import('../functions/src/care.js');
const { db: functionsDb } = await import('../functions/src/common.js');
for (const med of ['amlodipine', 'metformin', 'simvastatin']) {
  await recalculateMedication(functionsDb.doc(`patients/demo-mom-self/medications/${med}`));
}
const ratings = SAMPLE_REVIEWS.map(([, r]) => r);
await db.doc('pharmacies/demoRx1').update({
  ratingAvg: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10,
  ratingCount: ratings.length,
});

console.log(`Seeded catalog, 2 demo partner pharmacies, ${directoryCount} FDA-licensed pharmacies and ${ACCOUNTS.length} demo accounts (password: ${DEMO_PASSWORD}).`);
