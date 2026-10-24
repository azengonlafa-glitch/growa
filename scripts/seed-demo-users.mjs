import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const json = readFileSync('service-account.json', 'utf8');
const account = JSON.parse(json);
initializeApp({ credential: cert(account) });

const auth = getAuth();
const db = getFirestore();

const momUser = await auth.getUserByEmail('mom@demo.test');
const daughterUser = await auth.getUserByEmail('daughter@demo.test');
const pharmacistUser = await auth.getUserByEmail('pharmacist@demo.test');

const now = FieldValue.serverTimestamp();
const batch = db.batch();

// 1. Mom user & self-patient
const momPid = `${momUser.uid}-self`;
batch.set(db.doc(`users/${momUser.uid}`), {
  displayName: 'คุณแม่',
  email: 'mom@demo.test',
  selfPatientId: momPid,
  addresses: [{ label: 'บ้าน', line1: 'ย่านอนุสาวรีย์ชัยฯ (ข้อมูลจำลอง)', geo: { lat: 13.7639, lng: 100.5375 } }],
  createdAt: now,
}, { merge: true });

batch.set(db.doc(`patients/${momPid}`), {
  ownerUid: momUser.uid,
  isSelf: true,
  displayName: 'คุณแม่',
  birthYear: 1958,
  archived: false,
  createdAt: now,
}, { merge: true });

// Mom's health profile
batch.set(db.doc(`patients/${momPid}/health/profile`), {
  allergies: [{ substance: 'penicillin', reaction: 'ผื่น', severity: 'moderate' }],
  conditions: ['ความดันโลหิตสูง'],
  notes: '',
  consent: { shareWithPharmacist: true },
  updatedAt: now,
  updatedBy: momUser.uid,
}, { merge: true });

// Mom's medications
batch.set(db.doc(`patients/${momPid}/medications/amlodipine`), {
  name: 'แอมโลดิปีน 5 มก.',
  catalogId: 'amlodipine5',
  dosePerIntake: 1,
  unit: 'เม็ด',
  times: ['morning'],
  mealRelation: 'after',
  asNeeded: false,
  stockOnHand: 6,
  stockCountedAt: now,
  refillThresholdDays: 7,
  sourcePharmacyId: 'demoRx1',
  active: true,
  updatedAt: now,
  updatedBy: momUser.uid,
}, { merge: true });

batch.set(db.doc(`patients/${momPid}/medications/metformin`), {
  name: 'เมทฟอร์มิน 500 มก.',
  catalogId: 'metformin500',
  dosePerIntake: 1,
  unit: 'เม็ด',
  times: ['morning', 'evening'],
  mealRelation: 'after',
  asNeeded: false,
  stockOnHand: 40,
  stockCountedAt: now,
  refillThresholdDays: 7,
  sourcePharmacyId: 'demoRx1',
  active: true,
  updatedAt: now,
  updatedBy: momUser.uid,
}, { merge: true });

batch.set(db.doc(`patients/${momPid}/medications/simvastatin`), {
  name: 'ซิมวาสแตติน 20 มก.',
  catalogId: 'simvastatin20',
  dosePerIntake: 1,
  unit: 'เม็ด',
  times: ['bedtime'],
  mealRelation: 'none',
  asNeeded: false,
  stockOnHand: 25,
  stockCountedAt: now,
  refillThresholdDays: 7,
  active: true,
  updatedAt: now,
  updatedBy: momUser.uid,
}, { merge: true });

// 2. Daughter user & self-patient & caregiver link
const daughterPid = `${daughterUser.uid}-self`;
batch.set(db.doc(`users/${daughterUser.uid}`), {
  displayName: 'ลูกสาว',
  email: 'daughter@demo.test',
  selfPatientId: daughterPid,
  addresses: [{ label: 'บ้าน', line1: 'ย่านอนุสาวรีย์ชัยฯ (ข้อมูลจำลอง)', geo: { lat: 13.7639, lng: 100.5375 } }],
  createdAt: now,
}, { merge: true });

batch.set(db.doc(`patients/${daughterPid}`), {
  ownerUid: daughterUser.uid,
  isSelf: true,
  displayName: 'ลูกสาว',
  birthYear: 1990,
  archived: false,
  createdAt: now,
}, { merge: true });

batch.set(db.doc(`patients/${momPid}/caregivers/${daughterUser.uid}`), {
  caregiverUid: daughterUser.uid,
  caregiverName: 'ลูกสาว',
  patientDisplayName: 'คุณแม่',
  status: 'active',
  permissions: {
    viewMeds: true,
    viewHealth: true,
    logDoses: true,
    editMeds: false,
    requestRefill: true,
    viewOrders: true,
  },
  grantedBy: momUser.uid,
  createdAt: now,
  updatedAt: now,
}, { merge: true });

// 3. Pharmacist user & staff
const pharmacistPid = `${pharmacistUser.uid}-self`;
batch.set(db.doc(`users/${pharmacistUser.uid}`), {
  displayName: 'เภสัชกร',
  email: 'pharmacist@demo.test',
  selfPatientId: pharmacistPid,
  addresses: [{ label: 'ร้านยา', line1: 'ร้าน demoRx1', geo: { lat: 13.7639, lng: 100.5375 } }],
  createdAt: now,
}, { merge: true });

batch.set(db.doc(`patients/${pharmacistPid}`), {
  ownerUid: pharmacistUser.uid,
  isSelf: true,
  displayName: 'เภสัชกร',
  birthYear: 1988,
  archived: false,
  createdAt: now,
}, { merge: true });

batch.set(db.doc(`pharmacies/demoRx1/staff/${pharmacistUser.uid}`), {
  role: 'pharmacist',
  displayName: 'เภสัชกร (demoRx1)',
  licenseNo: 'DEMO-PH-01',
  licenseVerified: true,
  active: true,
}, { merge: true });

await batch.commit();
console.log('Seeded demo users (mom, daughter, pharmacist) into Firestore successfully!');
