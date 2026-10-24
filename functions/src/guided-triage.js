// Guided symptom checker (no AI): one question at a time over symptom-tree.js.
// Sessions live in triageSessions with mode "guided", so sharing with a
// pharmacist reuses triageShareWithPharmacy.
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue, HttpsError, requireAuth, requirePatientAccess, str, audit } from './common.js';
import { newState, answer, back, question, result, transcript } from './symptom-engine.js';
import { applyInsight, loadHealthInsight, topicOfOutcome } from './health-insight.js';

function view(state, r = result(state)) {
  return r ? { done: true, result: r } : { done: false, question: question(state) };
}

// Adds the notes that link the symptoms to the saved health profile (see health-insight.js).
// Emergencies are left as they are: nothing should compete with "call 1669".
async function withHealth(patientId, state) {
  const r = result(state);
  if (!r || r.route === 'emergency') return r;
  const insight = await loadHealthInsight(db, patientId, {
    topic: topicOfOutcome(r.outcomeId), outcomeId: r.outcomeId, suggestedCatalogIds: r.suggestedCatalogIds, pregnancy: state.facts.pregnancy,
  });
  return applyInsight(r, insight);
}

// Fields written to the session for a given engine state.
function sessionFields(state, r = result(state)) {
  const emergency = r?.route === 'emergency';
  return {
    guided: state,
    result: r,
    // Same route vocabulary as the AI chat: "pharmacist" only after the user shares.
    route: !r ? 'in_progress' : emergency ? 'emergency' : 'info',
    recommendedRoute: r?.route ?? null,
    redFlag: emergency,
    summary: r
      ? {
          symptoms: r.title,
          duration: { short: 'ไม่เกิน 3 วัน', week: '4–7 วัน', long: 'มากกว่า 1 สัปดาห์' }[state.facts.duration] ?? '',
          severity: r.routeText,
          allergies: '',
          currentMeds: '',
          questionsForPharmacist: transcript(state),
        }
      : null,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function loadOwnSession(uid, sessionId) {
  const ref = db.doc(`triageSessions/${str(sessionId, 'sessionId', { max: 128 })}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().userUid !== uid || snap.data().mode !== 'guided') {
    throw new HttpsError('not-found', 'ไม่พบการประเมินอาการ');
  }
  return { ref, session: snap.data() };
}

export const guidedTriageStart = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  if (d.consent !== true) throw new HttpsError('failed-precondition', 'ต้องยินยอมก่อนเริ่มประเมินอาการ');
  const patientId = str(d.patientId, 'patientId', { max: 128 });
  await requirePatientAccess(patientId, uid, 'viewHealth');

  const state = newState();
  const ref = db.collection('triageSessions').doc();
  await ref.set({
    mode: 'guided', userUid: uid, patientId,
    consentAt: FieldValue.serverTimestamp(),
    sharedWithPharmacyId: null, reviewId: null, pharmacistDecision: null, userTurns: 0,
    createdAt: FieldValue.serverTimestamp(),
    ...sessionFields(state),
  });
  return { sessionId: ref.id, ...view(state) };
});

export const guidedTriageAnswer = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const { ref, session } = await loadOwnSession(uid, d.sessionId);
  if (session.sharedWithPharmacyId) throw new HttpsError('failed-precondition', 'ส่งต่อเภสัชกรแล้ว');

  let state;
  try {
    state = answer(session.guided, str(d.nodeId, 'nodeId', { max: 64 }), d.choices);
  } catch {
    throw new HttpsError('invalid-argument', 'คำตอบไม่ตรงกับคำถามปัจจุบัน');
  }
  const r = await withHealth(session.patientId, state);
  const batch = db.batch();
  batch.update(ref, { ...sessionFields(state, r), userTurns: FieldValue.increment(1) });
  if (result(state)?.route === 'emergency') {
    audit(batch, { actorUid: uid, action: 'triage.redFlag', targetPath: ref.path, reason: result(state).outcomeId });
  }
  await batch.commit();
  return view(state, r);
});

export const guidedTriageBack = onCall(async (req) => {
  const uid = requireAuth(req);
  const { ref, session } = await loadOwnSession(uid, req.data?.sessionId);
  if (session.sharedWithPharmacyId) throw new HttpsError('failed-precondition', 'ส่งต่อเภสัชกรแล้ว');
  if (session.guided.path.length === 0) throw new HttpsError('failed-precondition', 'อยู่ที่คำถามแรกแล้ว');
  const state = back(session.guided);
  const r = await withHealth(session.patientId, state);
  await ref.update(sessionFields(state, r));
  return view(state, r);
});
