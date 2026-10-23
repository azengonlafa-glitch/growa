// Family caregivers, medication stock estimates and dose reminders.
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  db, auth, FieldValue, Timestamp, HttpsError,
  requireAuth, requirePatientAccess, str, audit, notify, patientWatchers,
} from './common.js';
import { doseSlots, DAY_MS, bangkokClock } from './schedule.js';

export { doseSlots };

// ───────────── caregivers ─────────────

const PERMISSION_KEYS = ['viewMeds', 'viewHealth', 'logDoses', 'editMeds', 'requestRefill', 'viewOrders'];

function parsePermissions(raw, defaults) {
  const perms = { ...defaults };
  for (const key of PERMISSION_KEYS) {
    if (raw?.[key] !== undefined) {
      if (typeof raw[key] !== 'boolean') throw new HttpsError('invalid-argument', `${key} ต้องเป็น true/false`);
      perms[key] = raw[key];
    }
  }
  return perms;
}

const VIEW_ONLY = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, k === 'viewMeds']));

async function userByEmail(email) {
  try {
    return await auth.getUserByEmail(str(email, 'อีเมล', { max: 320 }));
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('not-found', 'ไม่พบผู้ใช้ที่ใช้อีเมลนี้');
  }
}

// Owner invites; the caregiver must accept (rules allow invited -> active only for them).
export const inviteCaregiver = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const patientId = str(d.patientId, 'patientId', { max: 128 });
  const patient = await db.doc(`patients/${patientId}`).get();
  if (!patient.exists || patient.data().ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'เฉพาะเจ้าของข้อมูลที่เชิญผู้ดูแลได้');
  }
  const invitee = await userByEmail(d.email);
  if (invitee.uid === uid) throw new HttpsError('invalid-argument', 'เชิญตัวเองไม่ได้');

  const ref = db.doc(`patients/${patientId}/caregivers/${invitee.uid}`);
  const existing = await ref.get();
  if (existing.exists && ['active', 'invited'].includes(existing.data().status)) {
    throw new HttpsError('already-exists', 'ผู้ใช้นี้เป็นผู้ดูแลหรือได้รับคำเชิญอยู่แล้ว');
  }
  const owner = await auth.getUser(uid);
  const batch = db.batch();
  batch.set(ref, {
    caregiverUid: invitee.uid,
    caregiverName: invitee.displayName ?? invitee.email,
    patientDisplayName: patient.data().displayName,
    status: 'invited',
    permissions: parsePermissions(d.permissions, VIEW_ONLY),
    grantedBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  notify(batch, invitee.uid, {
    type: 'caregiver_change',
    title: 'คำเชิญเป็นผู้ดูแล',
    body: `${owner.displayName ?? owner.email} เชิญคุณช่วยดูแลการใช้ยาของ ${patient.data().displayName}`,
    patientId,
  });
  audit(batch, { actorUid: uid, action: 'caregiver.invite', targetPath: ref.path });
  await batch.commit();
  return { status: 'invited' };
});

// A would-be caregiver asks the owner (found by email) for access to their own profile.
export const requestCaregiverAccess = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const owner = await userByEmail(d.ownerEmail);
  if (owner.uid === uid) throw new HttpsError('invalid-argument', 'ขอสิทธิ์จากตัวเองไม่ได้');
  const ownerUser = await db.doc(`users/${owner.uid}`).get();
  const patientId = ownerUser.data()?.selfPatientId;
  if (!patientId) throw new HttpsError('failed-precondition', 'ผู้ใช้นี้ยังไม่ได้ตั้งค่าโปรไฟล์');

  const ref = db.doc(`patients/${patientId}/caregivers/${uid}`);
  const existing = await ref.get();
  if (existing.exists && ['active', 'invited', 'requested'].includes(existing.data().status)) {
    throw new HttpsError('already-exists', 'มีคำขอหรือสิทธิ์อยู่แล้ว');
  }
  const patient = await db.doc(`patients/${patientId}`).get();
  const me = await auth.getUser(uid);
  const batch = db.batch();
  batch.set(ref, {
    caregiverUid: uid,
    caregiverName: me.displayName ?? me.email,
    patientDisplayName: patient.data().displayName,
    status: 'requested',
    // The owner decides the final scope when approving.
    permissions: parsePermissions(d.permissions, VIEW_ONLY),
    grantedBy: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  notify(batch, owner.uid, {
    type: 'caregiver_change',
    title: 'มีคำขอเป็นผู้ดูแล',
    body: `${me.displayName ?? me.email} ขอสิทธิ์ช่วยดูแลการใช้ยาของคุณ`,
    patientId,
  });
  audit(batch, { actorUid: uid, action: 'caregiver.request', targetPath: ref.path });
  await batch.commit();
  return { status: 'requested' };
});

// Called by the app after it changes a caregiver link (accept, approve,
// decline, revoke): tells both sides once per status.
export const afterCaregiverChange = onCall(async (req) => {
  const uid = requireAuth(req);
  const patientId = str(req.data?.patientId, 'patientId', { max: 128 });
  const caregiverUid = str(req.data?.caregiverUid, 'caregiverUid', { max: 128 });
  const ref = db.doc(`patients/${patientId}/caregivers/${caregiverUid}`);
  const [patient, link] = await Promise.all([db.doc(`patients/${patientId}`).get(), ref.get()]);
  const ownerUid = patient.data()?.ownerUid;
  if (!link.exists || (uid !== ownerUid && uid !== caregiverUid)) {
    throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์');
  }
  const cg = link.data();
  const text = {
    active: 'สิทธิ์ผู้ดูแลเริ่มใช้งานแล้ว',
    declined: 'คำขอหรือคำเชิญถูกปฏิเสธ',
    revoked: 'สิทธิ์ผู้ดูแลถูกยกเลิก',
  }[cg.status];
  if (!text || cg.notifiedStatus === cg.status) return { ok: true };
  const batch = db.batch();
  for (const to of new Set([ownerUid, caregiverUid])) {
    notify(batch, to, {
      type: 'caregiver_change', title: text,
      body: `${cg.caregiverName} · ${cg.patientDisplayName}`, patientId,
    });
  }
  batch.update(ref, { notifiedStatus: cg.status });
  await batch.commit();
  return { ok: true };
});

// ───────────── stock estimates (schedule math is in schedule.js) ─────────────

// Conservative estimate: every scheduled dose since the last count is assumed
// taken unless a log says skipped/missed, so refill alerts err on the early side.
export async function recalculateMedication(medRef) {
  const snap = await medRef.get();
  if (!snap.exists) return;
  const med = snap.data();
  if (med.active !== true) return;
  const countedAt = med.stockCountedAt?.toMillis?.() ?? med.updatedAt?.toMillis?.() ?? Date.now();
  const now = Date.now();

  const logs = await medRef.parent.parent.collection('doseLogs')
    .where('medicationId', '==', snap.id)
    .where('scheduledFor', '>=', Timestamp.fromMillis(countedAt))
    .get();

  let consumedDoses;
  if (med.asNeeded) {
    consumedDoses = logs.docs.filter((l) => l.data().status === 'taken').length;
  } else {
    const notTaken = new Set(
      logs.docs.filter((l) => ['skipped', 'missed'].includes(l.data().status))
        .map((l) => l.data().scheduledFor.toMillis()),
    );
    consumedDoses = doseSlots(med, countedAt, now).filter((s) => !notTaken.has(s)).length;
  }

  const remaining = Math.max(0, med.stockOnHand - consumedDoses * med.dosePerIntake);
  const dailyUse = med.asNeeded ? 0 : (med.times?.length ?? 0) * med.dosePerIntake;
  const runOut = dailyUse > 0 ? Timestamp.fromMillis(now + (remaining / dailyUse) * DAY_MS) : null;

  const update = {
    estimatedRemaining: remaining,
    estimatedRunOutDate: runOut,
    lastCalculatedAt: FieldValue.serverTimestamp(),
  };

  // Alert once per stock level: a new count (stockOnHand differs from the
  // level we alerted at) starts a new alert cycle.
  const threshold = med.refillThresholdDays ?? 7;
  const due = runOut && runOut.toMillis() - now <= threshold * DAY_MS;
  const alreadyAlerted = med.refillAlertedAt && med.refillAlertStock === med.stockOnHand;
  const batch = db.batch();
  if (due && !alreadyAlerted) {
    update.refillAlertedAt = FieldValue.serverTimestamp();
    update.refillAlertStock = med.stockOnHand;
    const patientId = medRef.parent.parent.id;
    const days = Math.max(0, Math.floor((runOut.toMillis() - now) / DAY_MS));
    for (const uid of await patientWatchers(patientId, 'viewMeds')) {
      notify(batch, uid, {
        type: 'refill_due', title: 'ยาใกล้หมด',
        body: `${med.name} เหลือประมาณ ${remaining} ${med.unit ?? ''} (ราว ${days} วัน) — ค่าประมาณ`,
        patientId,
      });
    }
  }
  batch.update(medRef, update);
  try {
    await batch.commit();
  } catch (err) {
    if (err.code !== 5) throw err; // NOT_FOUND: medication deleted meanwhile
  }
}

// The app calls these right after its own writes (instead of Firestore
// triggers, which do not exist when the API runs on Vercel). Both are
// idempotent, so a repeated call is harmless.

export const afterMedicationWrite = onCall(async (req) => {
  const uid = requireAuth(req);
  const patientId = str(req.data?.patientId, 'patientId', { max: 128 });
  await requirePatientAccess(patientId, uid, 'viewMeds');
  const medicationId = str(req.data?.medicationId, 'medicationId', { max: 128 });
  await recalculateMedication(db.doc(`patients/${patientId}/medications/${medicationId}`));
  return { ok: true };
});

export const afterDoseLog = onCall(async (req) => {
  const uid = requireAuth(req);
  const patientId = str(req.data?.patientId, 'patientId', { max: 128 });
  await requirePatientAccess(patientId, uid, 'viewMeds');
  const logRef = db.doc(`patients/${patientId}/doseLogs/${str(req.data?.logId, 'logId', { max: 128 })}`);
  const logSnap = await logRef.get();
  if (!logSnap.exists) throw new HttpsError('not-found', 'ไม่พบบันทึกการรับประทานยา');
  const log = logSnap.data();
  const medRef = db.doc(`patients/${patientId}/medications/${log.medicationId}`);
  await recalculateMedication(medRef);

  // A confirmed miss is different from "not logged yet": tell caregivers explicitly, once.
  if (log.status === 'missed' && !log.missedNotified) {
    const med = await medRef.get();
    const batch = db.batch();
    for (const watcher of await patientWatchers(patientId, 'viewMeds')) {
      if (watcher === log.loggedBy) continue;
      notify(batch, watcher, {
        type: 'dose_missed', title: 'ยืนยันว่าพลาดมื้อยา',
        body: `${med.data()?.name ?? 'ยา'} มื้อ ${bangkokClock(log.scheduledFor.toMillis())} น.`,
        patientId,
      });
    }
    batch.update(logRef, { missedNotified: true });
    await batch.commit();
  }
  return { ok: true };
});

export async function recalculateAllMedications() {
  const meds = await db.collectionGroup('medications').where('active', '==', true).get();
  for (const m of meds.docs) await recalculateMedication(m.ref);
  return meds.size;
}

export const dailyStockRecalc = onSchedule({ schedule: 'every day 06:00', timeZone: 'Asia/Bangkok' }, async () => {
  await recalculateAllMedications();
});

// Runs every 30 min and looks at slots due 30–60 min ago that have no log.
// Each slot falls in exactly one window; the notification id also dedupes reruns.
export async function checkUnloggedDosesAt(nowMs) {
  const from = nowMs - 60 * 60e3;
  const to = nowMs - 30 * 60e3;
  const meds = await db.collectionGroup('medications').where('active', '==', true).get();
  for (const m of meds.docs) {
    const med = m.data();
    const patientId = m.ref.parent.parent.id;
    for (const slot of doseSlots(med, from, to)) {
      const logs = await db.collection(`patients/${patientId}/doseLogs`)
        .where('medicationId', '==', m.id)
        .where('scheduledFor', '==', Timestamp.fromMillis(slot))
        .limit(1).get();
      if (!logs.empty) continue;
      const batch = db.batch();
      for (const uid of await patientWatchers(patientId, 'viewMeds')) {
        notify(batch, uid, {
          type: 'dose_unlogged', title: 'ยังไม่ได้บันทึกการรับประทานยา',
          body: `${med.name} — ยังไม่ทราบว่ารับประทานแล้วหรือยัง`,
          patientId,
        }, `unlogged_${patientId}_${m.id}_${slot}`);
      }
      await batch.commit();
    }
  }
}

export const checkUnloggedDoses = onSchedule({ schedule: 'every 30 minutes', timeZone: 'Asia/Bangkok' }, async () => {
  await checkUnloggedDosesAt(Date.now());
});
