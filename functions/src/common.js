// Shared helpers for growa Cloud Functions.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

// Must run before any function is defined; every module imports this file first.
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 });

// On Firebase/emulators credentials come from the environment. On Vercel the
// service-account JSON is provided in FIREBASE_SERVICE_ACCOUNT.
if (getApps().length === 0) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  initializeApp(sa ? { credential: cert(JSON.parse(sa)) } : undefined);
}

export const db = getFirestore();
export const auth = getAuth();
export { FieldValue, Timestamp, HttpsError };

// ───────────── auth & roles ─────────────

export function requireAuth(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
  return req.auth.uid;
}

export function requireAdmin(req) {
  const uid = requireAuth(req);
  if (req.auth.token.admin !== true) throw new HttpsError('permission-denied', 'สำหรับผู้ดูแลแพลตฟอร์มเท่านั้น');
  return uid;
}

export async function getStaff(pharmacyId, uid) {
  const snap = await db.doc(`pharmacies/${pharmacyId}/staff/${uid}`).get();
  return snap.exists && snap.data().active === true ? snap.data() : null;
}

export async function requireStaff(pharmacyId, uid, roles = null) {
  const staff = await getStaff(pharmacyId, uid);
  if (!staff || (roles && !roles.includes(staff.role))) {
    throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์ดำเนินการในร้านนี้');
  }
  return staff;
}

export async function requireVerifiedPharmacist(pharmacyId, uid) {
  const staff = await requireStaff(pharmacyId, uid, ['pharmacist']);
  if (staff.licenseVerified !== true) {
    throw new HttpsError('permission-denied', 'ใบอนุญาตเภสัชกรยังไม่ได้รับการยืนยัน');
  }
  return staff;
}

// Returns { patient, isOwner } when uid is the owner or an active caregiver
// holding `perm`; throws otherwise. Pass perm = null to accept any active caregiver.
export async function requirePatientAccess(patientId, uid, perm) {
  const patientSnap = await db.doc(`patients/${patientId}`).get();
  if (!patientSnap.exists) throw new HttpsError('not-found', 'ไม่พบโปรไฟล์ผู้ป่วย');
  const patient = { id: patientSnap.id, ...patientSnap.data() };
  if (patient.ownerUid === uid) return { patient, isOwner: true };

  const cg = await db.doc(`patients/${patientId}/caregivers/${uid}`).get();
  const ok = cg.exists
    && cg.data().status === 'active'
    && (perm === null || cg.data().permissions?.[perm] === true);
  if (!ok) throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์เข้าถึงโปรไฟล์นี้');
  return { patient, isOwner: false };
}

// ───────────── validation ─────────────

export function str(value, name, { max = 500, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw new HttpsError('invalid-argument', `ต้องระบุ ${name}`);
  }
  if (typeof value !== 'string' || value.length > max) {
    throw new HttpsError('invalid-argument', `${name} ไม่ถูกต้อง`);
  }
  return value.trim();
}

export function int(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpsError('invalid-argument', `${name} ต้องเป็นจำนวนเต็ม ${min}–${max}`);
  }
  return value;
}

export function oneOf(value, name, allowed) {
  if (!allowed.includes(value)) {
    throw new HttpsError('invalid-argument', `${name} ต้องเป็นหนึ่งใน ${allowed.join(', ')}`);
  }
  return value;
}

export function latLng(value, name = 'ตำแหน่ง') {
  const ok = value
    && typeof value.lat === 'number' && value.lat >= -90 && value.lat <= 90
    && typeof value.lng === 'number' && value.lng >= -180 && value.lng <= 180;
  if (!ok) throw new HttpsError('invalid-argument', `${name} ไม่ถูกต้อง`);
  return { lat: value.lat, lng: value.lng };
}

export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// ───────────── side effects ─────────────

// `writer` is a Transaction or WriteBatch so the audit entry commits atomically
// with the change it records.
export function audit(writer, { actorUid, action, targetPath, before = null, after = null, reason = null }) {
  writer.set(db.collection('auditLogs').doc(), {
    actorUid, action, targetPath, before, after, reason,
    at: FieldValue.serverTimestamp(),
  });
}

// docId makes a notification idempotent (scheduled jobs may re-run).
export function notify(writer, uid, { type, title, body, patientId = null, orderId = null }, docId = null) {
  const ref = docId
    ? db.doc(`users/${uid}/notifications/${docId}`)
    : db.collection(`users/${uid}/notifications`).doc();
  writer.set(ref, {
    type, title, body, patientId, orderId,
    createdAt: FieldValue.serverTimestamp(),
    readAt: null,
  });
}

// uids of the patient owner plus active caregivers holding `perm`.
export async function patientWatchers(patientId, perm) {
  const [patientSnap, cgSnap] = await Promise.all([
    db.doc(`patients/${patientId}`).get(),
    db.collection(`patients/${patientId}/caregivers`).where('status', '==', 'active').get(),
  ]);
  const uids = new Set();
  if (patientSnap.exists) uids.add(patientSnap.data().ownerUid);
  for (const d of cgSnap.docs) if (d.data().permissions?.[perm] === true) uids.add(d.id);
  return [...uids];
}

// Minimum health context a pharmacist needs, copied into the review so the
// pharmacist never gets read access to the patient's whole profile.
export async function patientSnapshot(patientId) {
  const [patient, health, meds] = await Promise.all([
    db.doc(`patients/${patientId}`).get(),
    db.doc(`patients/${patientId}/health/profile`).get(),
    db.collection(`patients/${patientId}/medications`).where('active', '==', true).get(),
  ]);
  const birthYear = patient.data()?.birthYear;
  const h = health.data() ?? {};
  // The owner can opt out of sharing health details (default: shared).
  const shared = h.consent?.shareWithPharmacist !== false;
  return {
    displayName: patient.data()?.displayName ?? null,
    age: birthYear ? new Date().getFullYear() - birthYear : null,
    healthShared: shared,
    allergies: shared ? (h.allergies ?? []).map((a) => [a.substance, a.reaction].filter(Boolean).join(' – ')) : [],
    conditions: shared ? h.conditions ?? [] : [],
    currentMeds: shared ? meds.docs.map((m) => m.data().name) : [],
  };
}

export async function activeStaffUids(pharmacyId, roles = null) {
  const snap = await db.collection(`pharmacies/${pharmacyId}/staff`).where('active', '==', true).get();
  return snap.docs.filter((d) => !roles || roles.includes(d.data().role)).map((d) => d.id);
}
