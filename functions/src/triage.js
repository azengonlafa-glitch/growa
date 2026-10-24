// AI symptom triage. Safety layering:
//   1. A deterministic red-flag check runs on every user message before any AI
//      call; a hit ends the session with emergency advice.
//   2. Gemini (free tier, no card needed) collects symptoms and proposes a route via structured output.
//   3. The server, not the model, decides the final route (red flags always win,
//      and long conversations are handed to a pharmacist).
// The AI never approves dispensing; only submitPharmacistReview can.
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import {
  db, FieldValue, HttpsError,
  requireAuth, requirePatientAccess, str, notify, audit, activeStaffUids, patientSnapshot,
} from './common.js';

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const MAX_USER_TURNS = 12;

// ───────────── deterministic red flags ─────────────
// Starter list for the hackathon; must be reviewed by clinicians before launch.

const RED_FLAGS = [
  { kind: 'emergency', re: /เจ็บ(หน้าอก|อก)|แน่นหน้าอก|chest pain/i },
  { kind: 'emergency', re: /หายใจ(ไม่ออก|ลำบาก|ไม่ทัน|หอบ)|หอบเหนื่อย|can'?t breathe|shortness of breath/i },
  { kind: 'emergency', re: /หมดสติ|ไม่รู้สึกตัว|เป็นลม(หมดสติ)?|ชัก|unconscious|seizure|faint/i },
  { kind: 'emergency', re: /แขนขาอ่อนแรง|อ่อนแรงครึ่ง(ซีก)?|ปากเบี้ยว|พูดไม่ชัด|stroke/i },
  { kind: 'emergency', re: /อาเจียนเป็นเลือด|ไอเป็นเลือด|ถ่ายเป็นเลือด|อุจจาระ(สี)?ดำ|เลือดออกไม่หยุด|vomit(ing)? blood/i },
  { kind: 'emergency', re: /(หน้า|ปาก|ลิ้น|คอ|ตา)บวม|ผื่นทั้งตัว|anaphyla/i },
  { kind: 'emergency', re: /กินยา(เกิน(ขนาด)?|ผิด)|ยาเกินขนาด|overdose/i },
  { kind: 'emergency', re: /คอแข็ง|ไข้สูง(มาก)?.*(ชัก|ซึม)|ปวดหัว(รุนแรง|มากที่สุด)|stiff neck/i },
  { kind: 'emergency', re: /ปวดท้อง(รุนแรง|มาก).*(ตั้งครรภ์|ท้อง)|ตั้งครรภ์.*เลือดออก/i },
  { kind: 'mental_health', re: /ฆ่าตัวตาย|อยากตาย|ทำร้ายตัวเอง|ไม่อยากมีชีวิต|suicid|self[- ]harm|kill myself/i },
];

export function detectRedFlag(text) {
  return RED_FLAGS.find((f) => f.re.test(text))?.kind ?? null;
}

const EMERGENCY_REPLY = {
  emergency: 'อาการที่คุณเล่ามาอาจเป็นภาวะฉุกเฉิน กรุณาโทร 1669 หรือไปห้องฉุกเฉินที่ใกล้ที่สุดทันที '
    + 'ไม่ต้องรอแชตหรือสั่งยาผ่านแอป หากอยู่คนเดียวให้แจ้งคนใกล้ตัวช่วยด้วย',
  mental_health: 'ขอบคุณที่บอกเรา คุณไม่ได้อยู่คนเดียว หากคุณกำลังคิดทำร้ายตัวเอง กรุณาโทรสายด่วนสุขภาพจิต 1323 (ตลอด 24 ชม.) '
    + 'หรือ 1669 หากอยู่ในอันตรายทันที และอยู่กับคนที่ไว้ใจได้',
};

// ───────────── Gemini ─────────────

const SYSTEM_PROMPT = `You are the symptom-intake assistant of growa, a Thai platform that connects people with licensed community pharmacies. You talk with the user in Thai.

Your job is to collect the information a pharmacist needs, give careful general self-care information for minor problems, and route the user. You are not a clinician:
- Do not diagnose, name a likely disease as a conclusion, or recommend a specific medicine, dose or brand. A pharmacist decides medicines.
- Never say a medicine is safe for the user. Never approve or promise dispensing.
- Ask only what is needed, following the interview protocol below. Also ask about pregnancy or breastfeeding when relevant. Do not ask for ID numbers, full names or addresses.
- The patient context below may already answer some of these; do not ask again.

Interview protocol (follow this order; ask ONE short question per turn, never repeat a question the user already answered, and never ask for what the patient context already gives):
1. First find out whether the symptoms are the user's own or they are helping someone else, and the age range of the person with symptoms.
2. Let the user describe the symptoms in their own words. Separate what you hear into: main symptom, accompanying symptoms, location, how long, how severe. If there are several symptoms, ask which one worries them most and treat that as the main one.
3. If you do not understand the answer, re-ask more briefly with 3-5 choices (for example fever / cough / pain / stomach / wound / rash / other). If it is still unclear, note "not sure" and move on. Never guess.
4. Then ask the questions that fit the main symptom, one at a time, choosing the most important missing one:
   - Fever: has temperature been measured and what number; when did it start; getting worse or the same; any other symptoms.
   - Cough or sore throat: how long; how is breathing (normal / more tired than usual / very hard); chest pain or coughing blood; other symptoms.
   - Pain: where; sudden, gradual, or after an injury; how severe and is it constant; other symptoms near the pain.
   - Stomach upset or diarrhoea: when it began and how often; can they drink fluids normally; blood in stool or vomit, or severe abdominal pain.
   - Wound or bleeding: has the bleeding stopped; what caused it (sharp object, animal bite, heat); any swelling, redness, pus, or getting worse.
   - Rash or itching: where it started and whether it is spreading; itch or pain; anything new just before (a new medicine, food or product).
   - Problem after taking a medicine: which medicine (ask for the name, a photo of the box is fine), the dose and when, and what abnormal thing happened afterwards.
5. After every answer, check for danger signs again. Danger signs: very hard or laboured breathing, chest pain, coughing or vomiting blood or black or bloody stool, bleeding that will not stop, unable to drink anything, severe or sudden severe pain, swelling of face, lips or throat, confusion or fainting, stiff neck, taking too much of a medicine, thoughts of self-harm. Any one of them means route "emergency".
6. Ask about drug allergies, chronic conditions and current medicines unless the patient context already has them. If the user is allergic, ask the drug name and the reaction. If they take a medicine but cannot remember the name, ask for a photo of the box or hand over to a pharmacist (route "pharmacist"). "Not sure" is a valid answer: record it, never assume "none".
7. When you have enough, write a short summary in "reply" and ask the user to confirm it is correct, with route "continue". If they say something is wrong, correct only that part. Only after they confirm, give the final route.
8. If a drug that the user already takes could duplicate what a pharmacist might suggest, mention it in the summary for the pharmacist.
Before sending, proofread your Thai: no typos, no missing tone marks or letters.

Routes:
- "continue": you still need key information.
- "info": a minor, self-limiting problem in an adult with no risk factors (for example a mild headache, a mild cold or sore throat, mild muscle ache, mild indigestion that started recently, no red flags, no allergy, no chronic disease). Prefer "info" for these even when an over-the-counter medicine could help: give brief general self-care advice and clear signs that mean they should see a pharmacist or doctor; the app then shows household-medicine options from the database.
- "pharmacist": the user is a child under 12, pregnant or breastfeeding, 65 or older, has chronic disease or several regular medicines or a relevant allergy, symptoms last longer than a few days, or you are unsure. When unsure between "info" and "pharmacist", choose "pharmacist".
- "emergency": any sign of a medical emergency or risk of self-harm. Set redFlag to true and tell them to call 1669 (or the 1323 mental health hotline for self-harm) now.

Set "symptomGroup" to the question set that fits the main symptom (fever, pain, diarrhea, rash, cough_throat, stomach_other, wound, medicine_problem or other).
If the user attaches a photo (a wound, a rash or a medicine box): describe only what is visible, never diagnose from a photo; for a medicine box read the name and strength if legible and ask the user to confirm; if the photo is unclear, ask for a clearer one. Do not ask the user for a photo unless it would help.
Keep "reply" under 120 Thai words. Fill "summary" with what is known so far (empty string when unknown); write it in Thai for the pharmacist.`;

// Which question set the conversation followed. Used only to pick household-medicine suggestions from the
// database when the final route is self-care; the AI itself never names a medicine.
const SYMPTOM_GROUPS = ['fever', 'pain', 'diarrhea', 'rash', 'cough_throat', 'stomach_other', 'wound', 'medicine_problem', 'other'];
const GROUP_SUGGEST = { fever: ['para500'], pain: ['para500'], diarrhea: ['ors'], rash: ['calamine'] };

const OUTPUT_SCHEMA = {
  type: 'object',
  required: ['reply', 'route', 'redFlag', 'symptomGroup', 'summary'],
  properties: {
    reply: { type: 'string' },
    route: { type: 'string', enum: ['continue', 'info', 'pharmacist', 'emergency'] },
    redFlag: { type: 'boolean' },
    symptomGroup: { type: 'string', enum: SYMPTOM_GROUPS },
    summary: {
      type: 'object',
          required: ['symptoms', 'duration', 'severity', 'allergies', 'currentMeds', 'questionsForPharmacist'],
      properties: {
        symptoms: { type: 'string' },
        duration: { type: 'string' },
        severity: { type: 'string' },
        allergies: { type: 'string' },
        currentMeds: { type: 'string' },
        questionsForPharmacist: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

async function patientContext(patientId) {
  const [patient, health, meds] = await Promise.all([
    db.doc(`patients/${patientId}`).get(),
    db.doc(`patients/${patientId}/health/profile`).get(),
    db.collection(`patients/${patientId}/medications`).where('active', '==', true).get(),
  ]);
  const h = health.data() ?? {};
  const age = patient.data()?.birthYear ? new Date().getFullYear() - patient.data().birthYear : null;
  return [
    `อายุ: ${age ?? 'ไม่ทราบ'}`,
    `ประวัติแพ้ยา: ${(h.allergies ?? []).map((a) => a.substance).join(', ') || 'ไม่ได้บันทึก'}`,
    `โรคประจำตัว: ${(h.conditions ?? []).join(', ') || 'ไม่ได้บันทึก'}`,
    `ยาที่ใช้อยู่: ${meds.docs.map((m) => m.data().name).join(', ') || 'ไม่ได้บันทึก'}`,
  ].join('\n');
}

// Returns the parsed model answer, or null on any problem (no key, quota, block,
// bad JSON) so the caller sends the user to a pharmacist instead of failing.
async function askGemini(context, history, image = null) {
  const key = GEMINI_API_KEY.value();
  if (!key) {
    console.error('gemini key missing');
    return null;
  }
  const contents = history.map((m, i) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: i === 0 ? `[ข้อมูลผู้ป่วยจากระบบ]
${context}

[ข้อความผู้ใช้]
${m.text}` : m.text }],
  }));
  const request = () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        responseMimeType: 'application/json', responseSchema: OUTPUT_SCHEMA, temperature: 0.3, maxOutputTokens: 1500,
      },
    }),
    signal: AbortSignal.timeout(20000),
  });
  // One retry when the free tier is busy (503/429) or slow.
  if (image) contents[contents.length - 1].parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  let res = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      res = await request();
    } catch (err) {
      console.error('gemini request failed', err?.name, err?.message);
      res = null;
    }
    if (res?.ok || (res && res.status !== 503 && res.status !== 429)) break;
    if (res) console.error('gemini http', res.status, (await res.text().catch(() => '')).slice(0, 200));
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!res) return null;
  if (!res.ok) {
    console.error('gemini http', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return null;
  }
  try {
    const body = await res.json();
    const out = JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    const ok = typeof out.reply === 'string' && ['continue', 'info', 'pharmacist', 'emergency'].includes(out.route)
      && typeof out.redFlag === 'boolean' && out.summary && typeof out.summary === 'object';
    if (!ok) console.error('gemini bad shape', JSON.stringify(out).slice(0, 200));
    return ok ? out : null;
  } catch (err) {
    console.error('gemini parse failed', err?.message);
    return null;
  }
}

// An optional photo (wound, rash, medicine box). Kept only for this one AI call: never stored.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_CHARS = 1_500_000;
function parseImage(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || !IMAGE_TYPES.includes(raw.mimeType) || typeof raw.data !== 'string'
    || raw.data.length === 0 || raw.data.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(raw.data)) {
    throw new HttpsError('invalid-argument', 'รูปภาพไม่ถูกต้องหรือมีขนาดใหญ่เกินไป');
  }
  return { mimeType: raw.mimeType, data: raw.data };
}

// ───────────── callables ─────────────

const GREETING = 'สวัสดีครับ ผู้ช่วยนี้ช่วยรวบรวมอาการเบื้องต้นเพื่อแนะนำว่าควรดูแลตัวเอง ปรึกษาเภสัชกร หรือไปพบแพทย์ '
  + 'ไม่ใช่การวินิจฉัยโรคและไม่สามารถอนุมัติจ่ายยาได้ หากมีอาการฉุกเฉินให้โทร 1669 ทันที\n\nวันนี้มีอาการอะไรครับ';

export const triageStart = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  if (d.consent !== true) throw new HttpsError('failed-precondition', 'ต้องยินยอมก่อนเริ่มประเมินอาการ');
  const patientId = str(d.patientId, 'patientId', { max: 128 });
  await requirePatientAccess(patientId, uid, 'viewHealth');

  const ref = db.collection('triageSessions').doc();
  const batch = db.batch();
  batch.set(ref, {
    userUid: uid, patientId,
    consentAt: FieldValue.serverTimestamp(),
    redFlag: false, route: 'in_progress', userTurns: 0,
    summary: null, sharedWithPharmacyId: null, reviewId: null, pharmacistDecision: null,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(ref.collection('messages').doc(), {
    role: 'assistant', text: GREETING, fixed: true, seq: 0, createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { sessionId: ref.id, greeting: GREETING };
});

export const triageSendMessage = onCall({ secrets: [GEMINI_API_KEY] }, async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  const text = str(d.text, 'ข้อความ', { max: 2000 });
  const image = parseImage(d.image);
  const ref = db.doc(`triageSessions/${str(d.sessionId, 'sessionId', { max: 128 })}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data().userUid !== uid || snap.data().mode === 'guided') {
    throw new HttpsError('not-found', 'ไม่พบการสนทนา');
  }
  const session = snap.data();
  if (!['in_progress', 'info'].includes(session.route)) {
    throw new HttpsError('failed-precondition', 'การสนทนานี้จบแล้วหรือส่งต่อเภสัชกรแล้ว');
  }

  // seq orders messages written in the same batch (identical server timestamps).
  const seq = session.userTurns * 2 + 1;
  const userMsg = { role: 'user', text: image ? `${text} [แนบรูป]` : text, seq, createdAt: FieldValue.serverTimestamp() };
  const flag = detectRedFlag(text);
  let reply;
  let route;
  let summary = session.summary;
  let redFlag = false;
  let aiUnavailable = false;
  let suggestedCatalogIds = [];

  if (flag) {
    reply = EMERGENCY_REPLY[flag];
    route = 'emergency';
    redFlag = true;
  } else {
    const prior = await ref.collection('messages').orderBy('seq').get();
    const history = prior.docs
      .map((m) => m.data())
      .filter((m) => !m.fixed && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, text: m.text }));
    history.push({ role: 'user', text });

    const out = await askGemini(await patientContext(session.patientId), history, image);
    if (!out) {
      reply = 'ขออภัย ระบบไม่สามารถประเมินต่อได้ แนะนำให้ปรึกษาเภสัชกรโดยตรง';
      route = 'pharmacist';
      aiUnavailable = true;
    } else {
      reply = out.reply;
      summary = out.summary;
      redFlag = out.redFlag === true || out.route === 'emergency';
      route = redFlag ? 'emergency' : out.route;
      // Household suggestions only for a self-care outcome; pharmacist and doctor routes show none.
      if (route === 'info') suggestedCatalogIds = GROUP_SUGGEST[out.symptomGroup] ?? [];
      if (route === 'emergency' && !out.reply.includes('1669')) reply = `${out.reply}\n\n${EMERGENCY_REPLY.emergency}`;
    }
    // Server-side guard: long conversations go to a human.
    if (route === 'continue' && session.userTurns + 1 >= MAX_USER_TURNS) route = 'pharmacist';
    if (route === 'continue') route = 'in_progress';
  }

  const batch = db.batch();
  batch.set(ref.collection('messages').doc(), userMsg);
  batch.set(ref.collection('messages').doc(), {
    role: 'assistant', text: reply, route, seq: seq + 1, createdAt: FieldValue.serverTimestamp(),
  });
  // "pharmacist" here is only a recommendation; sharing needs the user's consent
  // via triageShareWithPharmacy, so the stored route stays open until then.
  batch.update(ref, {
    route: route === 'pharmacist' ? 'info' : route,
    recommendedRoute: route,
    redFlag: session.redFlag || redFlag,
    summary,
    userTurns: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (redFlag) audit(batch, { actorUid: uid, action: 'triage.redFlag', targetPath: ref.path, reason: flag ?? 'model' });
  await batch.commit();
  return { reply, route, aiUnavailable, suggestedCatalogIds };
});

export const triageShareWithPharmacy = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = req.data ?? {};
  if (d.consent !== true) throw new HttpsError('failed-precondition', 'ต้องยินยอมให้ส่งข้อมูลอาการให้เภสัชกร');
  const ref = db.doc(`triageSessions/${str(d.sessionId, 'sessionId', { max: 128 })}`);
  const pharmacyId = str(d.pharmacyId, 'pharmacyId', { max: 128 });

  const [snap, pharmacy] = await Promise.all([ref.get(), db.doc(`pharmacies/${pharmacyId}`).get()]);
  if (!snap.exists || snap.data().userUid !== uid) throw new HttpsError('not-found', 'ไม่พบการสนทนา');
  const session = snap.data();
  if (session.redFlag || session.route === 'emergency') {
    throw new HttpsError('failed-precondition', 'พบสัญญาณอันตราย กรุณาโทร 1669 หรือไปห้องฉุกเฉิน');
  }
  if (session.sharedWithPharmacyId) throw new HttpsError('already-exists', 'ส่งต่อเภสัชกรแล้ว');
  if (session.mode === 'guided' && !session.result) {
    throw new HttpsError('failed-precondition', 'ตอบคำถามให้ครบก่อนส่งต่อเภสัชกร');
  }
  if (!pharmacy.exists || pharmacy.data().verificationStatus !== 'approved') {
    throw new HttpsError('failed-precondition', 'ร้านนี้ยังไม่เปิดให้บริการ');
  }
  const pharmacists = await activeStaffUids(pharmacyId, ['pharmacist']);
  if (pharmacists.length === 0) throw new HttpsError('failed-precondition', 'ร้านนี้ยังไม่มีเภสัชกรที่พร้อมให้คำปรึกษา');

  const reviewRef = db.collection('pharmacistReviews').doc();
  const batch = db.batch();
  batch.set(reviewRef, {
    orderId: null, triageId: ref.id, pharmacyId, patientId: session.patientId,
    requestedBy: uid, pharmacistUid: null, decision: 'pending',
    patientSnapshot: await patientSnapshot(session.patientId),
    triageSummary: session.summary ?? null,
    triageResult: session.result ?? null,
    reviewCatalogIds: [], approvedCatalogIds: [], notes: null, thread: [], validUntil: null,
    createdAt: FieldValue.serverTimestamp(), decidedAt: null,
  });
  batch.update(ref, {
    route: 'pharmacist', sharedWithPharmacyId: pharmacyId, reviewId: reviewRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(ref.collection('messages').doc(), {
    role: 'assistant', text: 'ส่งสรุปอาการให้เภสัชกรแล้ว กรุณารอการติดต่อกลับ', fixed: true, seq: session.userTurns * 2 + 0.25,
    createdAt: FieldValue.serverTimestamp(),
  });
  for (const p of pharmacists) {
    notify(batch, p, { type: 'review_pending', title: 'มีคำขอปรึกษาจากแชตประเมินอาการ', body: session.summary?.symptoms ?? '' });
  }
  audit(batch, { actorUid: uid, action: 'triage.share', targetPath: ref.path, after: { pharmacyId } });
  await batch.commit();
  return { reviewId: reviewRef.id };
});
