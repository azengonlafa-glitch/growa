// Orders, refills, pharmacist reviews, mock payment and delivery.
import { onCall } from 'firebase-functions/v2/https';
import {
  db, FieldValue, Timestamp, HttpsError,
  requireAuth, requireStaff, requireVerifiedPharmacist, requirePatientAccess,
  str, int, oneOf, distanceKm, audit, notify, activeStaffUids, patientWatchers, patientSnapshot,
} from './common.js';

// ───────────── state machine ─────────────
// See docs/firestore-schema.md. Money is only taken after awaiting_payment,
// which is reachable only once stock is confirmed and any pharmacist gate passed.

const TRANSITIONS = {
  pharmacy_checking: ['out_of_stock', 'awaiting_pharmacist', 'awaiting_payment', 'cancelled'],
  out_of_stock: ['cancelled'],
  awaiting_pharmacist: ['need_more_info', 'awaiting_payment', 'rejected', 'cancelled'],
  need_more_info: ['awaiting_pharmacist', 'cancelled'],
  awaiting_payment: ['paid', 'payment_failed', 'cancelled'],
  payment_failed: ['paid', 'payment_failed', 'cancelled'],
  paid: ['preparing'],
  preparing: ['shipping'],
  shipping: ['delivered', 'delivery_issue'],
  delivery_issue: ['shipping', 'refunded'],
  delivered: [],
  cancelled: [],
  rejected: [],
  refunded: [],
};

const USER_CANCELLABLE = ['pharmacy_checking', 'out_of_stock', 'awaiting_pharmacist', 'need_more_info', 'awaiting_payment', 'payment_failed'];

const STATUS_TEXT = {
  out_of_stock: 'ร้านแจ้งว่าสินค้าไม่พร้อม',
  awaiting_pharmacist: 'รอเภสัชกรประเมิน',
  need_more_info: 'เภสัชกรขอข้อมูลเพิ่มเติม',
  awaiting_payment: 'คำสั่งซื้อได้รับการยืนยัน รอชำระเงิน',
  payment_failed: 'ชำระเงินไม่สำเร็จ',
  paid: 'ชำระเงินแล้ว',
  preparing: 'ร้านกำลังจัดเตรียมยา',
  shipping: 'กำลังจัดส่ง',
  delivered: 'จัดส่งสำเร็จ',
  delivery_issue: 'การจัดส่งมีปัญหา',
  cancelled: 'คำสั่งซื้อถูกยกเลิก',
  rejected: 'เภสัชกรไม่อนุมัติการจ่ายยา',
  refunded: 'คืนเงินแล้ว',
};

// Applies one transition inside `tx`: order update + event + audit + notify buyer.
export function transition(tx, ref, order, to, { actorUid, note = null, extra = {}, notifyUids = null }) {
  if (!TRANSITIONS[order.status]?.includes(to)) {
    throw new HttpsError('failed-precondition', `เปลี่ยนสถานะจาก ${order.status} เป็น ${to} ไม่ได้`);
  }
  tx.update(ref, { status: to, updatedAt: FieldValue.serverTimestamp(), ...extra });
  tx.set(ref.collection('events').doc(), {
    from: order.status, to, by: actorUid, note, at: FieldValue.serverTimestamp(),
  });
  audit(tx, {
    actorUid, action: 'order.transition', targetPath: ref.path,
    before: { status: order.status }, after: { status: to }, reason: note,
  });
  const body = note ? `${STATUS_TEXT[to]}: ${note}` : STATUS_TEXT[to];
  for (const uid of notifyUids ?? [order.placedBy]) {
    notify(tx, uid, { type: 'order_status', title: 'อัปเดตคำสั่งซื้อ', body, orderId: ref.id, patientId: order.patientId });
  }
}

export async function loadOrder(tx, orderId) {
  const ref = db.doc(`orders/${str(orderId, 'orderId', { max: 128 })}`);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new HttpsError('not-found', 'ไม่พบคำสั่งซื้อ');
  return { ref, order: snap.data() };
}

// ───────────── creating orders ─────────────

const MAX_ITEMS = 20;
const MAX_QTY = 10;

// The fictional sample pharmacies deliver anywhere, so a demo never stops at a missing address or "outside the delivery area".
// Real pharmacies keep the strict check: a delivery address with coordinates inside one of their zones.
function addressFor(pharmacy, address) {
  if (pharmacy.sample !== true) return address;
  const base = address ?? { label: 'บ้าน', line1: 'ที่อยู่จำลอง (ข้อมูลจำลอง)' };
  if (base.geo) return base;
  return { ...base, geo: { lat: pharmacy.geo.lat + 0.02, lng: pharmacy.geo.lng + 0.02 } };
}

async function deliveryQuote(pharmacy, address) {
  if (!address?.geo) throw new HttpsError('failed-precondition', 'ที่อยู่จัดส่งยังไม่มีพิกัด');
  const km = distanceKm(pharmacy.geo, address.geo);
  const zones = [...(pharmacy.deliveryZones ?? [])].sort((a, b) => a.radiusKm - b.radiusKm);
  const zone = zones.find((z) => km <= z.radiusKm);
  if (!zone) {
    if (pharmacy.sample === true) return zones.at(-1)?.fee ?? 30;
    throw new HttpsError('failed-precondition', 'ที่อยู่นี้อยู่นอกพื้นที่จัดส่งของร้าน');
  }
  return zone.fee;
}

// A pharmacist review can be reused for an order if it approved every
// review-required drug, for the same patient and store, and has not expired.
async function usableReview(reviewId, { patientId, pharmacyId, catalogIds }) {
  const snap = await db.doc(`pharmacistReviews/${reviewId}`).get();
  if (!snap.exists) return false;
  const r = snap.data();
  return r.decision === 'approved'
    && r.patientId === patientId
    && r.pharmacyId === pharmacyId
    && r.validUntil?.toMillis() > Date.now()
    && catalogIds.every((id) => r.approvedCatalogIds?.includes(id));
}

async function createOrderCore(uid, { source, patientId, pharmacyId, items, addressIndex, reviewId }) {
  // Buying for someone else needs the requestRefill permission.
  await requirePatientAccess(patientId, uid, 'requestRefill');

  const [pharmacySnap, userSnap] = await Promise.all([
    db.doc(`pharmacies/${pharmacyId}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  if (!pharmacySnap.exists || pharmacySnap.data().verificationStatus !== 'approved') {
    throw new HttpsError('failed-precondition', 'ร้านนี้ยังไม่เปิดให้บริการ');
  }
  const pharmacy = pharmacySnap.data();
  const address = addressFor(pharmacy, userSnap.data()?.addresses?.[addressIndex]);
  if (!address) throw new HttpsError('invalid-argument', 'ไม่พบที่อยู่จัดส่ง');
  const deliveryFee = await deliveryQuote(pharmacy, address);

  // Prices and drug classes come from the database, never from the client.
  const productSnaps = await db.getAll(
    ...items.map((i) => db.doc(`pharmacies/${pharmacyId}/products/${i.productId}`)),
  );
  const catalogSnaps = await db.getAll(
    ...productSnaps.map((p) => db.doc(`catalog/${p.data()?.catalogId ?? '_missing_'}`)),
  );

  const lines = items.map((item, i) => {
    const p = productSnaps[i];
    const c = catalogSnaps[i];
    if (!p.exists || p.data().active !== true) throw new HttpsError('failed-precondition', 'มีสินค้าที่ไม่พร้อมขาย');
    if (p.data().stockStatus === 'out_of_stock') throw new HttpsError('failed-precondition', `${p.data().name} หมด`);
    if (!c.exists) throw new HttpsError('failed-precondition', `${p.data().name} ยังไม่มีข้อมูลในฐานข้อมูลยา`);
    const cat = c.data();
    if (cat.deliverable !== true || ['controlled', 'prescription'].includes(cat.drugClass)) {
      throw new HttpsError('failed-precondition', `${p.data().name} สั่งออนไลน์ไม่ได้ กรุณาติดต่อร้านโดยตรง`);
    }
    return {
      productId: p.id,
      catalogId: p.data().catalogId,
      name: p.data().name,
      qty: item.qty,
      unitPrice: p.data().price,
      unitsPerPack: p.data().unitsPerPack ?? null,
      requiresPharmacistReview: cat.requiresPharmacistReview === true,
      medicationId: item.medicationId ?? null,
    };
  });

  const reviewCatalogIds = lines.filter((l) => l.requiresPharmacistReview).map((l) => l.catalogId);
  const needsPharmacistReview = reviewCatalogIds.length > 0;
  let attachedReviewId = null;
  if (needsPharmacistReview && reviewId) {
    if (!(await usableReview(reviewId, { patientId, pharmacyId, catalogIds: reviewCatalogIds }))) {
      throw new HttpsError('failed-precondition', 'ผลประเมินของเภสัชกรใช้กับคำสั่งซื้อนี้ไม่ได้');
    }
    attachedReviewId = reviewId;
  }

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const ref = db.collection('orders').doc();
  const staff = await activeStaffUids(pharmacyId);
  const batch = db.batch();
  batch.set(ref, {
    source, placedBy: uid, patientId, pharmacyId, items: lines,
    subtotal, deliveryFee, total: subtotal + deliveryFee,
    deliveryAddress: address,
    needsPharmacistReview, reviewId: attachedReviewId,
    status: 'pharmacy_checking', paymentStatus: 'none', paymentRef: null,
    cancelReason: null, rejectReason: null,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(ref.collection('events').doc(), {
    from: null, to: 'pharmacy_checking', by: uid, note: source, at: FieldValue.serverTimestamp(),
  });
  for (const s of staff) {
    notify(batch, s, { type: 'order_status', title: 'มีคำสั่งซื้อใหม่', body: `${lines.length} รายการ`, orderId: ref.id });
  }
  audit(batch, { actorUid: uid, action: `order.create.${source}`, targetPath: ref.path, after: { total: subtotal + deliveryFee } });
  await batch.commit();
  return { orderId: ref.id, total: subtotal + deliveryFee, needsPharmacistReview: needsPharmacistReview && !attachedReviewId };
}

function parseItems(raw, { withMedication = false } = {}) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) {
    throw new HttpsError('invalid-argument', `ต้องมีสินค้า 1–${MAX_ITEMS} รายการ`);
  }
  return raw.map((i) => ({
    productId: str(i?.productId, 'productId', { max: 128 }),
    qty: int(i?.qty, 'จำนวน', { min: 1, max: MAX_QTY }),
    ...(withMedication ? { medicationId: str(i?.medicationId, 'medicationId', { max: 128 }) } : {}),
  }));
}

export const createOrder = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  return createOrderCore(uid, {
    source: d.triageId ? 'triage' : 'shop',
    patientId: str(d.patientId, 'patientId', { max: 128 }),
    pharmacyId: str(d.pharmacyId, 'pharmacyId', { max: 128 }),
    items: parseItems(d.items),
    addressIndex: int(d.addressIndex ?? 0, 'addressIndex', { max: 9 }),
    reviewId: str(d.reviewId, 'reviewId', { max: 128, optional: true }),
  });
});

// The user confirms each item on the refill screen; nothing is re-ordered automatically.
export const createRefillRequest = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const patientId = str(d.patientId, 'patientId', { max: 128 });
  const items = parseItems(d.items, { withMedication: true });
  const meds = await db.getAll(...items.map((i) => db.doc(`patients/${patientId}/medications/${i.medicationId}`)));
  if (meds.some((m) => !m.exists || m.data().active !== true)) {
    throw new HttpsError('failed-precondition', 'มียาที่ไม่อยู่ในรายการยาที่ใช้อยู่');
  }
  return createOrderCore(uid, {
    source: 'refill',
    patientId,
    pharmacyId: str(d.pharmacyId, 'pharmacyId', { max: 128 }),
    items,
    addressIndex: int(d.addressIndex ?? 0, 'addressIndex', { max: 9 }),
    reviewId: null,
  });
});

// ───────────── pharmacy side ─────────────

export const pharmacyRespondOrder = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  if (typeof d.available !== 'boolean') throw new HttpsError('invalid-argument', 'available ต้องเป็น true/false');
  const reason = str(d.reason, 'เหตุผล', { max: 500, optional: true });
  if (!d.available && !reason) throw new HttpsError('invalid-argument', 'ต้องระบุเหตุผลเมื่อสินค้าไม่พร้อม');

  return db.runTransaction(async (tx) => {
    const { ref, order } = await loadOrder(tx, d.orderId);
    await requireStaff(order.pharmacyId, uid);

    if (!d.available) {
      transition(tx, ref, order, 'out_of_stock', { actorUid: uid, note: reason });
      return { status: 'out_of_stock' };
    }
    if (order.needsPharmacistReview && !order.reviewId) {
      const reviewRef = db.collection('pharmacistReviews').doc();
      tx.set(reviewRef, {
        orderId: ref.id, triageId: null, pharmacyId: order.pharmacyId, patientId: order.patientId,
        requestedBy: order.placedBy, pharmacistUid: null, decision: 'pending',
        patientSnapshot: await patientSnapshot(order.patientId),
        items: order.items.map((i) => ({ name: i.name, qty: i.qty, requiresPharmacistReview: i.requiresPharmacistReview })),
        reviewCatalogIds: order.items.filter((i) => i.requiresPharmacistReview).map((i) => i.catalogId),
        approvedCatalogIds: [], notes: null, thread: [], validUntil: null,
        createdAt: FieldValue.serverTimestamp(), decidedAt: null,
      });
      transition(tx, ref, order, 'awaiting_pharmacist', { actorUid: uid, extra: { reviewId: reviewRef.id } });
      return { status: 'awaiting_pharmacist', reviewId: reviewRef.id };
    }
    transition(tx, ref, order, 'awaiting_payment', { actorUid: uid });
    return { status: 'awaiting_payment' };
  });
});

const REVIEW_DECISIONS = ['approved', 'rejected', 'refer_doctor', 'need_more_info', 'emergency'];

export const submitPharmacistReview = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const decision = oneOf(d.decision, 'decision', REVIEW_DECISIONS);
  const notes = str(d.notes, 'บันทึกของเภสัชกร', { max: 2000, optional: decision === 'approved' });
  const reviewRef = db.doc(`pharmacistReviews/${str(d.reviewId, 'reviewId', { max: 128 })}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(reviewRef);
    if (!snap.exists) throw new HttpsError('not-found', 'ไม่พบคำขอประเมิน');
    const review = snap.data();
    await requireVerifiedPharmacist(review.pharmacyId, uid);
    if (!['pending', 'need_more_info'].includes(review.decision)) {
      throw new HttpsError('failed-precondition', 'คำขอนี้ประเมินเสร็จแล้ว');
    }

    // Triage reviews approve specific drugs; order reviews approve the order's drugs.
    let approvedCatalogIds = [];
    if (decision === 'approved') {
      approvedCatalogIds = review.orderId
        ? review.reviewCatalogIds
        : (Array.isArray(d.approvedCatalogIds) ? d.approvedCatalogIds.slice(0, 20).map((c) => str(c, 'catalogId', { max: 128 })) : []);
      if (!review.orderId && approvedCatalogIds.length === 0) {
        throw new HttpsError('invalid-argument', 'ต้องระบุยาที่อนุมัติ');
      }
    }

    let orderCtx = null;
    if (review.orderId) orderCtx = await loadOrder(tx, review.orderId);
    const triageSnap = review.triageId ? await tx.get(db.doc(`triageSessions/${review.triageId}`)) : null;

    tx.update(reviewRef, {
      decision, notes, pharmacistUid: uid, approvedCatalogIds,
      validUntil: decision === 'approved' ? Timestamp.fromMillis(Date.now() + 24 * 3600e3) : null,
      decidedAt: FieldValue.serverTimestamp(),
      ...(decision === 'need_more_info' && notes
        ? { thread: FieldValue.arrayUnion({ by: uid, role: 'pharmacist', text: notes, at: Timestamp.now() }) }
        : {}),
    });
    audit(tx, { actorUid: uid, action: 'review.decide', targetPath: reviewRef.path, after: { decision } });

    if (orderCtx) {
      const { ref, order } = orderCtx;
      if (decision === 'approved') {
        transition(tx, ref, order, 'awaiting_payment', { actorUid: uid });
      } else if (decision === 'need_more_info') {
        transition(tx, ref, order, 'need_more_info', { actorUid: uid, note: notes });
      } else {
        transition(tx, ref, order, 'rejected', { actorUid: uid, note: notes, extra: { rejectReason: notes } });
      }
    }

    if (triageSnap) {
      const triageRef = triageSnap.ref;
      tx.update(triageRef, {
        pharmacistDecision: decision,
        route: decision === 'emergency' ? 'emergency' : 'pharmacist',
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(triageRef.collection('messages').doc(), {
        role: 'pharmacist', text: notes ?? 'เภสัชกรอนุมัติแล้ว สามารถสั่งซื้อยาที่ระบุได้ภายใน 24 ชั่วโมง',
        // Sorts after the latest user/assistant pair (see triage.js seq).
        seq: (triageSnap.data().userTurns ?? 0) * 2 + 0.5,
        createdAt: FieldValue.serverTimestamp(),
      });
      notify(tx, review.requestedBy, {
        type: 'review_pending', title: 'เภสัชกรตอบกลับแล้ว', body: notes ?? 'อนุมัติแล้ว', patientId: review.patientId,
      });
    }
    return { decision };
  });
});

// The buyer (or patient owner) answers a pharmacist's question.
export const answerPharmacistQuestion = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const answer = str(d.answer, 'คำตอบ', { max: 2000 });
  const reviewRef = db.doc(`pharmacistReviews/${str(d.reviewId, 'reviewId', { max: 128 })}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(reviewRef);
    if (!snap.exists) throw new HttpsError('not-found', 'ไม่พบคำขอประเมิน');
    const review = snap.data();
    const patient = await tx.get(db.doc(`patients/${review.patientId}`));
    if (review.requestedBy !== uid && patient.data()?.ownerUid !== uid) {
      throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์ตอบคำถามนี้');
    }
    if (review.decision !== 'need_more_info') throw new HttpsError('failed-precondition', 'ไม่มีคำถามที่รอคำตอบ');

    let orderCtx = null;
    if (review.orderId) orderCtx = await loadOrder(tx, review.orderId);

    tx.update(reviewRef, {
      decision: 'pending',
      thread: FieldValue.arrayUnion({ by: uid, role: 'user', text: answer, at: Timestamp.now() }),
    });
    if (orderCtx) {
      const pharmacists = await activeStaffUids(review.pharmacyId, ['pharmacist']);
      transition(tx, orderCtx.ref, orderCtx.order, 'awaiting_pharmacist', { actorUid: uid, notifyUids: pharmacists });
    }
    return { ok: true };
  });
});

// ───────────── payment (mock for the hackathon) ─────────────
// Replace with a real gateway (e.g. Omise/2C2P webhook) before going live.

export const payOrder = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  return db.runTransaction(async (tx) => {
    const { ref, order } = await loadOrder(tx, d.orderId);
    if (order.placedBy !== uid) throw new HttpsError('permission-denied', 'เฉพาะผู้สั่งซื้อที่ชำระเงินได้');
    if (d.simulateFailure === true) {
      transition(tx, ref, order, 'payment_failed', { actorUid: uid, extra: { paymentStatus: 'failed' } });
      return { status: 'payment_failed' };
    }
    const paymentMethod = d.method === undefined ? 'promptpay' : oneOf(d.method, 'ช่องทางชำระเงิน', ['promptpay', 'card', 'banking']);
    const paymentRef = `MOCK-${ref.id.slice(0, 8)}-${Date.now()}`;
    const staff = await activeStaffUids(order.pharmacyId);
    transition(tx, ref, order, 'paid', {
      actorUid: uid,
      extra: { paymentStatus: 'paid', paymentRef, paymentMethod },
      notifyUids: [order.placedBy, ...staff],
    });
    return { status: 'paid', paymentRef, paymentMethod };
  });
});

export const cancelOrder = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const reason = str(d.reason, 'เหตุผล', { max: 500, optional: true });
  return db.runTransaction(async (tx) => {
    const { ref, order } = await loadOrder(tx, d.orderId);
    const patient = await tx.get(db.doc(`patients/${order.patientId}`));
    if (order.placedBy !== uid && patient.data()?.ownerUid !== uid) {
      throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์ยกเลิกคำสั่งซื้อนี้');
    }
    if (!USER_CANCELLABLE.includes(order.status)) {
      throw new HttpsError('failed-precondition', 'คำสั่งซื้อที่ชำระเงินแล้วต้องติดต่อร้านเพื่อขอคืนเงิน');
    }
    const staff = await activeStaffUids(order.pharmacyId);
    transition(tx, ref, order, 'cancelled', {
      actorUid: uid, note: reason, extra: { cancelReason: reason }, notifyUids: [order.placedBy, ...staff],
    });
    return { status: 'cancelled' };
  });
});

// ───────────── delivery ─────────────

const STAFF_DELIVERY_STEPS = ['preparing', 'shipping', 'delivered', 'delivery_issue', 'refunded'];

// On delivery, refill items top up the patient's medication count.
function creditMedicationStock(tx, order) {
  for (const item of order.items) {
    if (!item.medicationId || !item.unitsPerPack) continue;
    tx.update(db.doc(`patients/${order.patientId}/medications/${item.medicationId}`), {
      stockOnHand: FieldValue.increment(item.qty * item.unitsPerPack),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'system:delivery',
    });
  }
}

export const updateDelivery = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const to = oneOf(d.to, 'to', STAFF_DELIVERY_STEPS);
  const note = str(d.note, 'หมายเหตุ', { max: 500, optional: to !== 'delivery_issue' });
  return db.runTransaction(async (tx) => {
    const { ref, order } = await loadOrder(tx, d.orderId);
    await requireStaff(order.pharmacyId, uid);
    const watchers = await patientWatchers(order.patientId, 'viewOrders');
    const notifyUids = [...new Set([order.placedBy, ...watchers])];
    if (to === 'delivered') creditMedicationStock(tx, order);
    transition(tx, ref, order, to, {
      actorUid: uid, note, notifyUids,
      extra: to === 'refunded' ? { paymentStatus: 'refunded' } : {},
    });
    return { status: to };
  });
});

export const confirmReceived = onCall(async (req) => {
  const uid = requireAuth(req);
  return db.runTransaction(async (tx) => {
    const { ref, order } = await loadOrder(tx, req.data?.orderId);
    const patient = await tx.get(db.doc(`patients/${order.patientId}`));
    if (order.placedBy !== uid && patient.data()?.ownerUid !== uid) {
      throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์ยืนยันการรับยา');
    }
    creditMedicationStock(tx, order);
    const staff = await activeStaffUids(order.pharmacyId);
    transition(tx, ref, order, 'delivered', { actorUid: uid, notifyUids: staff });
    return { status: 'delivered' };
  });
});
