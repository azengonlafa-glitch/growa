// Account deletion and pharmacy rating summaries.
import { onCall } from 'firebase-functions/v2/https';
import { AggregateField } from 'firebase-admin/firestore';
import { db, auth, FieldValue, HttpsError, requireAuth, audit, str } from './common.js';

// Deletes the user's health profiles, caregiver links and account.
// Orders stay (pharmacies must keep dispensing records) but lose the link to
// the deleted profile's contact details.
export const deleteAccount = onCall(async (req) => {
  const uid = requireAuth(req);
  if (req.data?.confirm !== 'DELETE') {
    throw new HttpsError('invalid-argument', 'ต้องยืนยันด้วย confirm: "DELETE"');
  }

  const owned = await db.collection('pharmacies').where('ownerUid', '==', uid)
    .where('verificationStatus', 'in', ['pending', 'needs_changes', 'approved', 'suspended']).limit(1).get();
  if (!owned.empty) {
    throw new HttpsError('failed-precondition', 'โอนหรือปิดร้านที่คุณเป็นเจ้าของก่อนลบบัญชี');
  }

  const [patients, links, orders] = await Promise.all([
    db.collection('patients').where('ownerUid', '==', uid).get(),
    db.collectionGroup('caregivers').where('caregiverUid', '==', uid).get(),
    db.collection('orders').where('placedBy', '==', uid).get(),
  ]);

  for (const p of patients.docs) await db.recursiveDelete(p.ref);
  const batch = db.batch();
  for (const l of links.docs) batch.delete(l.ref);
  for (const o of orders.docs) batch.update(o.ref, { deliveryAddress: null, placedByDeleted: true });
  audit(batch, { actorUid: uid, action: 'account.delete', targetPath: `users/${uid}` });
  await batch.commit();
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await auth.deleteUser(uid);
  return { ok: true };
});

// Recomputes a pharmacy's rating summary. Called by the app after it writes
// a rating (Vercel has no Firestore triggers); idempotent.
export async function refreshPharmacyRating(pharmacyId) {
  const agg = await db.collection('pharmacyRatings')
    .where('pharmacyId', '==', pharmacyId)
    .where('hidden', '==', false)
    .aggregate({ avg: AggregateField.average('rating'), count: AggregateField.count() })
    .get();
  const { avg, count } = agg.data();
  const pharmacyRef = db.doc(`pharmacies/${pharmacyId}`);
  if (!(await pharmacyRef.get()).exists) return;
  await pharmacyRef.update({
    ratingAvg: avg === null ? null : Math.round(avg * 10) / 10,
    ratingCount: count,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export const afterRating = onCall(async (req) => {
  requireAuth(req);
  const orderId = str(req.data?.orderId, 'orderId', { max: 128 });
  const order = await db.doc(`orders/${orderId}`).get();
  if (!order.exists) throw new HttpsError('not-found', 'ไม่พบคำสั่งซื้อ');
  await refreshPharmacyRating(order.data().pharmacyId);
  return { ok: true };
});
