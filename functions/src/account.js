// Account deletion and pharmacy rating aggregates.
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { AggregateField } from 'firebase-admin/firestore';
import { db, auth, FieldValue, HttpsError, requireAuth, audit } from './common.js';

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

export const onRatingWrite = onDocumentWritten('pharmacyRatings/{orderId}', async (event) => {
  const data = event.data?.after?.data() ?? event.data?.before?.data();
  if (!data) return;
  const agg = await db.collection('pharmacyRatings')
    .where('pharmacyId', '==', data.pharmacyId)
    .where('hidden', '==', false)
    .aggregate({ avg: AggregateField.average('rating'), count: AggregateField.count() })
    .get();
  const { avg, count } = agg.data();
  const pharmacyRef = db.doc(`pharmacies/${data.pharmacyId}`);
  if (!(await pharmacyRef.get()).exists) return;
  await pharmacyRef.update({
    ratingAvg: avg === null ? null : Math.round(avg * 10) / 10,
    ratingCount: count,
    updatedAt: FieldValue.serverTimestamp(),
  });
});
