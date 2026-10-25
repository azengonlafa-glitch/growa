// Houses: one shared "home" per family (e.g. "บ้านคุณย่าสมศรี"). Everyone in a house can see and manage the
// profiles that belong to it, so several relatives can look after the same patient instead of one person doing it all.
//
// A person is in at most one house. The house document holds the member uids (rules read it), the 8-digit invite code
// and the reminder settings. Clients never write the member list or the code; these callables do, after checking who
// is asking. Joining by code is rate limited so the code cannot be guessed by trying numbers.
import { randomInt } from 'node:crypto';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  auth, db, FieldValue, HttpsError, Timestamp, notify, requireAuth, str,
} from './common.js';
import { doseSlots } from './schedule.js';

export const DEFAULT_SETTINGS = { overdueAfterMin: 30, repeatEveryMin: 30, maxRepeats: 3 };
const ATTEMPT_LIMIT = 8;
const ATTEMPT_WINDOW_MS = 10 * 60e3;

const newCode = () => String(randomInt(0, 1e8)).padStart(8, '0');

async function uniqueCode() {
  for (let i = 0; i < 10; i += 1) {
    const code = newCode();
    const taken = await db.collection('houses').where('inviteCode', '==', code).limit(1).get();
    if (taken.empty) return code;
  }
  throw new HttpsError('unavailable', 'สร้างรหัสเชิญไม่สำเร็จ ลองอีกครั้ง');
}

async function houseOf(uid) {
  const snap = await db.collection('houses').where('memberUids', 'array-contains', uid).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

async function requireMember(houseId, uid) {
  const snap = await db.doc(`houses/${houseId}`).get();
  if (!snap.exists || !snap.data().memberUids?.includes(uid)) throw new HttpsError('permission-denied', 'ไม่ได้เป็นสมาชิกของบ้านนี้');
  return snap;
}

async function selfPatientId(uid) {
  const u = await db.doc(`users/${uid}`).get();
  return u.data()?.selfPatientId ?? `${uid}-self`;
}

async function displayNameOf(uid, fallback = 'สมาชิก') {
  const u = await db.doc(`users/${uid}`).get();
  return u.data()?.displayName || fallback;
}

// Own profile joins/leaves the house together with its person.
async function linkSelfPatient(uid, houseId) {
  const ref = db.doc(`patients/${await selfPatientId(uid)}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.update(houseId ? { houseId } : { houseId: FieldValue.delete() });
}

export const createHouse = onCall(async (req) => {
  const uid = requireAuth(req);
  const name = str(req.data?.name, 'ชื่อบ้าน', { max: 60 }).trim();
  if (!name) throw new HttpsError('invalid-argument', 'ต้องตั้งชื่อบ้าน');
  if (await houseOf(uid)) throw new HttpsError('failed-precondition', 'คุณอยู่ในบ้านแล้ว ออกจากบ้านเดิมก่อนจึงสร้างบ้านใหม่ได้');
  const ref = db.collection('houses').doc();
  const memberName = await displayNameOf(uid);
  const batch = db.batch();
  batch.set(ref, {
    name, ownerUid: uid, memberUids: [uid], inviteCode: await uniqueCode(),
    settings: { ...DEFAULT_SETTINGS }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(ref.collection('members').doc(uid), { displayName: memberName, role: 'owner', joinedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  await linkSelfPatient(uid, ref.id);
  return { houseId: ref.id };
});

// Counts a try against the caller; too many wrong codes in a short time are refused.
async function takeAttempt(uid) {
  const ref = db.doc(`houseJoinAttempts/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const d = snap.data();
    const fresh = !d || now - d.windowStart > ATTEMPT_WINDOW_MS;
    const count = fresh ? 1 : d.count + 1;
    if (count > ATTEMPT_LIMIT) throw new HttpsError('resource-exhausted', 'ลองรหัสบ่อยเกินไป รออีกสักครู่แล้วลองใหม่');
    tx.set(ref, { count, windowStart: fresh ? now : d.windowStart });
  });
}

export const joinHouse = onCall(async (req) => {
  const uid = requireAuth(req);
  const code = String(req.data?.code ?? '').replace(/\s|-/g, '');
  if (!/^\d{8}$/.test(code)) throw new HttpsError('invalid-argument', 'รหัสเชิญต้องเป็นตัวเลข 8 หลัก');
  if (await houseOf(uid)) throw new HttpsError('failed-precondition', 'คุณอยู่ในบ้านแล้ว ออกจากบ้านเดิมก่อนจึงเข้าร่วมบ้านใหม่ได้');
  await takeAttempt(uid);
  const found = await db.collection('houses').where('inviteCode', '==', code).limit(1).get();
  if (found.empty) throw new HttpsError('not-found', 'ไม่พบบ้านที่ใช้รหัสนี้ ตรวจรหัสแล้วลองใหม่');
  const house = found.docs[0];
  const name = await displayNameOf(uid);
  await house.ref.update({ memberUids: FieldValue.arrayUnion(uid), updatedAt: FieldValue.serverTimestamp() });
  await house.ref.collection('members').doc(uid).set({ displayName: name, role: 'member', joinedAt: FieldValue.serverTimestamp() });
  await linkSelfPatient(uid, house.id);
  const batch = db.batch();
  for (const other of house.data().memberUids) {
    notify(batch, other, { type: 'house_change', title: 'มีสมาชิกใหม่เข้าบ้าน', body: `${name} เข้าร่วม ${house.data().name}` });
  }
  await batch.commit();
  return { houseId: house.id, name: house.data().name };
});

export const regenerateInviteCode = onCall(async (req) => {
  const uid = requireAuth(req);
  const houseId = str(req.data?.houseId, 'houseId', { max: 128 });
  const house = await requireMember(houseId, uid);
  if (house.data().ownerUid !== uid) throw new HttpsError('permission-denied', 'เฉพาะเจ้าของบ้านเปลี่ยนรหัสเชิญได้');
  const inviteCode = await uniqueCode();
  await house.ref.update({ inviteCode, updatedAt: FieldValue.serverTimestamp() });
  return { inviteCode };
});

// The owner invites someone by email. A registered user gets an invitation in their notifications (carrying the invite
// code, so accepting is the same as joining by code). The answer is the same whether or not the email has an account, so
// the form cannot be used to find out who uses growa.
export const inviteToHouse = onCall(async (req) => {
  const uid = requireAuth(req);
  const houseId = str(req.data?.houseId, 'houseId', { max: 128 });
  const email = str(req.data?.email, 'อีเมล', { max: 200 }).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError('invalid-argument', 'รูปแบบอีเมลไม่ถูกต้อง');
  const house = await requireMember(houseId, uid);
  if (house.data().ownerUid !== uid) throw new HttpsError('permission-denied', 'เฉพาะเจ้าของบ้านเชิญด้วยอีเมลได้');
  let invitee = null;
  try { invitee = await auth.getUserByEmail(email); } catch (err) { if (err.code !== 'auth/user-not-found') throw err; }
  if (invitee && invitee.uid !== uid && !house.data().memberUids.includes(invitee.uid)) {
    const owner = await displayNameOf(uid);
    const ref = db.collection(`users/${invitee.uid}/notifications`).doc();
    await ref.set({
      type: 'house_invite', title: 'ชวนเข้าบ้าน',
      body: `${owner} ชวนคุณเข้า "${house.data().name}"`,
      houseId, houseCode: house.data().inviteCode, patientId: null, orderId: null,
      createdAt: FieldValue.serverTimestamp(), readAt: null,
    });
  }
  return { ok: true };
});

async function detach(houseRef, memberUid) {
  await houseRef.update({ memberUids: FieldValue.arrayRemove(memberUid), updatedAt: FieldValue.serverTimestamp() });
  await houseRef.collection('members').doc(memberUid).delete();
  await linkSelfPatient(memberUid, null);
}

export const leaveHouse = onCall(async (req) => {
  const uid = requireAuth(req);
  const houseId = str(req.data?.houseId, 'houseId', { max: 128 });
  const house = await requireMember(houseId, uid);
  const others = house.data().memberUids.filter((m) => m !== uid);
  if (house.data().ownerUid === uid && others.length) {
    throw new HttpsError('failed-precondition', 'เจ้าของบ้านต้องเอาสมาชิกคนอื่นออกก่อน หรือโอนความเป็นเจ้าของ จึงจะออกได้');
  }
  await detach(house.ref, uid);
  if (!others.length) await house.ref.delete(); // last one out closes the house (profiles stay with their owners)
  return { ok: true };
});

export const removeMember = onCall(async (req) => {
  const uid = requireAuth(req);
  const houseId = str(req.data?.houseId, 'houseId', { max: 128 });
  const memberUid = str(req.data?.memberUid, 'memberUid', { max: 128 });
  const house = await requireMember(houseId, uid);
  if (house.data().ownerUid !== uid) throw new HttpsError('permission-denied', 'เฉพาะเจ้าของบ้านเอาสมาชิกออกได้');
  if (memberUid === uid) throw new HttpsError('invalid-argument', 'ใช้ปุ่มออกจากบ้านแทน');
  if (!house.data().memberUids.includes(memberUid)) throw new HttpsError('not-found', 'ไม่พบสมาชิกคนนี้');
  await detach(house.ref, memberUid);
  const batch = db.batch();
  notify(batch, memberUid, { type: 'house_change', title: 'คุณถูกเอาออกจากบ้าน', body: house.data().name });
  await batch.commit();
  return { ok: true };
});

// ───────────── overdue doses ─────────────
// A dose with no log is "not logged yet", never "missed" (only a person can confirm a miss). When a slot stays unlogged for
// `overdueAfterMin` the whole house is told, and again every `repeatEveryMin` (up to `maxRepeats` more times, 0 = no repeat).
// Each (slot, round) has its own notification id, so running the sweep twice never sends twice.

export async function sweepOverdueDosesAt(nowMs, houseIds = null) {
  const houses = houseIds
    ? (await Promise.all(houseIds.map((id) => db.doc(`houses/${id}`).get()))).filter((s) => s.exists)
    : (await db.collection('houses').get()).docs;
  let sent = 0;
  for (const h of houses) {
    const house = h.data();
    const s = { ...DEFAULT_SETTINGS, ...(house.settings ?? {}) };
    const after = s.overdueAfterMin * 60e3;
    const repeat = s.repeatEveryMin * 60e3;
    const patients = await db.collection('patients').where('houseId', '==', h.id).get();
    for (const p of patients.docs) {
      if (p.data().archived) continue;
      const meds = await p.ref.collection('medications').where('active', '==', true).get();
      for (const m of meds.docs) {
        const med = m.data();
        // Look back far enough to cover the last repeat round, never further than a day.
        const lookback = Math.min(24 * 3600e3, after + repeat * s.maxRepeats + 60e3);
        for (const slot of doseSlots(med, nowMs - lookback, nowMs - after + 1)) {
          const logs = await p.ref.collection('doseLogs')
            .where('medicationId', '==', m.id).where('scheduledFor', '==', Timestamp.fromMillis(slot)).limit(1).get();
          if (!logs.empty) continue;
          const late = nowMs - slot - after; // ≥ 0 here
          const round = repeat > 0 ? Math.min(s.maxRepeats, Math.floor(late / repeat)) : 0;
          const minutes = Math.round((nowMs - slot) / 60e3);
          const id = `overdue_${p.id}_${m.id}_${slot}_${round}`;
          // notify() overwrites an existing id, which would turn an already-read message back into unread.
          if ((await db.doc(`users/${house.memberUids[0]}/notifications/${id}`).get()).exists) continue;
          const batch = db.batch();
          for (const uid of house.memberUids) {
            notify(batch, uid, {
              type: 'dose_overdue', title: round ? `เตือนซ้ำ: ยังไม่ได้บันทึกการกินยา (${p.data().displayName})` : `เลยเวลากินยาแล้ว: ${p.data().displayName}`,
              body: `${med.name} เลยกำหนดมา ${minutes} นาที ยังไม่ทราบว่ากินแล้วหรือยัง`, patientId: p.id,
            }, id);
          }
          await batch.commit();
          sent += house.memberUids.length;
        }
      }
    }
  }
  return sent;
}

// The app calls this while someone has it open, so houses get their reminders even without a server scheduler.
// `simulateNowMs` lets a demo pretend it is another moment, to show the reminders without waiting. It works only where
// the demo simulators are allowed (emulator, or DEMO_SIMULATION=true), exactly like the pharmacy simulators.
const simulationAllowed = () => process.env.FUNCTIONS_EMULATOR === 'true' || process.env.DEMO_SIMULATION === 'true';

export const checkOverdueDoses = onCall(async (req) => {
  const uid = requireAuth(req);
  const house = await houseOf(uid);
  if (!house) return { sent: 0 };
  let now = Date.now();
  if (req.data?.simulateNowMs !== undefined) {
    if (!simulationAllowed()) throw new HttpsError('failed-precondition', 'โหมดจำลองเวลาปิดอยู่ในระบบนี้');
    const t = Number(req.data.simulateNowMs);
    if (!Number.isFinite(t) || Math.abs(t - now) > 36 * 3600e3) throw new HttpsError('invalid-argument', 'เวลาที่จำลองต้องอยู่ใกล้เวลาปัจจุบัน');
    now = t;
  }
  return { sent: await sweepOverdueDosesAt(now, [house.id]) };
});

export const sweepOverdueDoses = onSchedule({ schedule: 'every 15 minutes', timeZone: 'Asia/Bangkok' }, async () => {
  await sweepOverdueDosesAt(Date.now());
});
