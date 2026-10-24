// Firestore rules tests. Run with: npm run test:rules (needs Java for the emulator)
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

let env;

const db = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

const allPerms = (value) => ({
  viewMeds: value, viewHealth: value, logDoses: value,
  editMeds: value, requestRefill: value, viewOrders: value,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-medilink',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (s) => {
    // mom's profile, owned by mom
    await setDoc(doc(s, 'patients/mom'), {
      ownerUid: 'mom', isSelf: true, displayName: 'คุณแม่', archived: false,
      createdAt: Timestamp.now(),
    });
    await setDoc(doc(s, 'patients/mom/medications/amlo'), {
      name: 'Amlodipine 5 mg', dosePerIntake: 1, unit: 'tablet', times: ['morning'],
      stockOnHand: 30, active: true, updatedAt: Timestamp.now(), updatedBy: 'mom',
      estimatedRemaining: 28,
    });
    await setDoc(doc(s, 'patients/mom/health/profile'), {
      allergies: [{ substance: 'penicillin' }], conditions: ['hypertension'],
      updatedAt: Timestamp.now(), updatedBy: 'mom',
    });
    // daughter invited (not yet accepted), son already active with view-only
    await setDoc(doc(s, 'patients/mom/caregivers/daughter'), {
      caregiverUid: 'daughter', status: 'invited', permissions: allPerms(true),
      grantedBy: 'mom', updatedAt: Timestamp.now(),
    });
    await setDoc(doc(s, 'patients/mom/caregivers/son'), {
      caregiverUid: 'son', status: 'active',
      permissions: { ...allPerms(false), viewMeds: true },
      grantedBy: 'mom', updatedAt: Timestamp.now(),
    });

    // pharmacies
    await setDoc(doc(s, 'pharmacies/ok'), { name: 'ร้านยาดี', verificationStatus: 'approved' });
    await setDoc(doc(s, 'pharmacies/new'), { name: 'ร้านใหม่', verificationStatus: 'pending' });
    await setDoc(doc(s, 'pharmacies/ok/staff/clerk'), { role: 'staff', active: true });
    await setDoc(doc(s, 'pharmacies/ok/staff/pharm'), {
      role: 'pharmacist', active: true, licenseVerified: true,
    });
    await setDoc(doc(s, 'pharmacies/ok/staff/pharmUnverified'), {
      role: 'pharmacist', active: true, licenseVerified: false,
    });

    // orders
    await setDoc(doc(s, 'orders/o1'), {
      placedBy: 'mom', patientId: 'mom', pharmacyId: 'ok', status: 'delivered', total: 120,
    });
    await setDoc(doc(s, 'orders/o2'), {
      placedBy: 'mom', patientId: 'mom', pharmacyId: 'ok', status: 'preparing', total: 80,
    });

    // triage shared with pharmacy "ok"
    await setDoc(doc(s, 'triageSessions/t1'), {
      userUid: 'mom', patientId: 'mom', route: 'pharmacist', sharedWithPharmacyId: 'ok',
    });
  });
});

describe('users', () => {
  test('owner reads and writes own account, nobody else does', async () => {
    await assertSucceeds(setDoc(doc(db('mom'), 'users/mom'), {
      displayName: 'Mom', createdAt: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(db('son'), 'users/mom')));
  });
});

describe('profile setup', () => {
  const about = { birthDate: '1990-05-17', sex: 'female', occupation: 'ครู / อาจารย์', heightCm: 160, weightKg: 54 };
  const profile = (extra = {}) => ({
    allergies: [], conditions: [], notes: '', consent: { shareWithPharmacist: true }, about, history: { currentMeds: ['Folic acid'] },
    updatedAt: serverTimestamp(), updatedBy: 'mom', ...extra,
  });

  test('owner saves detailed health profile; others and bad shapes are refused', async () => {
    await assertSucceeds(setDoc(doc(db('mom'), 'patients/mom/health/profile'), profile()));
    await assertFails(setDoc(doc(db('son'), 'patients/mom/health/profile'), profile({ updatedBy: 'son' })));
    await assertFails(setDoc(doc(db('mom'), 'patients/mom/health/profile'), profile({ about: 'female' })));
    await assertFails(setDoc(doc(db('mom'), 'patients/mom/health/profile'), profile({ history: [] })));
    await assertFails(setDoc(doc(db('mom'), 'patients/mom/health/profile'), profile({ occupation: 'x' }))); // unknown top-level field
  });

  test('details are as private as the rest of the health profile', async () => {
    await seed((s) => setDoc(doc(s, 'patients/mom/health/profile'), { ...profile(), updatedAt: Timestamp.now() }));
    await assertSucceeds(getDoc(doc(db('mom'), 'patients/mom/health/profile')));
    await assertFails(getDoc(doc(db('son'), 'patients/mom/health/profile'))); // caregiver without viewHealth
    await assertFails(getDoc(doc(db('stranger'), 'patients/mom/health/profile')));
    await assertFails(getDoc(doc(db('admin', { admin: true }), 'patients/mom/health/profile')));
  });

  test('finishing setup marks the account; the marker must be a timestamp and only the owner sets it', async () => {
    await seed((s) => setDoc(doc(s, 'users/mom'), { displayName: 'Mom', createdAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(db('mom'), 'users/mom'), { onboardedAt: 'yes' }));
    await assertFails(updateDoc(doc(db('son'), 'users/mom'), { onboardedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db('mom'), 'users/mom'), {
      onboardedAt: serverTimestamp(), phone: '0812345678', emergencyContact: { name: 'ลูกสาว', phone: '0899999999', relation: 'ลูก' },
    }));
  });
});

describe('settings', () => {
  test('owner changes notification choices; nobody else can', async () => {
    await seed((s0) => setDoc(doc(s0, 'users/mom'), { displayName: 'Mom', createdAt: Timestamp.now() }));
    const prefs = { doseReminders: true, refillAlerts: false, orderUpdates: true, familyUpdates: true };
    await assertSucceeds(updateDoc(doc(db('mom'), 'users/mom'), { notificationPrefs: prefs }));
    await assertFails(updateDoc(doc(db('son'), 'users/mom'), { notificationPrefs: prefs }));
  });

  test('owner turns pharmacist sharing off with a partial update, caregivers cannot', async () => {
    const change = (uid) => updateDoc(doc(db(uid), 'patients/mom/health/profile'), {
      consent: { shareWithPharmacist: false, updatedAt: serverTimestamp() }, updatedAt: serverTimestamp(), updatedBy: uid,
    });
    await assertFails(change('son'));
    await assertSucceeds(change('mom'));
  });
});

describe('patients and caregivers', () => {
  test('stranger and platform admin cannot read health data', async () => {
    await assertFails(getDoc(doc(db('stranger'), 'patients/mom/medications/amlo')));
    await assertFails(getDoc(doc(db('admin', { admin: true }), 'patients/mom/health/profile')));
  });

  test('invited caregiver sees nothing until they accept', async () => {
    const d = db('daughter');
    await assertFails(getDoc(doc(d, 'patients/mom/medications/amlo')));
    await assertSucceeds(updateDoc(doc(d, 'patients/mom/caregivers/daughter'), {
      status: 'active', updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(getDoc(doc(d, 'patients/mom/medications/amlo')));
  });

  test('owner cannot skip the caregiver acceptance step', async () => {
    await assertFails(updateDoc(doc(db('mom'), 'patients/mom/caregivers/daughter'), {
      status: 'active', updatedAt: serverTimestamp(),
    }));
  });

  test('caregiver cannot grant themselves more permissions', async () => {
    await assertFails(updateDoc(doc(db('son'), 'patients/mom/caregivers/son'), {
      permissions: allPerms(true), updatedAt: serverTimestamp(),
    }));
  });

  test('caregiver permissions are enforced per action', async () => {
    const s = db('son');
    await assertSucceeds(getDoc(doc(s, 'patients/mom/medications/amlo')));
    await assertFails(getDoc(doc(s, 'patients/mom/health/profile'))); // no viewHealth
    await assertFails(setDoc(doc(s, 'patients/mom/doseLogs/l1'), {   // no logDoses
      medicationId: 'amlo', scheduledFor: Timestamp.now(), status: 'taken',
      loggedBy: 'son', loggedAt: serverTimestamp(),
    }));
  });

  test('caregiver lists the profiles they look after', async () => {
    const s = db('son');
    await assertSucceeds(getDocs(query(
      collectionGroup(s, 'caregivers'), where('caregiverUid', '==', 'son'),
    )));
    await assertFails(getDocs(collectionGroup(s, 'caregivers')));
  });

  test('client cannot write server-computed stock estimate', async () => {
    await assertFails(updateDoc(doc(db('mom'), 'patients/mom/medications/amlo'), {
      estimatedRemaining: 999, updatedAt: serverTimestamp(), updatedBy: 'mom',
    }));
    await assertSucceeds(updateDoc(doc(db('mom'), 'patients/mom/medications/amlo'), {
      stockOnHand: 25, updatedAt: serverTimestamp(), updatedBy: 'mom',
    }));
  });

  test('dose logs are append-only and attributed to the writer', async () => {
    const m = db('mom');
    const log = {
      medicationId: 'amlo', scheduledFor: Timestamp.now(), status: 'missed',
      loggedAt: serverTimestamp(),
    };
    await assertFails(setDoc(doc(m, 'patients/mom/doseLogs/l1'), { ...log, loggedBy: 'son' }));
    await assertSucceeds(setDoc(doc(m, 'patients/mom/doseLogs/l1'), { ...log, loggedBy: 'mom' }));
    await assertFails(updateDoc(doc(m, 'patients/mom/doseLogs/l1'), { status: 'taken' }));
  });
});

describe('pharmacies and products', () => {
  test('only approved pharmacies are public', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'pharmacies/ok')));
    await assertFails(getDoc(doc(anon(), 'pharmacies/new')));
    await assertSucceeds(getDocs(query(
      collection(anon(), 'pharmacies'), where('verificationStatus', '==', 'approved'),
    )));
    await assertFails(getDocs(collection(anon(), 'pharmacies')));
  });

  test('staff cannot set the drug class or approve their own store', async () => {
    const c = db('clerk');
    const product = {
      catalogId: 'para500', name: 'Paracetamol 500 mg', price: 25, currency: 'THB',
      stockStatus: 'in_stock', stockSource: 'manual', active: true,
      stockUpdatedAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(c, 'pharmacies/ok/products/p1'), product));
    await assertFails(setDoc(doc(c, 'pharmacies/ok/products/p2'), {
      ...product, requiresPharmacistReview: false,
    }));
    await assertFails(updateDoc(doc(c, 'pharmacies/ok'), { verificationStatus: 'approved' }));
  });

  test('shop category is limited to the known list', async () => {
    const c = db('clerk');
    const product = {
      catalogId: 'vitc500', name: 'Vitamin C', price: 120, currency: 'THB',
      stockStatus: 'in_stock', stockSource: 'manual', active: true, stockUpdatedAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(c, 'pharmacies/ok/products/p3'), { ...product, category: 'vitamin' }));
    await assertFails(setDoc(doc(c, 'pharmacies/ok/products/p4'), { ...product, category: 'weapons' }));
  });
});

describe('orders, reviews and triage', () => {
  test('clients cannot create or change orders', async () => {
    await assertFails(setDoc(doc(db('mom'), 'orders/o3'), {
      placedBy: 'mom', patientId: 'mom', pharmacyId: 'ok', status: 'paid', total: 0,
    }));
    await assertFails(updateDoc(doc(db('clerk'), 'orders/o2'), { status: 'delivered' }));
  });

  test('orders are visible to buyer, store staff and permitted caregivers only', async () => {
    await assertSucceeds(getDoc(doc(db('mom'), 'orders/o1')));
    await assertSucceeds(getDoc(doc(db('clerk'), 'orders/o1')));
    await assertFails(getDoc(doc(db('son'), 'orders/o1'))); // no viewOrders
    await assertFails(getDoc(doc(db('stranger'), 'orders/o1')));
  });

  test('list queries work for buyer, store staff and patient owner', async () => {
    const orders = (d) => collection(d, 'orders');
    await assertSucceeds(getDocs(query(orders(db('mom')), where('placedBy', '==', 'mom'))));
    await assertSucceeds(getDocs(query(orders(db('clerk')), where('pharmacyId', '==', 'ok'))));
    await assertSucceeds(getDocs(query(orders(db('mom')), where('patientId', '==', 'mom'))));
    await assertFails(getDocs(query(orders(db('stranger')), where('pharmacyId', '==', 'ok'))));
    await assertSucceeds(getDocs(query(collection(db('pharm'), 'pharmacistReviews'), where('pharmacyId', '==', 'ok'))));
    await assertFails(getDocs(query(collection(db('clerk'), 'pharmacistReviews'), where('pharmacyId', '==', 'ok'))));
  });

  test('only a verified pharmacist of the chosen store reads a shared triage', async () => {
    await assertSucceeds(getDoc(doc(db('pharm'), 'triageSessions/t1')));
    await assertFails(getDoc(doc(db('pharmUnverified'), 'triageSessions/t1')));
    await assertFails(getDoc(doc(db('clerk'), 'triageSessions/t1')));
  });

  test('ratings only from the buyer of a delivered order', async () => {
    const rating = (userUid) => ({
      userUid, pharmacyId: 'ok', rating: 5, comment: 'ส่งไว', hidden: false,
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(db('mom'), 'pharmacyRatings/o1'), rating('mom')));
    await assertFails(setDoc(doc(db('mom'), 'pharmacyRatings/o2'), rating('mom'))); // not delivered
    await assertFails(setDoc(doc(db('stranger'), 'pharmacyRatings/o1'), rating('stranger')));
  });
});
