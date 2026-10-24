// Connects the symptoms a person just described to the health profile they filled in earlier (drug allergies,
// chronic conditions, regular medicines, pregnancy) and returns plain-language notes plus any suggested
// household medicine that should be withheld.
//
// SAFETY: deterministic rules only (no AI). Notes say what a symptom "may be connected with" and what to watch,
// never a diagnosis and never a dose. A medicine is only ever removed from the suggestions, never added.
// This starter rule set must be reviewed by a pharmacist and a physician before real use, like symptom-tree.js.

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s().,\-–/]+/g, '');

// Words that identify each suggestable product in an allergy or medicine list (generic name, Thai name, class).
const DRUG_WORDS = {
  para500: { label: 'พาราเซตามอล', words: ['paracetamol', 'acetaminophen', 'พาราเซตามอล', 'พารา', 'tylenol', 'ไทลินอล', 'ซาร่า'] },
  ors: { label: 'ผงเกลือแร่ ORS', words: ['oralrehydration', 'เกลือแร่'] },
  calamine: { label: 'คาลาไมน์', words: ['calamine', 'คาลาไมน์', 'กาลาไมน์'] },
  cpm4: { label: 'คลอร์เฟนิรามีน', words: ['chlorpheniramine', 'cpm', 'คลอร์เฟนิรามีน', 'ยาแก้แพ้', 'antihistamine'] },
  antacid: { label: 'ยาลดกรด', words: ['aluminium', 'aluminum', 'magnesium', 'อะลูมิเนียม', 'แมกนีเซียม', 'ยาลดกรด', 'antacid', 'โซดามินท์'] },
  ibuprofen400: { label: 'ไอบูโพรเฟน', words: ['ibuprofen', 'ไอบูโพรเฟน', 'nsaid', 'เอ็นเสด', 'aspirin', 'แอสไพริน', 'diclofenac', 'ไดโคลฟีแนค', 'naproxen'] },
};

// symptom-tree outcome id (prefix) -> topic used by the rules below
const OUTCOME_TOPIC = [
  [/^fever_/, 'fever'],
  [/^(cold_|allergic_rhinitis|sinusitis|flu_like|sore_throat|cough_)/, 'respiratory'],
  [/^headache_/, 'headache'],
  [/^dizziness_/, 'dizziness'],
  [/^(dyspepsia|gerd|abdominal_|vomiting_|constipation_|motion_sickness|hemorrhoid)/, 'stomach'],
  [/^diarrhea_/, 'diarrhea'],
  [/^(urticaria|drug_allergy|insect_bite|contact_dermatitis|fungal_skin|acne|skin_infection|shingles)/, 'rash'],
  [/^(wound_|burn_)/, 'wound'],
  [/^(muscle_strain|back_pain|joint_|injury_)/, 'pain'],
  [/^(uti_|dysmenorrhea|vaginal_)/, 'urinary'],
];
export const topicOfOutcome = (id) => OUTCOME_TOPIC.find(([re]) => re.test(id ?? ''))?.[1] ?? 'other';

// AI chat symptomGroup -> topic
const GROUP_TOPIC = {
  fever: 'fever', cough_throat: 'respiratory', pain: 'pain', diarrhea: 'diarrhea', rash: 'rash',
  stomach_other: 'stomach', wound: 'wound', medicine_problem: 'other', other: 'other',
};
export const topicOfGroup = (g) => GROUP_TOPIC[g] ?? 'other';

const COND = {
  bp: ['ความดัน'], diabetes: ['เบาหวาน'], heart: ['หัวใจ', 'หลอดเลือดสมอง'], kidney: ['ไต'], liver: ['ตับ'],
  asthma: ['หอบหืด', 'ถุงลมโป่งพอง', 'copd'], allergy: ['ภูมิแพ้'], gastric: ['กระเพาะ', 'กรดไหลย้อน'],
  gout: ['เกาต์'], immune: ['ภูมิคุ้มกัน', 'มะเร็ง'], blood: ['ละลายลิ่มเลือด'],
};
const STATIN = ['simvastatin', 'atorvastatin', 'rosuvastatin', 'ซิมวาสแตติน', 'อะทอร์วาสแตติน', 'โรสุวาสแตติน', 'สแตติน', 'statin'];
const ACEI = ['enalapril', 'lisinopril', 'captopril', 'เอนาลาพริล', 'ไลซิโนพริล', 'แคปโตพริล'];
const METFORMIN = ['metformin', 'เมทฟอร์มิน'];

const anyIn = (haystack, words) => words.some((w) => haystack.includes(norm(w)));

// profile: { allergies: [{substance}], otherAllergies: [], conditions: [], currentMeds: [], noAllergies, noConditions, pregnancy }
// ctx: { topic, suggestedCatalogIds, pregnancy }
export function analyze(profile, { topic, suggestedCatalogIds = [], pregnancy = null }) {
  const allergyText = [...(profile.allergies ?? []).map((a) => a.substance), ...(profile.otherAllergies ?? [])].map(norm).filter(Boolean);
  const condText = (profile.conditions ?? []).map(norm).join('|');
  const medText = (profile.currentMeds ?? []).map(norm).join('|');
  const has = (key) => anyIn(condText, COND[key]);
  const meds = (words) => anyIn(medText, words);

  const notes = [];
  const blocked = [];

  // 1) Suggested products that clash with a recorded allergy or condition are withheld.
  for (const id of suggestedCatalogIds) {
    const drug = DRUG_WORDS[id];
    const hit = drug ? allergyText.find((a) => a.length >= 3 && drug.words.some((w) => norm(w).includes(a) || a.includes(norm(w)))) : null;
    if (hit) {
      const original = [...(profile.allergies ?? []).map((a) => a.substance), ...(profile.otherAllergies ?? [])].find((a) => norm(a) === hit);
      blocked.push({ catalogId: id, reason: `ไม่แนะนำ${drug.label} เพราะคุณบันทึกว่าแพ้ "${original}"` });
    } else if (id === 'para500' && has('liver')) {
      blocked.push({ catalogId: id, reason: 'ไม่แนะนำพาราเซตามอลเอง เพราะคุณบันทึกว่ามีโรคตับ ให้เภสัชกรเลือกยาและขนาด' });
    } else if (id === 'ors' && (has('kidney') || has('heart'))) {
      blocked.push({ catalogId: id, reason: 'ไม่แนะนำผงเกลือแร่เอง เพราะมีโรคไตหรือโรคหัวใจ ซึ่งต้องระวังเกลือแร่ ให้ถามเภสัชกร' });
    }
  }

  // 2) Symptom <-> recorded condition / regular medicine.
  const add = (cond, text) => { if (cond) notes.push(text); };
  const pain = ['pain', 'headache', 'stomach'].includes(topic);

  add(topic === 'headache' && has('bp'), 'คุณบันทึกว่ามีความดันโลหิตสูง อาการปวดศีรษะอาจเกี่ยวข้องกับความดัน ควรวัดความดันก่อน ถ้าสูงมากหรือปวดรุนแรงให้ไปพบแพทย์');
  add(['headache', 'dizziness'].includes(topic) && has('diabetes'), 'คุณบันทึกว่าเป็นเบาหวาน ปวดหรือเวียนศีรษะอาจเกี่ยวข้องกับน้ำตาลในเลือดต่ำหรือสูง ถ้ามีเครื่องวัดให้เจาะน้ำตาลดูก่อน');
  add(topic === 'dizziness' && (has('bp') || has('heart')), 'คุณมีโรคความดันหรือโรคหัวใจ เวียนศีรษะอาจเกี่ยวข้องกับความดันหรือยาที่ใช้อยู่ ควรวัดความดันและแจ้งเภสัชกร');
  add(['fever', 'respiratory'].includes(topic) && has('asthma'), 'คุณมีหอบหืดหรือโรคปอด ไข้หวัดและไอทำให้หอบกำเริบได้ ถ้าหายใจมีเสียงหวีดหรือเหนื่อย ให้ไปพบแพทย์ทันที');
  add(['fever', 'diarrhea', 'stomach'].includes(topic) && has('diabetes'), 'คุณเป็นเบาหวาน เวลาป่วยน้ำตาลในเลือดอาจแปรปรวน ควรดื่มน้ำให้พอและเฝ้าระวังค่าน้ำตาล');
  add(['fever', 'respiratory', 'rash', 'wound'].includes(topic) && has('immune'), 'คุณมีภูมิคุ้มกันต่ำหรือโรคมะเร็ง การติดเชื้อควรให้แพทย์ตรวจเร็วกว่าคนทั่วไป ไม่ควรรอดูอาการนาน');
  add(topic === 'respiratory' && (has('bp') || has('heart')), 'คุณมีโรคความดันหรือโรคหัวใจ ยาแก้หวัดบางชนิด (กลุ่มแก้คัดจมูก) อาจทำให้ความดันสูงหรือใจสั่น ควรให้เภสัชกรเลือกยา');
  add(topic === 'respiratory' && meds(ACEI), 'ยาลดความดันกลุ่ม ACE inhibitor ที่คุณใช้อยู่อาจทำให้ไอแห้งได้ ถ้าไอเรื้อรังให้แจ้งแพทย์หรือเภสัชกร อย่าหยุดยาเอง');
  add(pain && (has('kidney') || has('liver')), 'คุณมีโรคไตหรือโรคตับ ยาแก้ปวดบางชนิดต้องระวังหรือปรับขนาด ให้เภสัชกรเลือกยา อย่าซื้อกินเอง');
  add(pain && (has('gastric') || has('blood')), 'คุณมีโรคกระเพาะหรือใช้ยาละลายลิ่มเลือด ควรหลีกเลี่ยงยาแก้ปวดกลุ่ม NSAIDs (ไอบูโพรเฟน แอสไพริน) เพราะทำให้ปวดท้องหรือเลือดออกง่าย');
  add(topic === 'stomach' && has('gastric'), 'อาการทางท้องอาจเกี่ยวข้องกับโรคกระเพาะหรือกรดไหลย้อนที่คุณบันทึกไว้ ถ้ากลับเป็นซ้ำหลายครั้งควรพบแพทย์');
  add(['diarrhea', 'stomach'].includes(topic) && meds(METFORMIN), 'เมทฟอร์มินที่คุณใช้อยู่อาจทำให้ท้องเสียหรือคลื่นไส้ได้ ให้แจ้งแพทย์หรือเภสัชกร อย่าหยุดยาเอง');
  add(topic === 'pain' && meds(STATIN), 'ยาลดไขมันกลุ่ม statin ที่คุณใช้อยู่อาจทำให้ปวดกล้ามเนื้อ ถ้าปวดมาก อ่อนแรง หรือปัสสาวะสีเข้ม ให้พบแพทย์ อย่าหยุดยาเอง');
  add(topic === 'pain' && has('gout'), 'คุณบันทึกว่าเป็นเกาต์ ปวดข้ออาจเป็นอาการกำเริบ ควรพบแพทย์');
  add(topic === 'rash' && has('allergy'), 'คุณมีประวัติภูมิแพ้ ผื่นอาจเกี่ยวข้องกับสิ่งที่แพ้ ถ้าหน้า ปากบวม หรือหายใจลำบากให้โทร 1669 ทันที');
  add(topic === 'rash' && allergyText.length > 0, 'คุณมีประวัติแพ้ยา ถ้าผื่นเริ่มหลังกินยาใหม่ ให้หยุดยานั้นและแจ้งแพทย์หรือเภสัชกรทันที');
  add(topic === 'urinary' && has('diabetes'), 'เบาหวานทำให้ติดเชื้อทางเดินปัสสาวะซ้ำได้ง่าย ควรให้แพทย์ตรวจ ไม่ควรรักษาเอง');
  add(['pregnant', 'breastfeeding'].includes(pregnancy ?? profile.pregnancy), 'คุณตั้งครรภ์หรือให้นมบุตร ยาหลายชนิดไม่เหมาะ ให้เภสัชกรเลือกยาให้ทุกครั้ง');

  const hasAnything = (profile.allergies ?? []).length || (profile.otherAllergies ?? []).length || (profile.conditions ?? []).length
    || (profile.currentMeds ?? []).length || profile.noAllergies || profile.noConditions;
  return { notes: [...new Set(notes)], blocked, missing: !hasAnything };
}

// Reads the profile and the active medicines, then runs analyze(). Never throws: a failed read just means no notes.
export async function loadHealthInsight(db, patientId, ctx) {
  try {
    const [healthSnap, medSnap] = await Promise.all([
      db.doc(`patients/${patientId}/health/profile`).get(),
      db.collection(`patients/${patientId}/medications`).where('active', '==', true).get(),
    ]);
    const h = healthSnap.data() ?? {};
    const history = h.history ?? {};
    const profile = {
      allergies: h.allergies ?? [],
      otherAllergies: history.otherAllergies ?? [],
      conditions: h.conditions ?? [],
      currentMeds: [...(history.currentMeds ?? []), ...medSnap.docs.map((m) => m.data().name)],
      noAllergies: history.noAllergies === true,
      noConditions: history.noConditions === true,
      pregnancy: h.about?.pregnancy ?? null,
    };
    return analyze(profile, ctx);
  } catch {
    return { notes: [], blocked: [], missing: false };
  }
}

// Applies an insight to a result: drops withheld products, adds the notes.
export function applyInsight(result, insight) {
  const dropped = new Set(insight.blocked.map((b) => b.catalogId));
  return {
    ...result,
    suggestedCatalogIds: (result.suggestedCatalogIds ?? []).filter((id) => !dropped.has(id)),
    healthNotes: [...insight.blocked.map((b) => b.reason), ...insight.notes],
    healthMissing: insight.missing,
  };
}
