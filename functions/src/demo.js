// DEMO ONLY: stands in for the pharmacy so one person can click through the whole flow.
//
// This is a deliberate, narrow exception to "only a verified pharmacist approves":
//   - it is off unless running in the emulator or DEMO_SIMULATION=true is set;
//   - it only acts for the caller's own requests, at pharmacies marked `sample: true`
//     (fictional stores with no real pharmacist);
//   - every action is written to the audit log as `demo.*` and the review keeps
//     pharmacistUid "demo-simulator", so it can never be mistaken for a real approval.
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue, Timestamp, HttpsError, requireAuth, str, distanceKm, audit, notify } from './common.js';
import { loadOrder, transition } from './orders.js';

export const DEMO_PHARMACIST = 'demo-simulator';

const enabled = () => process.env.FUNCTIONS_EMULATOR === 'true' || process.env.DEMO_SIMULATION === 'true';

// What the pretend pharmacist approves, by triage outcome (sample data, not clinical guidance).
const DEMO_APPROVALS = {
  allergic_rhinitis: ['cetirizine10'],
  urticaria: ['cetirizine10'],
  gerd: ['omeprazole20'],
  dyspepsia: ['antacid', 'omeprazole20'],
  headache_migraine: ['ibuprofen400'],
  default: ['para500'],
};
const DEMO_QUESTION = 'ขอทราบเพิ่มเติม: ตอนนี้มียาประจำตัวหรือประวัติแพ้ยาที่ต้องระวังไหมคะ (ข้อความจำลอง)';
const DEMO_APPROVAL_NOTE = 'เภสัชกรจำลองอนุมัติแล้ว สั่งยาที่แนะนำได้ภายใน 24 ชั่วโมง (ข้อความจำลอง)';

export function requireDemo() {
  if (!enabled()) throw new HttpsError('failed-precondition', 'โหมดจำลองร้านตอบปิดอยู่ในระบบนี้');
}

// Next simulated pharmacist step for a consultation: first a question, then approval once the user answered.
export const demoPharmacyReview = onCall(async (req) => {
  const uid = requireAuth(req);
  requireDemo();
  const reviewRef = db.doc(`pharmacistReviews/${str(req.data?.reviewId, 'reviewId', { max: 128 })}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(reviewRef);
    if (!snap.exists || snap.data().requestedBy !== uid) throw new HttpsError('not-found', 'ไม่พบคำขอประเมินของคุณ');
    const review = snap.data();
    if (!review.triageId) throw new HttpsError('failed-precondition', 'จำลองได้เฉพาะการปรึกษาจากแบบประเมินอาการ');
    const pharmacy = await tx.get(db.doc(`pharmacies/${review.pharmacyId}`));
    if (pharmacy.data()?.sample !== true) throw new HttpsError('failed-precondition', 'จำลองได้เฉพาะร้านตัวอย่าง');
    if (review.decision !== 'pending') throw new HttpsError('failed-precondition', 'ตอนนี้รอคุณตอบหรือประเมินเสร็จแล้ว');

    const asked = (review.thread ?? []).some((m) => m.role === 'pharmacist');
    const triageRef = db.doc(`triageSessions/${review.triageId}`);
    const triage = await tx.get(triageRef);
    let decision;
    let notes;
    let approvedCatalogIds = [];

    if (!asked) {
      decision = 'need_more_info';
      notes = DEMO_QUESTION;
      tx.update(reviewRef, {
        decision, notes, pharmacistUid: DEMO_PHARMACIST,
        thread: FieldValue.arrayUnion({ by: DEMO_PHARMACIST, role: 'pharmacist', text: notes, at: Timestamp.now() }),
      });
    } else {
      decision = 'approved';
      notes = DEMO_APPROVAL_NOTE;
      const wanted = DEMO_APPROVALS[review.triageResult?.outcomeId] ?? DEMO_APPROVALS.default;
      const products = await Promise.all(wanted.map((id) => tx.get(db.doc(`pharmacies/${review.pharmacyId}/products/${id}`))));
      approvedCatalogIds = wanted.filter((_, i) => products[i].exists && products[i].data().active === true && products[i].data().deliverable === true);
      if (!approvedCatalogIds.length) throw new HttpsError('failed-precondition', 'ร้านนี้ไม่มียาที่จะอนุมัติในโหมดจำลอง');
      tx.update(reviewRef, {
        decision, notes, pharmacistUid: DEMO_PHARMACIST, approvedCatalogIds,
        validUntil: Timestamp.fromMillis(Date.now() + 24 * 3600e3), decidedAt: FieldValue.serverTimestamp(),
      });
    }

    if (triage.exists) tx.update(triageRef, { pharmacistDecision: decision, route: 'pharmacist', updatedAt: FieldValue.serverTimestamp() });
    notify(tx, uid, { type: 'review_pending', title: 'เภสัชกร (จำลอง) ตอบกลับแล้ว', body: notes, patientId: review.patientId });
    audit(tx, { actorUid: uid, action: 'demo.review.simulate', targetPath: reviewRef.path, after: { decision, approvedCatalogIds } });
    return { decision, approvedCatalogIds };
  });
});

const COURIERS = [
  { name: 'คุณสมชาย ใจดี', vehicle: 'มอเตอร์ไซค์' },
  { name: 'คุณวิภา รักไว', vehicle: 'มอเตอร์ไซค์' },
  { name: 'คุณธนากร ส่งตรง', vehicle: 'รถยนต์' },
];

// Moves the caller's own order at a sample pharmacy one step: stock confirmed → preparing → shipping.
// Payment and "received" stay with the buyer, so the money rules in orders.js are untouched:
// it cannot confirm an order that still needs a pharmacist and has no approval attached.
export const demoPharmacyOrder = onCall(async (req) => {
  const uid = requireAuth(req);
  requireDemo();
  return db.runTransaction(async (tx) => {
    const { ref, order } = await loadOrder(tx, req.data?.orderId);
    if (order.placedBy !== uid) throw new HttpsError('not-found', 'ไม่พบคำสั่งซื้อของคุณ');
    const pharmacySnap = await tx.get(db.doc(`pharmacies/${order.pharmacyId}`));
    const pharmacy = pharmacySnap.data();
    if (pharmacy?.sample !== true) throw new HttpsError('failed-precondition', 'จำลองได้เฉพาะร้านตัวอย่าง');

    const note = 'ร้านจำลอง';
    let after;
    if (order.status === 'pharmacy_checking') {
      if (order.needsPharmacistReview && !order.reviewId) {
        throw new HttpsError('failed-precondition', 'ยานี้ต้องผ่านเภสัชกรก่อน ให้ปรึกษาเภสัชกรแล้วสั่งจากผลที่อนุมัติ');
      }
      transition(tx, ref, order, 'awaiting_payment', { actorUid: DEMO_PHARMACIST, note });
      after = 'awaiting_payment';
    } else if (order.status === 'paid') {
      transition(tx, ref, order, 'preparing', { actorUid: DEMO_PHARMACIST, note });
      after = 'preparing';
    } else if (order.status === 'preparing') {
      const km = order.deliveryAddress?.geo && pharmacy.geo ? distanceKm(pharmacy.geo, order.deliveryAddress.geo) : 3;
      const courier = COURIERS[Math.floor(Math.random() * COURIERS.length)];
      const etaMinutes = Math.max(10, Math.round((km / 25) * 60) + 5);
      transition(tx, ref, order, 'shipping', {
        actorUid: DEMO_PHARMACIST, note,
        extra: { delivery: { courier, etaMinutes, distanceKm: Math.round(km * 10) / 10, startedAt: Timestamp.now(), simulated: true } },
      });
      after = 'shipping';
    } else {
      throw new HttpsError('failed-precondition', 'ตอนนี้ไม่มีขั้นตอนของร้านที่ต้องจำลอง');
    }
    audit(tx, { actorUid: uid, action: 'demo.order.simulate', targetPath: ref.path, after: { status: after } });
    return { status: after };
  });
});
