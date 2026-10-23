// End-to-end tests for Cloud Functions, run against the local emulators.
// Calls go through the client SDK exactly as the app will make them.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { initializeApp as initClient, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import {
  connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { seedCatalogAndPharmacies, seedDirectory } from '../scripts/seed-data.mjs';

const PROJECT = 'demo-medilink';
const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

initAdmin({ projectId: PROJECT });
const adminDb = getAdminDb();
const adminAuth = getAdminAuth();
const apps = [];
const run = Date.now().toString(36); // unique ids per run

async function client(name, claims = null) {
  const uid = `${name}-${run}`;
  const email = `${uid}@test.test`;
  const password = 'test-only-password';
  await adminAuth.createUser({ uid, email, password, displayName: name });
  if (claims) await adminAuth.setCustomUserClaims(uid, claims);

  const app = initClient({ projectId: PROJECT, apiKey: 'demo-key' }, uid);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, password);
  const fns = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
  return { uid, email, db, call: async (fn, data) => (await httpsCallable(fns, fn)(data)).data };
}

const rejectsWith = (promise, code) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.code, `functions/${code}`, err.message);
    return true;
  });

async function waitFor(check, label, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const getDoc = async (path) => (await adminDb.doc(path).get()).data();
const NEAR_RX1 = { label: 'บ้าน', line1: 'test', geo: { lat: 13.7639, lng: 100.5375 } }; // ~0.2 km
const FAR_AWAY = { label: 'เชียงใหม่', line1: 'test', geo: { lat: 18.7883, lng: 98.9853 } };

// Signs up a buyer the way the app will: users doc + own patient profile.
async function buyer(name, addresses = [NEAR_RX1]) {
  const c = await client(name);
  const patientId = `${c.uid}-self`;
  await setDoc(doc(c.db, `patients/${patientId}`), {
    ownerUid: c.uid, isSelf: true, displayName: name, archived: false, createdAt: serverTimestamp(),
  });
  await setDoc(doc(c.db, `users/${c.uid}`), {
    displayName: name, email: c.email, addresses, selfPatientId: patientId, createdAt: serverTimestamp(),
  });
  return { ...c, patientId };
}

let admin;
let pharmacist;
let clerk;

before(async () => {
  await seedCatalogAndPharmacies(adminDb);
  await seedDirectory(adminDb);
  admin = await client('admin', { admin: true });
  pharmacist = await client('pharmacist');
  clerk = await client('clerk');
  await adminDb.doc(`pharmacies/demoRx1/staff/${pharmacist.uid}`).set({ role: 'pharmacist', active: true, licenseVerified: true });
  await adminDb.doc(`pharmacies/demoRx1/staff/${clerk.uid}`).set({ role: 'staff', active: true });
});

after(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
});

describe('pharmacy onboarding', () => {
  test('register → needs changes → resubmit → approved, staff licence by admin only', async () => {
    const owner = await client('owner');
    const { pharmacyId } = await owner.call('registerPharmacy', {
      name: 'ร้านทดสอบ', address: 'กทม.', phone: '020000000', licenseNo: 'T-1', geo: { lat: 13.75, lng: 100.5 },
    });
    assert.equal((await getDoc(`pharmacies/${pharmacyId}`)).verificationStatus, 'pending');

    await rejectsWith(owner.call('reviewPharmacy', { pharmacyId, decision: 'approved' }), 'permission-denied');
    await admin.call('reviewPharmacy', { pharmacyId, decision: 'needs_changes', requiredChanges: ['แนบใบอนุญาตที่ชัดขึ้น'] });

    await rejectsWith(owner.call('resubmitPharmacy', { pharmacyId }), 'failed-precondition'); // no documents yet
    await updateDoc(doc(owner.db, `pharmacies/${pharmacyId}/private/verification`), {
      documents: [{ type: 'license', storagePath: `pharmacies/${pharmacyId}/verification/license.pdf` }],
      submittedAt: serverTimestamp(),
    });
    await owner.call('resubmitPharmacy', { pharmacyId });
    await admin.call('reviewPharmacy', { pharmacyId, decision: 'approved' });
    assert.equal((await getDoc(`pharmacies/${pharmacyId}`)).verificationStatus, 'approved');

    const rph = await client('rph');
    await owner.call('inviteStaff', { pharmacyId, email: rph.email, role: 'pharmacist', licenseNo: 'PH-1' });
    assert.equal((await getDoc(`pharmacies/${pharmacyId}/staff/${rph.uid}`)).licenseVerified, false);
    await rejectsWith(owner.call('verifyPharmacistLicense', { pharmacyId, staffUid: rph.uid, verified: true }), 'permission-denied');
    await admin.call('verifyPharmacistLicense', { pharmacyId, staffUid: rph.uid, verified: true });
    assert.equal((await getDoc(`pharmacies/${pharmacyId}/staff/${rph.uid}`)).licenseVerified, true);
  });

  test('product drug class always comes from the catalog', async () => {
    await setDoc(doc(clerk.db, 'pharmacies/demoRx1/products/sneaky'), {
      catalogId: 'loratadine10', name: 'ลอราทาดีน', price: 1, currency: 'THB',
      stockStatus: 'in_stock', stockSource: 'manual', active: true, stockUpdatedAt: serverTimestamp(),
    });
    const p = await waitFor(async () => {
      const d = await getDoc('pharmacies/demoRx1/products/sneaky');
      return d?.drugClass ? d : null;
    }, 'syncProductClass');
    assert.equal(p.requiresPharmacistReview, true);
    assert.equal(p.drugClass, 'dangerous');
  });
});

describe('orders', () => {
  test('pharmacist gate: no payment before approval, then full delivery flow', async () => {
    const mom = await buyer('mom');
    const { orderId, total, needsPharmacistReview } = await mom.call('createOrder', {
      patientId: mom.patientId, pharmacyId: 'demoRx1',
      items: [{ productId: 'loratadine10', qty: 2 }, { productId: 'para500', qty: 1 }],
    });
    assert.equal(total, 60 * 2 + 15 + 30); // server prices + 3 km zone fee
    assert.equal(needsPharmacistReview, true);

    await rejectsWith(mom.call('payOrder', { orderId }), 'failed-precondition');
    const { reviewId } = await clerk.call('pharmacyRespondOrder', { orderId, available: true });
    assert.equal((await getDoc(`orders/${orderId}`)).status, 'awaiting_pharmacist');
    await rejectsWith(mom.call('payOrder', { orderId }), 'failed-precondition');

    // A staff member who is not a verified pharmacist cannot decide.
    await rejectsWith(clerk.call('submitPharmacistReview', { reviewId, decision: 'approved' }), 'permission-denied');

    await pharmacist.call('submitPharmacistReview', { reviewId, decision: 'need_more_info', notes: 'มีอาการแพ้ยาอะไรไหมครับ' });
    assert.equal((await getDoc(`orders/${orderId}`)).status, 'need_more_info');
    await mom.call('answerPharmacistQuestion', { reviewId, answer: 'ไม่มีค่ะ' });
    assert.equal((await getDoc(`orders/${orderId}`)).status, 'awaiting_pharmacist');
    await pharmacist.call('submitPharmacistReview', { reviewId, decision: 'approved' });
    assert.equal((await getDoc(`orders/${orderId}`)).status, 'awaiting_payment');

    await mom.call('payOrder', { orderId, simulateFailure: true });
    assert.equal((await getDoc(`orders/${orderId}`)).status, 'payment_failed');
    await mom.call('payOrder', { orderId });
    await rejectsWith(mom.call('cancelOrder', { orderId }), 'failed-precondition'); // paid

    await clerk.call('updateDelivery', { orderId, to: 'preparing' });
    await clerk.call('updateDelivery', { orderId, to: 'shipping' });
    await mom.call('confirmReceived', { orderId });

    const order = await getDoc(`orders/${orderId}`);
    assert.equal(order.status, 'delivered');
    assert.equal(order.paymentStatus, 'paid');
    const events = await adminDb.collection(`orders/${orderId}/events`).get();
    assert.equal(events.size, 10);

    // Only the buyer of a delivered order can rate, and the average updates.
    await setDoc(doc(mom.db, `pharmacyRatings/${orderId}`), {
      userUid: mom.uid, pharmacyId: 'demoRx1', rating: 5, comment: 'ดีมาก', hidden: false, createdAt: serverTimestamp(),
    });
    await waitFor(async () => (await getDoc('pharmacies/demoRx1')).ratingCount >= 1, 'rating aggregate');
  });

  test('rejected order can never be paid', async () => {
    const buyerA = await buyer('buyerA');
    const { orderId } = await buyerA.call('createOrder', {
      patientId: buyerA.patientId, pharmacyId: 'demoRx1', items: [{ productId: 'ibuprofen400', qty: 1 }],
    });
    const { reviewId } = await clerk.call('pharmacyRespondOrder', { orderId, available: true });
    await pharmacist.call('submitPharmacistReview', { reviewId, decision: 'refer_doctor', notes: 'ควรพบแพทย์' });
    assert.equal((await getDoc(`orders/${orderId}`)).status, 'rejected');
    await rejectsWith(buyerA.call('payOrder', { orderId }), 'failed-precondition');
  });

  test('out of stock, delivery area, controlled drugs and bad input are refused', async () => {
    const b = await buyer('buyerB', [NEAR_RX1, FAR_AWAY]);
    const { orderId } = await b.call('createOrder', {
      patientId: b.patientId, pharmacyId: 'demoRx1', items: [{ productId: 'para500', qty: 1 }],
    });
    await clerk.call('pharmacyRespondOrder', { orderId, available: false, reason: 'ของหมด' });
    assert.equal((await getDoc(`orders/${orderId}`)).status, 'out_of_stock');
    await b.call('cancelOrder', { orderId });

    await rejectsWith(b.call('createOrder', {
      patientId: b.patientId, pharmacyId: 'demoRx1', items: [{ productId: 'para500', qty: 1 }], addressIndex: 1,
    }), 'failed-precondition');
    await rejectsWith(b.call('createOrder', {
      patientId: b.patientId, pharmacyId: 'demoRx1', items: [{ productId: 'diazepam5', qty: 1 }],
    }), 'failed-precondition');
    await rejectsWith(b.call('createOrder', {
      patientId: b.patientId, pharmacyId: 'demoRx1', items: [{ productId: 'para500', qty: 999 }],
    }), 'invalid-argument');
  });

  test('cannot order for someone else without requestRefill', async () => {
    const owner = await buyer('ownerC');
    const stranger = await buyer('strangerC');
    await rejectsWith(stranger.call('createOrder', {
      patientId: owner.patientId, pharmacyId: 'demoRx1', items: [{ productId: 'para500', qty: 1 }],
    }), 'permission-denied');
  });
});

describe('family and refills', () => {
  test('caregiver invite needs acceptance, then refill tops up stock on delivery', async () => {
    const mom = await buyer('momR');
    const daughter = await buyer('daughterR');
    await setDoc(doc(mom.db, `patients/${mom.patientId}/medications/para`), {
      name: 'พาราเซตามอล', catalogId: 'para500', dosePerIntake: 1, unit: 'เม็ด', times: ['morning'],
      stockOnHand: 3, stockCountedAt: serverTimestamp(), active: true,
      updatedAt: serverTimestamp(), updatedBy: mom.uid,
    });

    await mom.call('inviteCaregiver', {
      patientId: mom.patientId, email: daughter.email,
      permissions: { viewMeds: true, requestRefill: true, viewOrders: true },
    });
    const refill = {
      patientId: mom.patientId, pharmacyId: 'demoRx1',
      items: [{ productId: 'para500', qty: 2, medicationId: 'para' }],
    };
    await rejectsWith(daughter.call('createRefillRequest', refill), 'permission-denied'); // not accepted yet
    await updateDoc(doc(daughter.db, `patients/${mom.patientId}/caregivers/${daughter.uid}`), {
      status: 'active', updatedAt: serverTimestamp(),
    });

    const { orderId, needsPharmacistReview } = await daughter.call('createRefillRequest', refill);
    assert.equal(needsPharmacistReview, false);
    assert.equal((await getDoc(`orders/${orderId}`)).placedBy, daughter.uid);
    await clerk.call('pharmacyRespondOrder', { orderId, available: true });
    await daughter.call('payOrder', { orderId });
    for (const to of ['preparing', 'shipping', 'delivered']) await clerk.call('updateDelivery', { orderId, to });

    const med = await getDoc(`patients/${mom.patientId}/medications/para`);
    assert.equal(med.stockOnHand, 3 + 2 * 10);
    const notes = await adminDb.collection(`users/${daughter.uid}/notifications`).where('orderId', '==', orderId).get();
    assert.ok(notes.size > 0, 'caregiver with viewOrders is notified');
  });

  test('low stock raises one refill alert to owner and caregivers', async () => {
    const owner = await buyer('ownerL');
    await adminDb.doc(`patients/${owner.patientId}/medications/amlo`).set({
      name: 'แอมโลดิปีน', dosePerIntake: 1, unit: 'เม็ด', times: ['morning'], stockOnHand: 4,
      stockCountedAt: Timestamp.now(), refillThresholdDays: 7, active: true,
      updatedAt: Timestamp.now(), updatedBy: owner.uid,
    });
    const med = await waitFor(async () => {
      const d = await getDoc(`patients/${owner.patientId}/medications/amlo`);
      return d?.lastCalculatedAt ? d : null;
    }, 'stock recalculation');
    assert.equal(med.estimatedRemaining, 4);
    const alerts = await waitFor(async () => {
      const s = await adminDb.collection(`users/${owner.uid}/notifications`).where('type', '==', 'refill_due').get();
      return s.size ? s : null;
    }, 'refill alert');
    assert.equal(alerts.size, 1);
  });
});

describe('dose schedule logic', () => {
  test('slots follow Bangkok time and unlogged doses notify as "unknown"', async () => {
    const { doseSlots, checkUnloggedDosesAt } = await import('../functions/src/care.js');
    // 2026-10-23 00:00 Bangkok = 2026-10-22T17:00Z
    const day = Date.parse('2026-10-22T17:00:00Z');
    const slots = doseSlots({ times: ['morning', '21:30'] }, day, day + 24 * 3600e3);
    assert.deepEqual(slots.map((s) => new Date(s).toISOString()), ['2026-10-23T01:00:00.000Z', '2026-10-23T14:30:00.000Z']);

    const owner = await buyer('ownerU');
    await adminDb.doc(`patients/${owner.patientId}/medications/m1`).set({
      name: 'ยาทดสอบ', dosePerIntake: 1, times: ['morning'], stockOnHand: 100, active: true,
      stockCountedAt: Timestamp.fromMillis(day), updatedAt: Timestamp.now(), updatedBy: owner.uid,
    });
    await adminDb.doc(`patients/${owner.patientId}/medications/m2`).set({
      name: 'ยาที่บันทึกแล้ว', dosePerIntake: 1, times: ['morning'], stockOnHand: 100, active: true,
      stockCountedAt: Timestamp.fromMillis(day), updatedAt: Timestamp.now(), updatedBy: owner.uid,
    });
    await adminDb.collection(`patients/${owner.patientId}/doseLogs`).add({
      medicationId: 'm2', scheduledFor: Timestamp.fromMillis(slots[0]), status: 'taken',
      loggedBy: owner.uid, loggedAt: FieldValue.serverTimestamp(),
    });

    // 45 minutes after the 08:00 dose.
    await checkUnloggedDosesAt(slots[0] + 45 * 60e3);
    const notes = await adminDb.collection(`users/${owner.uid}/notifications`).where('type', '==', 'dose_unlogged').get();
    assert.equal(notes.size, 1);
    assert.match(notes.docs[0].data().body, /ยาทดสอบ/);
  });
});

describe('FDA pharmacy directory', () => {
  const VICTORY_MONUMENT = { lat: 13.7650, lng: 100.5381 };

  test('nearby licensed pharmacies, closest first, with licence data', async () => {
    const user = await client('dirUser');
    const res = await user.call('searchPharmacyDirectory', { location: VICTORY_MONUMENT, radiusM: 2000 });
    assert.ok(res.places.length > 0, 'found pharmacies');
    assert.ok(res.places.every((p) => p.distanceKm <= 2 && p.licenseNo && p.locationApprox));
    const d = res.places.map((p) => p.distanceKm);
    assert.deepEqual(d, [...d].sort((a, b) => a - b));

    const name = res.places[0].name.split(' ')[0];
    const filtered = await user.call('searchPharmacyDirectory', { location: VICTORY_MONUMENT, radiusM: 2000, query: name });
    assert.ok(filtered.places.every((p) => p.name.includes(name)));
  });

  test('registering with a real licence number is matched to FDA data', async () => {
    const { pharmacies } = JSON.parse(readFileSync('data/pharmacy-directory-bangkok.json', 'utf8'));
    const real = pharmacies[0];
    const owner = await client('dirOwner');
    const base = { name: 'ทดสอบ', address: 'กทม.', phone: '02', geo: real.geo };
    // Written differently from the dataset (dots, extra spaces) on purpose.
    const typed = real.licenseNo.replace('ขย1', 'ขย.1').replace(/ /g, '  ');
    const matched = await owner.call('registerPharmacy', { ...base, licenseNo: typed });
    assert.equal(matched.licenseFoundInFdaData, true);
    const unknown = await owner.call('registerPharmacy', { ...base, licenseNo: 'ขย1 กท 99999/2599' });
    assert.equal(unknown.licenseFoundInFdaData, false);
  });
});

describe('guided symptom checker', () => {
  const pick = (q, text) => q.options.findIndex((o) => o.label.includes(text));

  test('answers one question at a time, can go back, then shares with a pharmacist', async () => {
    const user = await buyer('guidedUser');
    await rejectsWith(user.call('guidedTriageStart', { patientId: user.patientId }), 'failed-precondition');
    let res = await user.call('guidedTriageStart', { patientId: user.patientId, consent: true });
    const { sessionId } = res;
    assert.equal(res.question.nodeId, 'red_flags');

    const answerWith = async (text) => {
      const q = res.question;
      const i = pick(q, text);
      res = await user.call('guidedTriageAnswer', { sessionId, nodeId: q.nodeId, choices: q.type === 'multi' ? [i] : i });
    };
    await answerWith('ไม่มีอาการเหล่านี้');
    await answerWith('65 ปีขึ้นไป');
    res = await user.call('guidedTriageBack', { sessionId });
    assert.equal(res.question.nodeId, 'age');

    // Answering a stale question is refused.
    await rejectsWith(user.call('guidedTriageAnswer', { sessionId, nodeId: 'red_flags', choices: [0] }), 'invalid-argument');

    for (const t of ['18 – 64', 'ชาย', 'ไม่มี', 'ไข้ หวัด', 'เจ็บคอ', 'เจ็บแต่ยัง', 'ไม่เกิน 3 วัน', 'มีไข้ ต่อมทอนซิล']) {
      await answerWith(t);
    }
    assert.equal(res.done, true);
    assert.equal(res.result.outcomeId, 'sore_throat_bacterial');
    assert.equal(res.result.route, 'pharmacist');

    const { reviewId } = await user.call('triageShareWithPharmacy', { sessionId, pharmacyId: 'demoRx1', consent: true });
    const review = await getDoc(`pharmacistReviews/${reviewId}`);
    assert.equal(review.triageId, sessionId);
    assert.ok(review.patientSnapshot, 'pharmacist gets the minimum health context');
    assert.equal(review.triageResult.outcomeId, 'sore_throat_bacterial');
    const session = await getDoc(`triageSessions/${sessionId}`);
    assert.ok(session.summary.questionsForPharmacist.length >= 9, 'pharmacist sees every answer');
  });

  test('health details reach the pharmacist only with the owner\'s consent', async () => {
    const share = async (user) => {
      const res = await user.call('guidedTriageStart', { patientId: user.patientId, consent: true });
      // Shortest path to an outcome: "other" complaint.
      let r = res;
      for (const text of ['ไม่มีอาการเหล่านี้', '18 – 64', 'ชาย', 'ไม่มี', 'อื่น ๆ']) {
        const q = r.question;
        const i = q.options.findIndex((o) => o.label.includes(text));
        r = await user.call('guidedTriageAnswer', { sessionId: res.sessionId, nodeId: q.nodeId, choices: q.type === 'multi' ? [i] : i });
      }
      const { reviewId } = await user.call('triageShareWithPharmacy', { sessionId: res.sessionId, pharmacyId: 'demoRx1', consent: true });
      return (await getDoc(`pharmacistReviews/${reviewId}`)).patientSnapshot;
    };
    const health = (shareWithPharmacist) => ({
      allergies: [{ substance: 'sulfa', reaction: 'ผื่น', severity: 'moderate' }], conditions: ['หอบหืด'],
      notes: '', consent: { shareWithPharmacist }, updatedAt: serverTimestamp(),
    });

    const open = await buyer('healthOpen');
    await setDoc(doc(open.db, `patients/${open.patientId}/health/profile`), { ...health(true), updatedBy: open.uid });
    const shown = await share(open);
    assert.deepEqual(shown.conditions, ['หอบหืด']);
    assert.match(shown.allergies[0], /sulfa/);

    const closed = await buyer('healthClosed');
    await setDoc(doc(closed.db, `patients/${closed.patientId}/health/profile`), { ...health(false), updatedBy: closed.uid });
    const hidden = await share(closed);
    assert.equal(hidden.healthShared, false);
    assert.deepEqual(hidden.allergies, []);
    assert.deepEqual(hidden.conditions, []);
  });

  test('a red flag in the guided checker blocks sharing for purchase', async () => {
    const user = await buyer('guidedUser2');
    const res = await user.call('guidedTriageStart', { patientId: user.patientId, consent: true });
    const i = pick(res.question, 'เจ็บแน่นหน้าอก');
    const out = await user.call('guidedTriageAnswer', { sessionId: res.sessionId, nodeId: 'red_flags', choices: [i] });
    assert.equal(out.result.route, 'emergency');
    await rejectsWith(user.call('triageShareWithPharmacy', { sessionId: res.sessionId, pharmacyId: 'demoRx1', consent: true }), 'failed-precondition');
  });
});

describe('AI triage safety', () => {
  test('consent required; red flags stop the flow without calling the AI', async () => {
    const user = await buyer('triageUser');
    await rejectsWith(user.call('triageStart', { patientId: user.patientId }), 'failed-precondition');
    const { sessionId } = await user.call('triageStart', { patientId: user.patientId, consent: true });

    const { route, reply } = await user.call('triageSendMessage', { sessionId, text: 'เจ็บหน้าอกมาก หายใจไม่ค่อยออก' });
    assert.equal(route, 'emergency');
    assert.match(reply, /1669/);
    assert.equal((await getDoc(`triageSessions/${sessionId}`)).redFlag, true);

    await rejectsWith(user.call('triageShareWithPharmacy', { sessionId, pharmacyId: 'demoRx1', consent: true }), 'failed-precondition');
    await rejectsWith(user.call('triageSendMessage', { sessionId, text: 'ขอซื้อยา' }), 'failed-precondition');
  });

  test('self-harm messages get the mental health hotline', async () => {
    const user = await buyer('triageUser2');
    const { sessionId } = await user.call('triageStart', { patientId: user.patientId, consent: true });
    const { route, reply } = await user.call('triageSendMessage', { sessionId, text: 'ช่วงนี้รู้สึกอยากตาย' });
    assert.equal(route, 'emergency');
    assert.match(reply, /1323/);
  });

  test('shared triage goes to the chosen pharmacist, approval allows ordering', async () => {
    const user = await buyer('triageUser3');
    const { sessionId } = await user.call('triageStart', { patientId: user.patientId, consent: true });
    const { reviewId } = await user.call('triageShareWithPharmacy', { sessionId, pharmacyId: 'demoRx1', consent: true });

    // Pharmacist can read the session through Firestore rules once shared.
    const { getDoc: clientGet } = await import('firebase/firestore');
    assert.ok((await clientGet(doc(pharmacist.db, `triageSessions/${sessionId}`))).exists());

    await pharmacist.call('submitPharmacistReview', {
      reviewId, decision: 'approved', notes: 'ใช้ลอราทาดีนได้วันละ 1 เม็ด', approvedCatalogIds: ['loratadine10'],
    });
    const { needsPharmacistReview } = await user.call('createOrder', {
      patientId: user.patientId, pharmacyId: 'demoRx1', items: [{ productId: 'loratadine10', qty: 1 }], reviewId, triageId: sessionId,
    });
    assert.equal(needsPharmacistReview, false);

    // The approval does not cover other drugs.
    await rejectsWith(user.call('createOrder', {
      patientId: user.patientId, pharmacyId: 'demoRx1', items: [{ productId: 'ibuprofen400', qty: 1 }], reviewId,
    }), 'failed-precondition');
  });
});
