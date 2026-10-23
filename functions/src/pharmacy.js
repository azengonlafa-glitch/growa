// Pharmacy onboarding, verification, staff and product classification.
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  db, auth, FieldValue, HttpsError,
  requireAuth, requireAdmin, requireStaff,
  str, oneOf, latLng, audit, notify,
} from './common.js';
import { findDirectoryByLicense } from './directory.js';

export const registerPharmacy = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const pharmacy = {
    name: str(d.name, 'ชื่อร้าน', { max: 200 }),
    address: str(d.address, 'ที่อยู่', { max: 500 }),
    phone: str(d.phone, 'เบอร์โทร', { max: 30 }),
    licenseNo: str(d.licenseNo, 'เลขที่ใบอนุญาต', { max: 50 }),
    geo: latLng(d.geo),
    googlePlaceId: str(d.googlePlaceId, 'Google Place ID', { max: 300, optional: true }),
    openingHours: {},
    deliveryZones: [],
    services: [],
    verificationStatus: 'pending',
    ownerUid: uid,
    ratingAvg: null,
    ratingCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Cross-check the licence against FDA open data to help the admin reviewer.
  const fda = await findDirectoryByLicense(pharmacy.licenseNo);
  pharmacy.fdaDirectoryId = fda?.id ?? null;

  const ref = db.collection('pharmacies').doc();
  const user = await auth.getUser(uid);
  const batch = db.batch();
  batch.set(ref, pharmacy);
  batch.set(ref.collection('staff').doc(uid), {
    role: 'owner', displayName: user.displayName ?? user.email ?? 'เจ้าของร้าน',
    licenseNo: null, licenseVerified: false, active: true,
  });
  batch.set(ref.collection('private').doc('verification'), {
    documents: [], submittedAt: null, reviewerNotes: null, requiredChanges: [],
    reviewedBy: null, reviewedAt: null,
  });
  audit(batch, { actorUid: uid, action: 'pharmacy.register', targetPath: ref.path });
  await batch.commit();
  return { pharmacyId: ref.id, licenseFoundInFdaData: pharmacy.fdaDirectoryId !== null };
});

// Owner uploads documents to Storage, writes their paths to private/verification
// (allowed by rules), then calls this to put the application back in the queue.
export const resubmitPharmacy = onCall(async (req) => {
  const uid = requireAuth(req);
  const pharmacyId = str(req.data?.pharmacyId, 'pharmacyId', { max: 128 });
  await requireStaff(pharmacyId, uid, ['owner']);

  const ref = db.doc(`pharmacies/${pharmacyId}`);
  const verRef = ref.collection('private').doc('verification');
  await db.runTransaction(async (tx) => {
    const [ph, ver] = await Promise.all([tx.get(ref), tx.get(verRef)]);
    if (!['pending', 'needs_changes'].includes(ph.data().verificationStatus)) {
      throw new HttpsError('failed-precondition', 'ส่งเอกสารใหม่ได้เฉพาะร้านที่รอตรวจหรือต้องแก้ไข');
    }
    if (!(ver.data()?.documents?.length > 0)) {
      throw new HttpsError('failed-precondition', 'ต้องแนบเอกสารอย่างน้อย 1 ไฟล์');
    }
    tx.update(ref, { verificationStatus: 'pending', updatedAt: FieldValue.serverTimestamp() });
    tx.update(verRef, { submittedAt: FieldValue.serverTimestamp() });
    audit(tx, { actorUid: uid, action: 'pharmacy.resubmit', targetPath: ref.path });
  });
  return { status: 'pending' };
});

export const reviewPharmacy = onCall(async (req) => {
  const uid = requireAdmin(req);
  const d = req.data ?? {};
  const pharmacyId = str(d.pharmacyId, 'pharmacyId', { max: 128 });
  const decision = oneOf(d.decision, 'decision', ['approved', 'needs_changes', 'rejected', 'suspended']);
  const notes = str(d.notes, 'notes', { max: 2000, optional: true });
  const requiredChanges = Array.isArray(d.requiredChanges)
    ? d.requiredChanges.slice(0, 20).map((c) => str(c, 'requiredChanges', { max: 300 }))
    : [];
  if (decision === 'needs_changes' && requiredChanges.length === 0) {
    throw new HttpsError('invalid-argument', 'ต้องระบุสิ่งที่ร้านต้องแก้ไข');
  }

  const ref = db.doc(`pharmacies/${pharmacyId}`);
  await db.runTransaction(async (tx) => {
    const ph = await tx.get(ref);
    if (!ph.exists) throw new HttpsError('not-found', 'ไม่พบร้าน');
    const before = ph.data().verificationStatus;
    tx.update(ref, { verificationStatus: decision, updatedAt: FieldValue.serverTimestamp() });
    tx.update(ref.collection('private').doc('verification'), {
      reviewerNotes: notes, requiredChanges, reviewedBy: uid, reviewedAt: FieldValue.serverTimestamp(),
    });
    const titles = {
      approved: 'ร้านของคุณได้รับการอนุมัติแล้ว',
      needs_changes: 'กรุณาแก้ไขข้อมูลร้าน',
      rejected: 'คำขอเข้าร่วมไม่ได้รับการอนุมัติ',
      suspended: 'ร้านของคุณถูกระงับชั่วคราว',
    };
    notify(tx, ph.data().ownerUid, {
      type: 'pharmacy_review', title: titles[decision],
      body: requiredChanges.length ? requiredChanges.join(' / ') : (notes ?? ''),
    });
    audit(tx, {
      actorUid: uid, action: 'pharmacy.review', targetPath: ref.path,
      before: { verificationStatus: before }, after: { verificationStatus: decision }, reason: notes,
    });
  });
  return { status: decision };
});

export const inviteStaff = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const pharmacyId = str(d.pharmacyId, 'pharmacyId', { max: 128 });
  const role = oneOf(d.role, 'role', ['manager', 'pharmacist', 'staff']);
  const actor = await requireStaff(pharmacyId, uid, ['owner', 'manager']);
  if (role === 'manager' && actor.role !== 'owner') {
    throw new HttpsError('permission-denied', 'เฉพาะเจ้าของร้านที่แต่งตั้งผู้จัดการได้');
  }

  let invitee;
  try {
    invitee = await auth.getUserByEmail(str(d.email, 'อีเมล', { max: 320 }));
  } catch {
    throw new HttpsError('not-found', 'ไม่พบผู้ใช้ที่ใช้อีเมลนี้ ให้สมัครสมาชิกก่อน');
  }
  const ref = db.doc(`pharmacies/${pharmacyId}/staff/${invitee.uid}`);
  const batch = db.batch();
  batch.set(ref, {
    role,
    displayName: invitee.displayName ?? invitee.email,
    licenseNo: role === 'pharmacist' ? str(d.licenseNo, 'เลขใบอนุญาตเภสัชกร', { max: 50 }) : null,
    licenseVerified: false, // only verifyPharmacistLicense (admin) can flip this
    active: true,
  });
  notify(batch, invitee.uid, { type: 'staff_invite', title: 'คุณถูกเพิ่มเป็นพนักงานร้านยา', body: role });
  audit(batch, { actorUid: uid, action: 'staff.invite', targetPath: ref.path, after: { role } });
  await batch.commit();
  return { staffUid: invitee.uid };
});

export const updateStaff = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const pharmacyId = str(d.pharmacyId, 'pharmacyId', { max: 128 });
  const staffUid = str(d.staffUid, 'staffUid', { max: 128 });
  const actor = await requireStaff(pharmacyId, uid, ['owner', 'manager']);

  const ref = db.doc(`pharmacies/${pharmacyId}/staff/${staffUid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'ไม่พบพนักงาน');
  const target = snap.data();
  if (target.role === 'owner') throw new HttpsError('permission-denied', 'แก้ไขสิทธิ์เจ้าของร้านไม่ได้');
  if (target.role === 'manager' && actor.role !== 'owner') {
    throw new HttpsError('permission-denied', 'เฉพาะเจ้าของร้านที่แก้ไขผู้จัดการได้');
  }

  const update = {};
  if (d.active !== undefined) {
    if (typeof d.active !== 'boolean') throw new HttpsError('invalid-argument', 'active ไม่ถูกต้อง');
    update.active = d.active;
  }
  if (d.role !== undefined) {
    update.role = oneOf(d.role, 'role', actor.role === 'owner' ? ['manager', 'pharmacist', 'staff'] : ['pharmacist', 'staff']);
    // A role change resets licence verification; admin must re-check.
    if (update.role !== target.role) update.licenseVerified = false;
  }
  const batch = db.batch();
  batch.update(ref, update);
  audit(batch, { actorUid: uid, action: 'staff.update', targetPath: ref.path, before: target, after: update });
  await batch.commit();
  return { ok: true };
});

export const verifyPharmacistLicense = onCall(async (req) => {
  const uid = requireAdmin(req);
  const d = req.data ?? {};
  const pharmacyId = str(d.pharmacyId, 'pharmacyId', { max: 128 });
  const staffUid = str(d.staffUid, 'staffUid', { max: 128 });
  if (typeof d.verified !== 'boolean') throw new HttpsError('invalid-argument', 'verified ต้องเป็น true/false');

  const ref = db.doc(`pharmacies/${pharmacyId}/staff/${staffUid}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().role !== 'pharmacist') {
    throw new HttpsError('failed-precondition', 'ผู้ใช้นี้ไม่ใช่เภสัชกรของร้าน');
  }
  const batch = db.batch();
  batch.update(ref, { licenseVerified: d.verified });
  notify(batch, staffUid, {
    type: 'license_review',
    title: d.verified ? 'ใบอนุญาตเภสัชกรได้รับการยืนยันแล้ว' : 'ใบอนุญาตเภสัชกรไม่ผ่านการยืนยัน',
    body: '',
  });
  audit(batch, { actorUid: uid, action: 'staff.verifyLicense', targetPath: ref.path, after: { licenseVerified: d.verified } });
  await batch.commit();
  return { ok: true };
});

// Products may only carry the drug class from the master catalog. A product
// whose catalogId is unknown is treated as "needs pharmacist, not deliverable".
export const syncProductClass = onDocumentWritten('pharmacies/{phId}/products/{productId}', async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const product = after.data();
  const catalog = await db.doc(`catalog/${product.catalogId}`).get();
  const want = catalog.exists
    ? {
        drugClass: catalog.data().drugClass,
        requiresPharmacistReview: catalog.data().requiresPharmacistReview === true,
        deliverable: catalog.data().deliverable === true,
      }
    : { drugClass: 'unknown', requiresPharmacistReview: true, deliverable: false };

  const same = Object.entries(want).every(([k, v]) => product[k] === v);
  if (same) return;
  try {
    await after.ref.update(want);
  } catch (err) {
    if (err.code !== 5) throw err; // NOT_FOUND: product deleted meanwhile
  }
});
