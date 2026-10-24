// Guided symptom checker content (no AI). One question at a time; each answer
// narrows the path until it reaches an outcome.
//
// SAFETY: this is a hackathon starter set based on common community-pharmacy
// triage practice (red flags first, then who / what / how long / how severe).
// It must be reviewed by a pharmacist and a physician before real use.
// Outcomes describe what the symptoms are *consistent with* and where to get
// care. They are not diagnoses and never name a medicine dose.
//
// Node types
//   single: { text, help?, options: [{ label, to, set? }] }
//   multi:  { text, help?, to, options: [{ label, to?, exclusive? }] }
//           chosen options with `to` win (most severe first), else node.to
//   route:  { rules: [{ when: { fact: [values] }, to }], to }   (auto, no question)
// `to` is a node id or "outcome:<id>".
//
// Outcomes may carry `suggest: [catalogId]` (self_care only): household
// medicines (no pharmacist review needed) the shop can list under the result.
// These are product suggestions, not a prescription: no dose is ever given,
// and the pharmacy still confirms stock before payment. Reviewers: check each
// pairing as part of the clinical review above.

// ───────────── outcomes ─────────────
// route: self_care < pharmacist < doctor < urgent < emergency

export const OUTCOMES = {
  // shared
  emergency: {
    title: 'อาการเข้าได้กับภาวะฉุกเฉิน',
    route: 'emergency',
    advice: ['โทร 1669 หรือไปห้องฉุกเฉินที่ใกล้ที่สุดทันที', 'ไม่ควรรอสั่งยาออนไลน์', 'ถ้าอยู่คนเดียวให้แจ้งคนใกล้ตัวช่วย'],
  },
  red_flag_urgent: {
    title: 'อาการนี้ควรได้รับการตรวจจากแพทย์ภายในวันนี้',
    route: 'urgent',
    advice: ['ไปพบแพทย์หรือห้องฉุกเฉินภายในวันนี้ เพื่อตรวจหาสาเหตุ', 'ไม่ควรรอดูอาการที่บ้านหรือสั่งยาเอง', 'ถ้าอาการแย่ลง หรือมีอาการอื่นเพิ่ม โทร 1669 ทันที'],
  },
  mental_health: {
    title: 'ต้องการความช่วยเหลือด้านสุขภาพจิตโดยเร็ว',
    route: 'emergency',
    advice: ['โทรสายด่วนสุขภาพจิต 1323 ได้ตลอด 24 ชั่วโมง', 'ถ้ากำลังอยู่ในอันตราย โทร 1669 ทันที', 'อยู่กับคนที่ไว้ใจได้ อย่าอยู่คนเดียว'],
  },
  other_pharmacist: {
    title: 'อาการนี้ยังไม่อยู่ในชุดคำถาม',
    route: 'pharmacist',
    advice: ['ส่งข้อมูลให้เภสัชกรช่วยประเมินโดยตรง'],
  },
  long_duration_doctor: {
    title: 'อาการเป็นมานานเกินกว่าที่ควรดูแลเอง',
    route: 'doctor',
    advice: ['ควรพบแพทย์เพื่อตรวจหาสาเหตุ', 'ระหว่างนี้ปรึกษาเภสัชกรเรื่องการบรรเทาอาการได้'],
  },

  // fever
  fever_infant: {
    title: 'ไข้ในทารกอายุต่ำกว่า 3 เดือน',
    route: 'urgent',
    advice: ['ควรพาไปพบแพทย์โดยเร็วภายในวันนี้ ไข้ในทารกเล็กอาจเป็นการติดเชื้อรุนแรง', 'อย่าให้ยาลดไข้เองก่อนปรึกษาแพทย์'],
  },
  fever_dengue_risk: {
    title: 'ไข้สูงร่วมกับอาการที่ต้องระวังไข้เลือดออก',
    route: 'urgent',
    advice: ['ควรพบแพทย์เพื่อตรวจเลือดภายในวันนี้', 'หลีกเลี่ยงยาแก้ปวดกลุ่ม NSAIDs เช่น ไอบูโพรเฟน และแอสไพริน จนกว่าแพทย์จะยืนยัน', 'ดื่มน้ำหรือเกลือแร่ให้เพียงพอ'],
    warn: ['ปวดท้องมาก อาเจียนตลอด มีเลือดออกผิดปกติ ซึมหรือกระสับกระส่าย ตัวเย็น โดยเฉพาะช่วงที่ไข้เริ่มลด ให้ไปห้องฉุกเฉิน'],
  },
  fever_long: {
    title: 'ไข้นานเกิน 3 วัน',
    route: 'doctor',
    advice: ['ควรพบแพทย์เพื่อหาสาเหตุของไข้', 'เช็ดตัว ดื่มน้ำมาก ๆ พักผ่อน'],
  },
  fever_urinary: {
    title: 'ไข้ร่วมกับปัสสาวะแสบขัดหรือปวดหลังบั้นเอว',
    route: 'doctor',
    advice: ['อาจเป็นการติดเชื้อทางเดินปัสสาวะส่วนบน ควรพบแพทย์ภายใน 24 ชั่วโมง'],
  },
  fever_viral: {
    title: 'ไข้ร่วมกับอาการหวัด เข้าได้กับการติดเชื้อไวรัสทางเดินหายใจ',
    route: 'pharmacist',
    advice: ['พักผ่อน ดื่มน้ำมาก ๆ เช็ดตัวลดไข้', 'ปรึกษาเภสัชกรเรื่องยาลดไข้และบรรเทาอาการที่เหมาะกับอายุและโรคประจำตัว'],
    warn: ['ไข้เกิน 3 วัน หายใจเหนื่อย ซึม กินดื่มไม่ได้ ควรพบแพทย์'],
  },
  fever_unclear: {
    title: 'ไข้ที่ยังไม่ชัดเจนว่ามาจากอะไร',
    route: 'pharmacist',
    advice: ['ให้เภสัชกรช่วยซักประวัติเพิ่ม', 'วัดไข้และจดบันทึกไว้'],
    warn: ['ไข้เกิน 3 วัน หรือมีอาการใหม่ เช่น ผื่น ปวดท้อง ซึม ควรพบแพทย์'],
  },

  // cold / allergy
  cold_common: {
    title: 'อาการเข้าได้กับหวัดทั่วไป',
    route: 'self_care',
    suggest: ['para500'],
    advice: ['พักผ่อน ดื่มน้ำอุ่น ล้างจมูกด้วยน้ำเกลือ', 'มักดีขึ้นเองใน 7–10 วัน', 'หากต้องการยาบรรเทาอาการ ให้ปรึกษาเภสัชกร'],
    warn: ['ไข้สูง หายใจเหนื่อย น้ำมูกข้นเขียวร่วมกับปวดหน้าผาก/โหนกแก้มเกิน 10 วัน ควรพบแพทย์'],
  },
  allergic_rhinitis: {
    title: 'อาการเข้าได้กับภูมิแพ้จมูก',
    route: 'pharmacist',
    advice: ['หลีกเลี่ยงสิ่งกระตุ้น เช่น ฝุ่น ไรฝุ่น ขนสัตว์ ควัน', 'ล้างจมูกด้วยน้ำเกลือ', 'เภสัชกรช่วยเลือกยาต้านฮิสตามีนหรือยาพ่นจมูกที่เหมาะสมได้'],
  },
  sinusitis_possible: {
    title: 'อาการเข้าได้กับไซนัสอักเสบ',
    route: 'doctor',
    advice: ['ควรพบแพทย์เพื่อประเมินว่าต้องใช้ยาปฏิชีวนะหรือไม่', 'ล้างจมูกด้วยน้ำเกลือช่วยได้'],
  },
  flu_like: {
    title: 'อาการเข้าได้กับไข้หวัดใหญ่หรือโควิด',
    route: 'pharmacist',
    advice: ['พิจารณาตรวจ ATK โควิด', 'แยกตัวจากผู้อื่น สวมหน้ากาก พักผ่อน', 'กลุ่มเสี่ยง (อายุ 65+, ตั้งครรภ์, มีโรคประจำตัว) ควรพบแพทย์ภายใน 48 ชั่วโมงแรกเพื่อพิจารณายาต้านไวรัส'],
    warn: ['หายใจเหนื่อย แน่นหน้าอก ไข้ไม่ลง ควรพบแพทย์ทันที'],
  },

  // sore throat
  sore_throat_viral: {
    title: 'อาการเจ็บคอเข้าได้กับการติดเชื้อไวรัส',
    route: 'self_care',
    suggest: ['para500'],
    advice: ['กลั้วคอด้วยน้ำเกลืออุ่น ดื่มน้ำมาก ๆ', 'ส่วนใหญ่ไม่จำเป็นต้องใช้ยาปฏิชีวนะ', 'ปรึกษาเภสัชกรเรื่องยาอมหรือยาบรรเทาปวด'],
    warn: ['กลืนน้ำลายไม่ได้ อ้าปากไม่ขึ้น เสียงเปลี่ยน หายใจลำบาก ควรพบแพทย์ทันที'],
  },
  sore_throat_bacterial: {
    title: 'อาการเจ็บคอที่อาจเกิดจากเชื้อแบคทีเรีย',
    route: 'pharmacist',
    advice: ['ให้เภสัชกรประเมินว่าจำเป็นต้องใช้ยาปฏิชีวนะหรือไม่', 'ห้ามซื้อยาปฏิชีวนะกินเอง และถ้าได้รับยาต้องกินให้ครบตามสั่ง'],
  },
  sore_throat_severe: {
    title: 'เจ็บคอรุนแรงที่ต้องตรวจโดยแพทย์',
    route: 'urgent',
    advice: ['อาการกลืนลำบากมากหรืออ้าปากไม่ขึ้นอาจเป็นฝีในคอ ควรพบแพทย์ภายในวันนี้'],
  },

  // cough
  cough_acute: {
    title: 'ไอเฉียบพลันจากหวัดหรือการระคายเคือง',
    route: 'self_care',
    advice: ['ดื่มน้ำอุ่น หลีกเลี่ยงควันและของทอด', 'ปรึกษาเภสัชกรเพื่อเลือกยาให้ตรงกับชนิดไอ (มีเสมหะ/ไม่มีเสมหะ)'],
    warn: ['ไอเกิน 3 สัปดาห์ ไอเป็นเลือด หอบเหนื่อย น้ำหนักลด ควรพบแพทย์'],
  },
  cough_productive_fever: {
    title: 'ไอมีเสมหะเหลืองหรือเขียวร่วมกับไข้',
    route: 'doctor',
    advice: ['อาจเป็นหลอดลมหรือปอดติดเชื้อ ควรพบแพทย์เพื่อฟังปอด'],
  },
  cough_chronic: {
    title: 'ไอเรื้อรังเกิน 3 สัปดาห์',
    route: 'doctor',
    advice: ['ควรพบแพทย์เพื่อหาสาเหตุ เช่น ภูมิแพ้ กรดไหลย้อน หอบหืด วัณโรค หรือผลข้างเคียงจากยาความดันบางชนิด'],
  },
  cough_wheeze: {
    title: 'ไอร่วมกับหายใจมีเสียงวี้ด',
    route: 'doctor',
    advice: ['อาจเป็นหอบหืดหรือหลอดลมตีบ ควรพบแพทย์', 'ถ้ามียาพ่นฉุกเฉินประจำตัวให้ใช้ตามแพทย์สั่ง'],
    warn: ['พูดไม่เป็นประโยค ริมฝีปากเขียว ให้โทร 1669'],
  },

  // headache / dizziness
  headache_tension: {
    title: 'อาการเข้าได้กับปวดศีรษะจากความตึงเครียด',
    route: 'self_care',
    suggest: ['para500'],
    advice: ['พักผ่อน นวดต้นคอ ประคบอุ่น ลดเวลาหน้าจอ ดื่มน้ำให้พอ', 'ปรึกษาเภสัชกรเรื่องยาแก้ปวดที่เหมาะสม'],
    warn: ['ปวดบ่อยกว่า 2–3 ครั้งต่อสัปดาห์ หรือต้องกินยาแก้ปวดบ่อย ควรพบแพทย์'],
  },
  headache_migraine: {
    title: 'อาการเข้าได้กับไมเกรน',
    route: 'pharmacist',
    advice: ['พักในห้องมืดและเงียบ', 'จดสิ่งกระตุ้น เช่น อดนอน แสงจ้า อาหารบางชนิด', 'เภสัชกรช่วยเลือกยาบรรเทาอาการได้ และถ้าเป็นบ่อยควรพบแพทย์เรื่องยาป้องกัน'],
  },
  headache_sinus: {
    title: 'ปวดศีรษะร่วมกับคัดจมูก อาจเกี่ยวกับไซนัส',
    route: 'pharmacist',
    advice: ['ล้างจมูกด้วยน้ำเกลือ', 'เภสัชกรช่วยประเมินเพิ่มเติมได้'],
  },
  headache_redflag: {
    title: 'ปวดศีรษะที่มีลักษณะอันตราย',
    route: 'emergency',
    advice: ['ปวดรุนแรงเฉียบพลัน ปวดมากที่สุดในชีวิต หรือมีไข้ร่วมกับคอแข็ง ต้องไปห้องฉุกเฉินทันที หรือโทร 1669'],
  },
  headache_bp: {
    title: 'ปวดศีรษะในผู้ที่มีความดันโลหิตสูงหรือไม่เคยวัดความดัน',
    route: 'pharmacist',
    advice: ['วัดความดันโลหิต ร้านยาหลายแห่งวัดให้ได้', 'ถ้าความดันตัวบนตั้งแต่ 180 ขึ้นไป หรือมีอาการผิดปกติร่วม ควรพบแพทย์ทันที'],
  },
  dizziness_vertigo: {
    title: 'อาการเข้าได้กับบ้านหมุนจากหูชั้นใน',
    route: 'pharmacist',
    advice: ['ลุกนั่งหรือหันศีรษะช้า ๆ ระวังการหกล้ม', 'เภสัชกรช่วยเลือกยาบรรเทาอาการเวียนได้'],
    warn: ['มีแขนขาอ่อนแรง พูดไม่ชัด เดินเซ มองเห็นภาพซ้อน ให้โทร 1669'],
  },
  dizziness_lightheaded: {
    title: 'หน้ามืดหรือวิงเวียนเมื่อเปลี่ยนท่า',
    route: 'pharmacist',
    advice: ['ลุกช้า ๆ ดื่มน้ำให้พอ กินอาหารให้ตรงเวลา', 'ถ้าใช้ยาความดันหรือยาเบาหวาน ให้เภสัชกรตรวจสอบยา'],
    warn: ['เป็นลมหมดสติ ใจสั่น เจ็บหน้าอก ควรพบแพทย์ทันที'],
  },

  // stomach
  dyspepsia: {
    title: 'อาการเข้าได้กับอาหารไม่ย่อยหรือกระเพาะอาหารอักเสบ',
    route: 'pharmacist',
    advice: ['กินอาหารให้ตรงเวลา เลี่ยงอาหารเผ็ด เปรี้ยว แอลกอฮอล์ กาแฟ', 'เลี่ยงยาแก้ปวดกลุ่ม NSAIDs', 'เภสัชกรช่วยเลือกยาลดกรดหรือยาเคลือบกระเพาะได้'],
    warn: ['อาเจียนเป็นเลือด อุจจาระดำ น้ำหนักลด กลืนลำบาก อายุมากกว่า 55 ปีแล้วเพิ่งเริ่มมีอาการ ควรพบแพทย์'],
  },
  gerd: {
    title: 'อาการเข้าได้กับกรดไหลย้อน',
    route: 'pharmacist',
    advice: ['ไม่นอนทันทีหลังอาหาร 2–3 ชั่วโมง ยกหัวเตียงสูง กินมื้อเล็กลง', 'เภสัชกรช่วยเลือกยาลดกรดได้'],
    warn: ['กลืนลำบาก กลืนเจ็บ น้ำหนักลด อาเจียนเป็นเลือด ควรพบแพทย์'],
  },
  abdominal_urgent: {
    title: 'ปวดท้องที่ต้องตรวจโดยแพทย์โดยเร็ว',
    route: 'urgent',
    advice: ['ปวดท้องน้อยด้านขวา ปวดตลอดเวลาและรุนแรงขึ้น หรือกดแล้วเจ็บมาก อาจเป็นไส้ติ่งอักเสบหรือภาวะอื่นที่ต้องผ่าตัด', 'งดน้ำงดอาหารและงดยาแก้ปวดจนกว่าจะพบแพทย์'],
  },
  abdominal_colic: {
    title: 'ปวดท้องแบบบีบเป็นพัก ๆ เข้าได้กับลำไส้บีบตัว',
    route: 'pharmacist',
    advice: ['กินอาหารอ่อน ดื่มน้ำให้พอ', 'เภสัชกรช่วยเลือกยาบรรเทาอาการปวดเกร็งได้'],
    warn: ['ปวดมากขึ้นเรื่อย ๆ มีไข้ อาเจียนตลอด ท้องอืดแข็ง ควรพบแพทย์'],
  },

  // diarrhea
  diarrhea_simple: {
    title: 'ท้องเสียเฉียบพลันที่มักดูแลเองได้',
    route: 'self_care',
    suggest: ['ors'],
    advice: ['ดื่มผงเกลือแร่ (ORS) ทีละน้อยแต่บ่อย ๆ', 'กินอาหารอ่อน เลี่ยงนม อาหารมัน และอาหารรสจัด', 'ไม่จำเป็นต้องใช้ยาปฏิชีวนะ และไม่ควรใช้ยาหยุดถ่ายเองถ้ามีไข้หรือถ่ายมีมูกเลือด'],
    warn: ['ถ่ายเป็นน้ำมากจนอ่อนเพลีย ปัสสาวะน้อย ปากแห้ง ถ่ายมีเลือด ไข้สูง เกิน 3 วัน ควรพบแพทย์'],
  },
  diarrhea_dehydration: {
    title: 'ท้องเสียร่วมกับภาวะขาดน้ำ',
    route: 'urgent',
    advice: ['ควรพบแพทย์ภายในวันนี้ อาจต้องให้น้ำเกลือทางหลอดเลือด', 'ระหว่างเดินทางให้จิบ ORS ไปเรื่อย ๆ'],
  },
  diarrhea_dysentery: {
    title: 'ถ่ายมีมูกเลือดหรือมีไข้สูง เข้าได้กับลำไส้อักเสบจากเชื้อแบคทีเรีย',
    route: 'doctor',
    advice: ['ควรพบแพทย์ อาจต้องตรวจอุจจาระ', 'ห้ามใช้ยาหยุดถ่ายเอง'],
  },
  diarrhea_food_poisoning: {
    title: 'อาการเข้าได้กับอาหารเป็นพิษ',
    route: 'pharmacist',
    advice: ['ดื่ม ORS ทดแทนน้ำ', 'ส่วนใหญ่ดีขึ้นใน 1–2 วัน', 'เภสัชกรช่วยประเมินเพิ่มเติมได้'],
    warn: ['อาเจียนจนดื่มน้ำไม่ได้ ถ่ายมีเลือด ซึม ควรพบแพทย์'],
  },

  // constipation
  constipation_simple: {
    title: 'อาการเข้าได้กับท้องผูกทั่วไป',
    route: 'self_care',
    advice: ['ดื่มน้ำ 8 แก้วต่อวัน กินผักผลไม้และใยอาหารเพิ่ม ออกกำลังกาย', 'ปรึกษาเภสัชกรหากต้องการยาระบายแบบที่เหมาะสม'],
    warn: ['ถ่ายมีเลือด น้ำหนักลด ลักษณะการขับถ่ายเปลี่ยนไปในคนอายุเกิน 50 ปี ควรพบแพทย์'],
  },
  constipation_redflag: {
    title: 'ท้องผูกที่มีสัญญาณควรตรวจเพิ่ม',
    route: 'doctor',
    advice: ['ควรพบแพทย์เพื่อตรวจหาสาเหตุ'],
  },

  // nausea / vomiting
  vomiting_simple: {
    title: 'คลื่นไส้อาเจียนเล็กน้อย',
    route: 'pharmacist',
    advice: ['จิบน้ำหรือ ORS ทีละน้อย งดอาหารรสจัด', 'เภสัชกรช่วยประเมินเพิ่มเติมได้'],
    warn: ['อาเจียนตลอดจนดื่มน้ำไม่ได้นานเกิน 12 ชั่วโมง อาเจียนเป็นเลือด ปวดท้องมาก ซึม ควรพบแพทย์'],
  },
  vomiting_severe: {
    title: 'อาเจียนรุนแรงหรือดื่มน้ำไม่ได้',
    route: 'urgent',
    advice: ['ควรพบแพทย์ภายในวันนี้ เสี่ยงต่อภาวะขาดน้ำ'],
  },
  motion_sickness: {
    title: 'อาการเข้าได้กับเมารถเมาเรือ',
    route: 'pharmacist',
    advice: ['นั่งด้านหน้า มองไกล ๆ เลี่ยงการอ่านหนังสือหรือดูจอ', 'เภสัชกรช่วยเลือกยาแก้เมาที่ไม่ทำให้ง่วงจนเป็นอันตรายได้'],
  },

  // hemorrhoids
  hemorrhoid: {
    title: 'อาการเข้าได้กับริดสีดวงทวาร',
    route: 'pharmacist',
    advice: ['ไม่เบ่งถ่ายนาน กินใยอาหารและดื่มน้ำมากขึ้น แช่ก้นในน้ำอุ่น', 'เภสัชกรช่วยเลือกยาทาหรือยาเหน็บได้'],
    warn: ['เลือดออกมาก ถ่ายเป็นเลือดคล้ำ อายุเกิน 50 ปีแล้วเพิ่งเริ่มมีเลือดออก ควรพบแพทย์'],
  },

  // skin
  urticaria: {
    title: 'อาการเข้าได้กับลมพิษหรือผื่นแพ้',
    route: 'pharmacist',
    advice: ['หลีกเลี่ยงสิ่งที่สงสัยว่าแพ้ เช่น อาหารหรือยาที่เพิ่งใช้', 'เภสัชกรช่วยเลือกยาต้านฮิสตามีนได้'],
    warn: ['หน้า ปาก หรือลิ้นบวม หายใจลำบาก ให้โทร 1669'],
  },
  drug_allergy: {
    title: 'ผื่นที่อาจเกิดจากการแพ้ยา',
    route: 'doctor',
    advice: ['หยุดยาที่สงสัยและนำยาไปให้แพทย์หรือเภสัชกรดูด้วย', 'จดชื่อยาไว้เป็นประวัติแพ้ยา'],
    warn: ['ผื่นเป็นตุ่มน้ำ ผิวหลุดลอก มีแผลในปากหรือตา มีไข้ ต้องไปโรงพยาบาลทันที'],
  },
  insect_bite: {
    title: 'ผื่นหรือตุ่มคันจากแมลงกัดต่อย',
    route: 'self_care',
    suggest: ['calamine'],
    advice: ['ล้างด้วยสบู่และน้ำ ประคบเย็น ไม่เกา', 'ปรึกษาเภสัชกรเรื่องยาทาลดคัน'],
    warn: ['บวมแดงร้อนลามกว้างขึ้น มีไข้ หรือมีอาการแพ้ทั้งตัว ควรพบแพทย์'],
  },
  contact_dermatitis: {
    title: 'อาการเข้าได้กับผิวหนังอักเสบจากการสัมผัส',
    route: 'pharmacist',
    advice: ['หลีกเลี่ยงสารที่สัมผัส เช่น สบู่ เครื่องสำอาง โลหะ สารเคมี', 'เภสัชกรช่วยเลือกยาทาที่เหมาะกับบริเวณผิวได้'],
  },
  fungal_skin: {
    title: 'อาการเข้าได้กับเชื้อราที่ผิวหนัง (กลาก เกลื้อน หรือน้ำกัดเท้า)',
    route: 'pharmacist',
    advice: ['รักษาผิวให้แห้ง ไม่ใช้ผ้าเช็ดตัวร่วมกับคนอื่น', 'ยาทาต้านเชื้อรามักต้องใช้ต่อเนื่อง 2–4 สัปดาห์ ให้เภสัชกรแนะนำวิธีใช้'],
  },
  acne: {
    title: 'สิว',
    route: 'pharmacist',
    advice: ['ล้างหน้าวันละ 2 ครั้งด้วยผลิตภัณฑ์อ่อนโยน ไม่บีบสิว', 'เภสัชกรช่วยเลือกยาทาตามชนิดของสิวได้'],
    warn: ['สิวอักเสบเป็นก้อนใหญ่ เป็นแผลเป็น ควรพบแพทย์ผิวหนัง'],
  },
  skin_infection: {
    title: 'ผิวหนังบวมแดงร้อน อาจเป็นการติดเชื้อ',
    route: 'doctor',
    advice: ['ควรพบแพทย์ อาจต้องใช้ยาปฏิชีวนะ'],
    warn: ['ลามเร็ว มีไข้สูง ปวดมาก ผิวเปลี่ยนเป็นสีม่วงคล้ำ ต้องไปโรงพยาบาลทันที'],
  },
  shingles_possible: {
    title: 'ผื่นตุ่มน้ำเป็นแนวข้างเดียวของร่างกาย อาจเป็นงูสวัด',
    route: 'doctor',
    advice: ['ควรพบแพทย์ภายใน 72 ชั่วโมงแรกเพื่อพิจารณายาต้านไวรัส'],
    warn: ['ผื่นขึ้นบริเวณตาหรือใบหน้า ควรพบแพทย์ภายในวันนี้'],
  },
  wound_minor: {
    title: 'แผลถลอกหรือแผลตื้นเล็กน้อย',
    route: 'self_care',
    advice: ['ล้างแผลด้วยน้ำสะอาดหรือน้ำเกลือ ปิดแผลให้สะอาด', 'ปรึกษาเภสัชกรเรื่องอุปกรณ์ทำแผล'],
    warn: ['แผลบวมแดงร้อนมีหนอง มีไข้ ควรพบแพทย์'],
  },
  wound_doctor: {
    title: 'แผลที่ควรให้แพทย์ดู',
    route: 'urgent',
    advice: ['แผลลึก ยาว ขอบแยก เลือดไม่หยุด หรือถูกสัตว์กัด ควรพบแพทย์ภายในวันนี้ อาจต้องเย็บแผล ฉีดวัคซีนบาดทะยักหรือพิษสุนัขบ้า'],
  },
  burn_minor: {
    title: 'แผลไฟไหม้หรือน้ำร้อนลวกขนาดเล็ก',
    route: 'self_care',
    advice: ['เปิดน้ำสะอาดไหลผ่าน 20 นาที ห้ามใช้น้ำแข็ง ยาสีฟัน หรือน้ำปลา', 'ไม่เจาะตุ่มน้ำ ปิดแผลหลวม ๆ', 'ปรึกษาเภสัชกรเรื่องยาทาแผลไฟไหม้'],
  },
  burn_major: {
    title: 'แผลไฟไหม้ที่ต้องรักษาในโรงพยาบาล',
    route: 'urgent',
    advice: ['แผลใหญ่กว่าฝ่ามือ อยู่ที่หน้า มือ เท้า อวัยวะเพศ ข้อพับ หรือผิวขาวซีด/ไหม้ดำ ควรไปโรงพยาบาลทันที'],
  },

  // musculoskeletal
  muscle_strain: {
    title: 'อาการเข้าได้กับกล้ามเนื้ออักเสบหรือเคล็ดขัดยอก',
    route: 'self_care',
    advice: ['ช่วง 48 ชั่วโมงแรกให้พัก ประคบเย็น หลังจากนั้นประคบอุ่น', 'ปรึกษาเภสัชกรเรื่องยาแก้ปวดหรือยาทาที่เหมาะกับโรคประจำตัว'],
    warn: ['ปวดมากจนลงน้ำหนักไม่ได้ บวมผิดรูป ชา หรืออ่อนแรง ควรพบแพทย์'],
  },
  injury_xray: {
    title: 'บาดเจ็บที่อาจมีกระดูกหักหรือเอ็นฉีก',
    route: 'urgent',
    advice: ['ควรพบแพทย์เพื่อเอกซเรย์', 'ระหว่างนี้อย่าขยับส่วนที่บาดเจ็บ ประคบเย็น'],
  },
  back_pain_simple: {
    title: 'ปวดหลังจากกล้ามเนื้อ',
    route: 'self_care',
    advice: ['ขยับตัวเบา ๆ ตามที่ทำได้ ไม่ควรนอนนิ่งทั้งวัน ประคบอุ่น', 'ปรึกษาเภสัชกรเรื่องยาแก้ปวด'],
    warn: ['ชาหรืออ่อนแรงที่ขา กลั้นปัสสาวะหรืออุจจาระไม่ได้ มีไข้ ควรพบแพทย์ทันที'],
  },
  back_pain_redflag: {
    title: 'ปวดหลังที่มีอาการทางเส้นประสาท',
    route: 'urgent',
    advice: ['ชาหรืออ่อนแรงที่ขา หรือกลั้นปัสสาวะไม่ได้ อาจมีการกดทับเส้นประสาท ควรพบแพทย์ภายในวันนี้'],
  },
  joint_gout: {
    title: 'ข้ออักเสบบวมแดงร้อนเฉียบพลัน อาจเป็นเกาต์',
    route: 'doctor',
    advice: ['พักข้อ ประคบเย็น ดื่มน้ำมาก งดแอลกอฮอล์และเครื่องในสัตว์', 'ควรพบแพทย์เพื่อยืนยันและรับยาที่เหมาะสม'],
    warn: ['มีไข้ร่วมด้วย อาจเป็นข้อติดเชื้อ ต้องพบแพทย์ทันที'],
  },
  joint_chronic: {
    title: 'ปวดข้อเรื้อรัง',
    route: 'doctor',
    advice: ['ควรพบแพทย์เพื่อหาสาเหตุ เช่น ข้อเสื่อมหรือรูมาตอยด์'],
  },

  // eye / ear / mouth
  conjunctivitis_allergic: {
    title: 'ตาแดงคันจากภูมิแพ้',
    route: 'pharmacist',
    advice: ['ไม่ขยี้ตา ประคบเย็น', 'เภสัชกรช่วยเลือกยาหยอดตาที่เหมาะสมได้'],
  },
  conjunctivitis_infective: {
    title: 'ตาแดงมีขี้ตา เข้าได้กับเยื่อบุตาอักเสบจากการติดเชื้อ',
    route: 'pharmacist',
    advice: ['ล้างมือบ่อย ไม่ใช้ผ้าเช็ดหน้าร่วมกับใคร งดใส่คอนแทคเลนส์', 'ให้เภสัชกรประเมินว่าต้องพบแพทย์หรือไม่'],
    warn: ['ปวดตามาก ตามัว สู้แสงไม่ได้ ควรพบจักษุแพทย์ทันที'],
  },
  eye_urgent: {
    title: 'อาการทางตาที่ต้องพบจักษุแพทย์โดยเร็ว',
    route: 'urgent',
    advice: ['ปวดตามาก ตามัวลง สู้แสงไม่ได้ หรือสารเคมี/วัตถุเข้าตา ต้องพบแพทย์ทันที', 'ถ้าสารเคมีเข้าตา ให้ล้างด้วยน้ำสะอาดไหลผ่านอย่างน้อย 15 นาทีก่อนไป'],
  },
  ear_otitis_externa: {
    title: 'อาการเข้าได้กับหูชั้นนอกอักเสบ',
    route: 'pharmacist',
    advice: ['ไม่แคะหู ระวังน้ำเข้าหู', 'ให้เภสัชกรประเมินเรื่องยาหยอดหู'],
  },
  ear_otitis_media: {
    title: 'ปวดหูร่วมกับไข้หรือหวัด อาจเป็นหูชั้นกลางอักเสบ',
    route: 'doctor',
    advice: ['ควรพบแพทย์เพื่อส่องตรวจหู โดยเฉพาะในเด็ก'],
    warn: ['มีหนองไหล หลังหูบวมแดง ไข้สูง ควรพบแพทย์ทันที'],
  },
  ear_wax: {
    title: 'หูอื้อจากขี้หูอุดตัน',
    route: 'pharmacist',
    advice: ['อย่าใช้ไม้พันสำลีดันลึก', 'เภสัชกรช่วยแนะนำยาหยอดละลายขี้หูได้'],
    warn: ['การได้ยินลดลงทันทีโดยไม่มีสาเหตุ ควรพบแพทย์ภายใน 24–48 ชั่วโมง'],
  },
  mouth_ulcer: {
    title: 'แผลร้อนใน',
    route: 'self_care',
    advice: ['กลั้วปากด้วยน้ำเกลือ เลี่ยงอาหารเผ็ดร้อน มักหายเองใน 1–2 สัปดาห์', 'ปรึกษาเภสัชกรเรื่องยาทาแผลในปาก'],
    warn: ['แผลไม่หายใน 3 สัปดาห์ หรือเป็นบ่อยมาก ควรพบแพทย์หรือทันตแพทย์'],
  },
  toothache: {
    title: 'ปวดฟัน',
    route: 'doctor',
    advice: ['ควรพบทันตแพทย์ ยาแก้ปวดช่วยบรรเทาได้ชั่วคราวแต่ไม่แก้สาเหตุ', 'ปรึกษาเภสัชกรเรื่องยาแก้ปวดระหว่างรอ'],
    warn: ['หน้าบวม ไข้ กลืนลำบาก ควรพบแพทย์ทันที'],
  },

  // urinary / women's health
  uti_simple: {
    title: 'อาการเข้าได้กับกระเพาะปัสสาวะอักเสบ',
    route: 'pharmacist',
    advice: ['ดื่มน้ำมาก ๆ ไม่กลั้นปัสสาวะ', 'ให้เภสัชกรประเมินว่าควรใช้ยาปฏิชีวนะหรือไม่'],
    warn: ['ไข้ หนาวสั่น ปวดหลังบั้นเอว ปัสสาวะเป็นเลือด ควรพบแพทย์'],
  },
  uti_complicated: {
    title: 'อาการทางเดินปัสสาวะที่ควรพบแพทย์',
    route: 'doctor',
    advice: ['ผู้ชาย ผู้ที่ตั้งครรภ์ เด็ก หรือเป็นซ้ำบ่อย ควรตรวจปัสสาวะโดยแพทย์'],
  },
  dysmenorrhea: {
    title: 'ปวดประจำเดือน',
    route: 'self_care',
    advice: ['ประคบอุ่นที่ท้องน้อย พักผ่อน', 'ปรึกษาเภสัชกรเรื่องยาบรรเทาปวดประจำเดือน'],
    warn: ['ปวดมากผิดปกติ ปวดมากขึ้นทุกเดือน หรือเลือดออกมากผิดปกติ ควรพบแพทย์'],
  },
  pregnancy_pain: {
    title: 'ปวดท้องน้อยหรือมีเลือดออกขณะอาจตั้งครรภ์',
    route: 'emergency',
    advice: ['อาจเป็นการตั้งครรภ์นอกมดลูกหรือแท้ง ควรไปโรงพยาบาลทันที'],
  },
  vaginal_candida: {
    title: 'ตกขาวเป็นก้อนขาวคล้ายนมบูดและคัน เข้าได้กับเชื้อรา',
    route: 'pharmacist',
    advice: ['สวมกางเกงในผ้าฝ้าย หลีกเลี่ยงการสวนล้างช่องคลอด', 'เภสัชกรช่วยแนะนำยาได้ และผู้ที่ตั้งครรภ์ควรพบแพทย์'],
  },
  vaginal_doctor: {
    title: 'ตกขาวผิดปกติที่ควรตรวจ',
    route: 'doctor',
    advice: ['ตกขาวมีกลิ่นเหม็น สีเขียวเหลือง ปวดท้องน้อย หรือมีไข้ ควรพบแพทย์เพื่อตรวจหาเชื้อ', 'คู่นอนอาจต้องได้รับการรักษาด้วย'],
  },

  // sleep / mood
  insomnia: {
    title: 'นอนไม่หลับ',
    route: 'pharmacist',
    advice: ['เข้านอนและตื่นเวลาเดิม งดกาแฟหลังเที่ยง งดจอ 1 ชั่วโมงก่อนนอน', 'เภสัชกรช่วยประเมินและแนะนำได้ ไม่ควรซื้อยานอนหลับกินเอง'],
    warn: ['นอนไม่หลับเกิน 1 เดือน หรือมีอารมณ์เศร้า เบื่อหน่ายต่อเนื่อง ควรพบแพทย์'],
  },
};

// ───────────── shared questions ─────────────

const DURATION_DAYS = (prefix, longOutcome = 'outcome:long_duration_doctor') => ({
  type: 'single',
  text: 'เป็นมานานแค่ไหนแล้ว',
  options: [
    { label: 'ไม่เกิน 3 วัน', to: `${prefix}`, set: { duration: 'short' } },
    { label: '4–7 วัน', to: `${prefix}`, set: { duration: 'week' } },
    { label: 'มากกว่า 1 สัปดาห์', to: longOutcome, set: { duration: 'long' } },
  ],
});

export const START = 'red_flags';

export const NODES = {
  // Step 1: universal red flags before anything else. One symptom per option. Symptoms that need a closer
  // look open a short follow-up page (rf_*); the follow-ups only ever go to emergency or "see a doctor today",
  // never to self-care, and "not sure" always means emergency. Several follow-up symptoms together are
  // treated as an emergency (see answer() in symptom-engine.js).
  red_flags: {
    type: 'multi',
    text: 'ตอนนี้ผู้ป่วยมีอาการต่อไปนี้ข้อใดบ้าง',
    help: 'เลือกได้หลายข้อ ถ้าไม่มีให้เลือก "ไม่มีอาการเหล่านี้"',
    to: 'age',
    options: [
      { label: 'หายใจลำบาก หรือหอบเหนื่อย', to: 'rf_breath' },
      { label: 'ริมฝีปากหรือปลายนิ้วเขียวคล้ำ', to: 'outcome:emergency' },
      { label: 'เจ็บแน่นหน้าอก', to: 'rf_chest' },
      { label: 'หมดสติ ไม่รู้สึกตัว', to: 'outcome:emergency' },
      { label: 'ชัก', to: 'outcome:emergency' },
      { label: 'สับสน พูดจาไม่รู้เรื่อง', to: 'outcome:emergency' },
      { label: 'ซึมมาก ปลุกไม่ค่อยตื่น', to: 'outcome:emergency' },
      { label: 'แขนหรือขาอ่อนแรงครึ่งซีก', to: 'outcome:emergency' },
      { label: 'ปากเบี้ยวขึ้นมาทันที', to: 'outcome:emergency' },
      { label: 'พูดไม่ชัดขึ้นมาทันที', to: 'outcome:emergency' },
      { label: 'อาเจียนเป็นเลือด', to: 'outcome:emergency' },
      { label: 'ไอเป็นเลือด', to: 'rf_cough_blood' },
      { label: 'ถ่ายเป็นเลือด หรืออุจจาระสีดำ', to: 'rf_stool_blood' },
      { label: 'เลือดออกไม่หยุด', to: 'outcome:emergency' },
      { label: 'ลิ้นหรือคอบวม', to: 'outcome:emergency' },
      { label: 'หน้าหรือปากบวม', to: 'outcome:emergency' },
      { label: 'ผื่นขึ้นทั้งตัวร่วมกับหน้ามืด', to: 'outcome:emergency' },
      { label: 'ศีรษะถูกกระแทกแรง', to: 'rf_head_injury' },
      { label: 'ได้รับอุบัติเหตุรุนแรง', to: 'outcome:emergency' },
      { label: 'กินยาเกินขนาด', to: 'outcome:emergency' },
      { label: 'ได้รับสารพิษ', to: 'outcome:emergency' },
      { label: 'คิดอยากทำร้ายตัวเองหรืออยากตาย', to: 'outcome:mental_health' },
      { label: 'ไม่มีอาการเหล่านี้', exclusive: true },
    ],
  },

  // Follow-up pages for red flags that need a closer look.
  rf_breath: {
    type: 'single',
    text: 'หายใจลำบากแบบไหน',
    options: [
      { label: 'หอบมาก พูดได้ไม่ครบประโยค', to: 'outcome:emergency' },
      { label: 'หายใจเร็วและแน่นขึ้นเรื่อย ๆ', to: 'outcome:emergency' },
      { label: 'เหนื่อยง่ายกว่าปกติ แต่พักแล้วดีขึ้น', to: 'outcome:red_flag_urgent' },
      { label: 'ไม่แน่ใจ', to: 'outcome:emergency' },
    ],
  },
  rf_chest: {
    type: 'single',
    text: 'เจ็บหน้าอกลักษณะไหน',
    help: 'เลือกข้อที่ใกล้เคียงที่สุด',
    options: [
      { label: 'แน่น เหมือนมีของหนักทับ หรือบีบรัด', to: 'outcome:emergency' },
      { label: 'เจ็บร้าวไปแขน กราม คอ หรือหลัง', to: 'outcome:emergency' },
      { label: 'เจ็บร่วมกับเหงื่อออก คลื่นไส้ หรือหน้ามืด', to: 'outcome:emergency' },
      { label: 'เจ็บจี๊ดเฉพาะจุด กดหรือขยับแล้วเจ็บ ไม่มีอาการอื่น', to: 'outcome:red_flag_urgent' },
      { label: 'ไม่แน่ใจ', to: 'outcome:emergency' },
    ],
  },
  rf_cough_blood: {
    type: 'single',
    text: 'ไอเป็นเลือดมากแค่ไหน',
    options: [
      { label: 'เลือดสดเป็นก้อน หรือปริมาณมาก', to: 'outcome:emergency' },
      { label: 'มีเลือดปนเสมหะเล็กน้อย', to: 'outcome:red_flag_urgent' },
      { label: 'ไม่แน่ใจ', to: 'outcome:emergency' },
    ],
  },
  rf_stool_blood: {
    type: 'single',
    text: 'ถ่ายเป็นเลือดลักษณะไหน',
    options: [
      { label: 'อุจจาระสีดำเหนียวคล้ายยางมะตอย', to: 'outcome:emergency' },
      { label: 'เลือดสดปริมาณมาก หรือใจสั่น หน้ามืด', to: 'outcome:emergency' },
      { label: 'เลือดสดเล็กน้อยติดกระดาษชำระ', to: 'outcome:red_flag_urgent' },
      { label: 'ไม่แน่ใจ', to: 'outcome:emergency' },
    ],
  },
  rf_head_injury: {
    type: 'single',
    text: 'หลังศีรษะถูกกระแทกมีอาการข้อไหนบ้าง',
    options: [
      { label: 'อาเจียน ซึม ปวดหัวมากขึ้น หรือชัก', to: 'outcome:emergency' },
      { label: 'หมดสติ หรือจำเหตุการณ์ไม่ได้', to: 'outcome:emergency' },
      { label: 'แค่ปวดหรือบวมตรงที่ชน ตื่นตัวดี', to: 'outcome:red_flag_urgent' },
      { label: 'ไม่แน่ใจ', to: 'outcome:emergency' },
    ],
  },

  // Step 2: who is the patient.
  age: {
    type: 'single',
    text: 'ผู้ป่วยอายุเท่าไร',
    options: [
      { label: 'ต่ำกว่า 3 เดือน', to: 'chronic', set: { age: 'infant3m' } },
      { label: '3 เดือน – 1 ปี', to: 'chronic', set: { age: 'infant' } },
      { label: '1 – 5 ปี', to: 'chronic', set: { age: 'toddler' } },
      { label: '6 – 11 ปี', to: 'chronic', set: { age: 'child' } },
      { label: '12 – 17 ปี', to: 'sex', set: { age: 'teen' } },
      { label: '18 – 64 ปี', to: 'sex', set: { age: 'adult' } },
      { label: '65 ปีขึ้นไป', to: 'sex', set: { age: 'elder' } },
    ],
  },
  sex: {
    type: 'single',
    text: 'เพศของผู้ป่วย',
    options: [
      { label: 'หญิง', to: 'pregnancy_route', set: { sex: 'female' } },
      { label: 'ชาย', to: 'chronic', set: { sex: 'male' } },
    ],
  },
  pregnancy_route: {
    type: 'route',
    rules: [{ when: { age: ['elder'] }, to: 'chronic' }],
    to: 'pregnancy',
  },
  pregnancy: {
    type: 'single',
    text: 'ตอนนี้ตั้งครรภ์หรือให้นมบุตรอยู่หรือไม่',
    options: [
      { label: 'ตั้งครรภ์', to: 'chronic', set: { pregnancy: 'pregnant' } },
      { label: 'ไม่แน่ใจ อาจตั้งครรภ์', to: 'chronic', set: { pregnancy: 'maybe' } },
      { label: 'ให้นมบุตร', to: 'chronic', set: { pregnancy: 'breastfeeding' } },
      { label: 'ไม่ใช่ทั้งสองอย่าง', to: 'chronic', set: { pregnancy: 'no' } },
    ],
  },
  chronic: {
    type: 'single',
    text: 'มีโรคประจำตัวหรือใช้ยาประจำหรือไม่',
    help: 'เช่น เบาหวาน ความดัน โรคหัวใจ โรคไต โรคตับ หอบหืด ภูมิคุ้มกันต่ำ หรือกินยาละลายลิ่มเลือด',
    options: [
      { label: 'มี', to: 'body_area', set: { chronic: 'yes' } },
      { label: 'ไม่มี', to: 'body_area', set: { chronic: 'no' } },
    ],
  },

  // Step 3: narrow to the main complaint.
  body_area: {
    type: 'single',
    text: 'อาการหลักที่ไม่สบายอยู่ที่ส่วนไหน',
    options: [
      { label: 'ไข้ หวัด เจ็บคอ ไอ', to: 'resp_menu' },
      { label: 'ปวดศีรษะ เวียนศีรษะ', to: 'head_menu' },
      { label: 'ท้อง ระบบทางเดินอาหาร', to: 'gi_menu' },
      { label: 'ผิวหนัง ผื่น แผล', to: 'skin_menu' },
      { label: 'กล้ามเนื้อ ข้อ กระดูก หลัง', to: 'msk_menu' },
      { label: 'ตา หู ปาก ฟัน', to: 'eent_menu' },
      { label: 'ปัสสาวะ หรือสุขภาพสตรี', to: 'gu_menu' },
      { label: 'นอนไม่หลับ', to: 'outcome:insomnia' },
      { label: 'อื่น ๆ ไม่อยู่ในรายการ', to: 'outcome:other_pharmacist' },
    ],
  },

  // ───────────── respiratory ─────────────
  resp_menu: {
    type: 'single',
    text: 'อาการไหนเด่นที่สุด',
    options: [
      { label: 'มีไข้', to: 'fever_infant_route' },
      { label: 'น้ำมูก คัดจมูก จาม', to: 'cold_duration' },
      { label: 'เจ็บคอ', to: 'throat_severity' },
      { label: 'ไอ', to: 'cough_duration' },
    ],
  },

  fever_infant_route: {
    type: 'route',
    rules: [{ when: { age: ['infant3m'] }, to: 'outcome:fever_infant' }],
    to: 'fever_duration',
  },
  fever_duration: DURATION_DAYS('fever_dengue', 'outcome:fever_long'),
  fever_dengue: {
    type: 'single',
    text: 'มีอาการเหล่านี้ร่วมด้วยหรือไม่: ไข้สูงลอยตลอด ปวดเมื่อยตัวมาก ปวดกระบอกตา มีจุดเลือดออกตามผิว หรือเลือดกำเดา/เลือดออกตามไรฟัน',
    options: [
      { label: 'มี', to: 'outcome:fever_dengue_risk' },
      { label: 'ไม่มี', to: 'fever_duration_check' },
    ],
  },
  fever_duration_check: {
    type: 'route',
    rules: [{ when: { duration: ['week'] }, to: 'outcome:fever_long' }],
    to: 'fever_source',
  },
  fever_source: {
    type: 'single',
    text: 'มีอาการอื่นร่วมกับไข้แบบไหน',
    options: [
      { label: 'น้ำมูก ไอ เจ็บคอ', to: 'fever_flu' },
      { label: 'ปัสสาวะแสบขัด หรือปวดหลังบั้นเอว', to: 'outcome:fever_urinary' },
      { label: 'ท้องเสีย หรืออาเจียน', to: 'diarrhea_blood' },
      { label: 'ผื่นขึ้นตามตัว', to: 'outcome:fever_unclear' },
      { label: 'ไม่มีอาการอื่นชัดเจน', to: 'outcome:fever_unclear' },
    ],
  },
  fever_flu: {
    type: 'single',
    text: 'อาการเริ่มแบบไหน',
    options: [
      { label: 'เป็นทันที ไข้สูง ปวดเมื่อยตัวมาก อ่อนเพลียมาก', to: 'outcome:flu_like' },
      { label: 'ค่อย ๆ เป็น ไข้ไม่สูงมาก', to: 'outcome:fever_viral' },
    ],
  },

  cold_duration: {
    type: 'single',
    text: 'เป็นมานานแค่ไหนแล้ว',
    options: [
      { label: 'ไม่เกิน 10 วัน', to: 'cold_pattern' },
      { label: 'มากกว่า 10 วัน', to: 'cold_sinus' },
      { label: 'เป็น ๆ หาย ๆ บ่อย หรือเป็นตามฤดูกาล', to: 'outcome:allergic_rhinitis' },
    ],
  },
  cold_pattern: {
    type: 'single',
    text: 'ลักษณะอาการตรงกับแบบไหนมากที่สุด',
    options: [
      { label: 'จามติด ๆ กัน คันจมูก คันตา น้ำมูกใส ไม่มีไข้', to: 'outcome:allergic_rhinitis' },
      { label: 'ไข้สูงทันที ปวดเมื่อยตัวมาก อ่อนเพลียมาก', to: 'outcome:flu_like' },
      { label: 'น้ำมูก คัดจมูก เจ็บคอเล็กน้อย อาจมีไข้ต่ำ ๆ', to: 'outcome:cold_common' },
    ],
  },
  cold_sinus: {
    type: 'single',
    text: 'มีน้ำมูกข้นเหลืองเขียว ร่วมกับปวดหน้าผากหรือโหนกแก้มหรือไม่',
    options: [
      { label: 'มี', to: 'outcome:sinusitis_possible' },
      { label: 'ไม่มี น้ำมูกใส จามบ่อย', to: 'outcome:allergic_rhinitis' },
    ],
  },

  throat_severity: {
    type: 'single',
    text: 'เจ็บคอรุนแรงแค่ไหน',
    options: [
      { label: 'กลืนน้ำลายไม่ได้ อ้าปากไม่ขึ้น หรือเสียงเปลี่ยนแบบมีอะไรอยู่ในปาก', to: 'outcome:sore_throat_severe' },
      { label: 'เจ็บแต่ยังกินดื่มได้', to: 'throat_duration' },
    ],
  },
  throat_duration: DURATION_DAYS('throat_centor'),
  throat_centor: {
    type: 'single',
    text: 'อาการตรงกับแบบไหนมากกว่า',
    help: 'ใช้แยกเบื้องต้นว่าน่าจะเป็นเชื้อไวรัสหรือแบคทีเรีย',
    options: [
      { label: 'มีไข้ ต่อมทอนซิลบวมมีจุดหนองขาว ต่อมน้ำเหลืองใต้คางโตกดเจ็บ และไม่ไอ', to: 'outcome:sore_throat_bacterial' },
      { label: 'มีน้ำมูก ไอ เสียงแหบ หรือเจ็บคอไม่มาก', to: 'outcome:sore_throat_viral' },
      { label: 'ไม่แน่ใจ', to: 'outcome:sore_throat_bacterial' },
    ],
  },

  cough_duration: {
    type: 'single',
    text: 'ไอมานานแค่ไหนแล้ว',
    options: [
      { label: 'ไม่เกิน 3 สัปดาห์', to: 'cough_wheeze' },
      { label: 'มากกว่า 3 สัปดาห์', to: 'outcome:cough_chronic' },
    ],
  },
  cough_wheeze: {
    type: 'single',
    text: 'หายใจมีเสียงวี้ด หรือแน่นหน้าอกเวลาไอหรือไม่',
    options: [
      { label: 'มี', to: 'outcome:cough_wheeze' },
      { label: 'ไม่มี', to: 'cough_type' },
    ],
  },
  cough_type: {
    type: 'single',
    text: 'ลักษณะการไอเป็นแบบไหน',
    options: [
      { label: 'มีเสมหะเหลืองหรือเขียว ร่วมกับไข้', to: 'outcome:cough_productive_fever' },
      { label: 'มีเสมหะใสหรือขาว ไม่มีไข้', to: 'outcome:cough_acute' },
      { label: 'ไอแห้ง ๆ ระคายคอ', to: 'outcome:cough_acute' },
    ],
  },

  // ───────────── head ─────────────
  head_menu: {
    type: 'single',
    text: 'อาการแบบไหน',
    options: [
      { label: 'ปวดศีรษะ', to: 'headache_danger' },
      { label: 'เวียนศีรษะ บ้านหมุน หรือหน้ามืด', to: 'dizzy_type' },
    ],
  },
  headache_danger: {
    type: 'single',
    text: 'มีลักษณะต่อไปนี้หรือไม่: ปวดรุนแรงทันทีแบบมากที่สุดในชีวิต, มีไข้ร่วมกับคอแข็ง, หลังศีรษะกระแทก, หรือตามัว/ชา/อ่อนแรงร่วมด้วย',
    options: [
      { label: 'มีอย่างน้อย 1 ข้อ', to: 'outcome:headache_redflag' },
      { label: 'ไม่มี', to: 'headache_pattern' },
    ],
  },
  headache_pattern: {
    type: 'single',
    text: 'ลักษณะการปวดเป็นแบบไหน',
    options: [
      { label: 'ปวดตุบ ๆ ข้างเดียว คลื่นไส้ ไม่ชอบแสงหรือเสียง', to: 'outcome:headache_migraine' },
      { label: 'ปวดตื้อ ๆ รัดรอบศีรษะหรือท้ายทอย มักเป็นตอนเครียดหรืออดนอน', to: 'headache_bp_check' },
      { label: 'ปวดบริเวณหน้าผาก/โหนกแก้ม ร่วมกับคัดจมูก', to: 'outcome:headache_sinus' },
      { label: 'ไม่แน่ใจ', to: 'headache_bp_check' },
    ],
  },
  headache_bp_check: {
    type: 'single',
    text: 'มีความดันโลหิตสูง หรือไม่เคยวัดความดันมาก่อนเลยหรือไม่',
    options: [
      { label: 'ใช่', to: 'outcome:headache_bp' },
      { label: 'ไม่ใช่ ความดันปกติ', to: 'outcome:headache_tension' },
    ],
  },
  dizzy_type: {
    type: 'single',
    text: 'อาการเวียนเป็นแบบไหน',
    options: [
      { label: 'บ้านหมุน เป็นมากเวลาขยับศีรษะ อาจคลื่นไส้', to: 'outcome:dizziness_vertigo' },
      { label: 'หน้ามืด วูบ เวลาลุกขึ้นยืนเร็ว ๆ', to: 'outcome:dizziness_lightheaded' },
      { label: 'เวียนร่วมกับเดินเซ พูดไม่ชัด หรือเห็นภาพซ้อน', to: 'outcome:emergency' },
    ],
  },

  // ───────────── GI ─────────────
  gi_menu: {
    type: 'single',
    text: 'อาการไหนเด่นที่สุด',
    options: [
      { label: 'ปวดท้อง แสบท้อง จุกเสียด', to: 'abd_location' },
      { label: 'ท้องเสีย', to: 'diarrhea_blood' },
      { label: 'ท้องผูก', to: 'constipation_flags' },
      { label: 'คลื่นไส้ อาเจียน', to: 'vomit_severity' },
      { label: 'เมารถ เมาเรือ', to: 'outcome:motion_sickness' },
      { label: 'ปวดหรือมีก้อนที่ทวารหนัก', to: 'outcome:hemorrhoid' },
    ],
  },
  abd_location: {
    type: 'single',
    text: 'ปวดบริเวณไหน',
    options: [
      { label: 'ลิ้นปี่ หรือแสบร้อนกลางอก', to: 'upper_gi' },
      { label: 'ท้องน้อยด้านขวา หรือปวดรอบสะดือแล้วย้ายมาด้านขวาล่าง', to: 'outcome:abdominal_urgent' },
      { label: 'ท้องน้อย (ผู้หญิง)', to: 'lower_abd_female' },
      { label: 'ปวดทั่ว ๆ ท้องแบบบีบเป็นพัก ๆ', to: 'abd_severity' },
    ],
  },
  upper_gi: {
    type: 'single',
    text: 'อาการตรงกับแบบไหนมากกว่า',
    options: [
      { label: 'แสบร้อนกลางอก เรอเปรี้ยว เป็นมากหลังอาหารหรือเวลานอนราบ', to: 'outcome:gerd' },
      { label: 'จุกแน่น แสบท้อง ปวดตอนหิวหรือหลังอาหาร ท้องอืด', to: 'outcome:dyspepsia' },
      { label: 'ปวดรุนแรงตลอดเวลาหรือร้าวไปหลัง', to: 'outcome:abdominal_urgent' },
    ],
  },
  lower_abd_female: {
    type: 'route',
    rules: [{ when: { pregnancy: ['pregnant', 'maybe'] }, to: 'outcome:pregnancy_pain' }],
    to: 'lower_abd_female_q',
  },
  lower_abd_female_q: {
    type: 'single',
    text: 'อาการเกี่ยวข้องกับช่วงมีประจำเดือนหรือไม่',
    options: [
      { label: 'ใช่ ปวดช่วงก่อนหรือระหว่างมีประจำเดือน', to: 'outcome:dysmenorrhea' },
      { label: 'ไม่ใช่ ร่วมกับปัสสาวะแสบขัด', to: 'uti_flags' },
      { label: 'ไม่ใช่ ร่วมกับตกขาวผิดปกติหรือไข้', to: 'outcome:vaginal_doctor' },
      { label: 'ไม่ใช่ ปวดมากขึ้นเรื่อย ๆ', to: 'outcome:abdominal_urgent' },
    ],
  },
  abd_severity: {
    type: 'single',
    text: 'อาการปวดรุนแรงแค่ไหน',
    options: [
      { label: 'ปวดมากขึ้นเรื่อย ๆ ท้องแข็ง หรือมีไข้ร่วม', to: 'outcome:abdominal_urgent' },
      { label: 'ปวดบีบเป็นพัก ๆ ยังพอทนได้', to: 'outcome:abdominal_colic' },
    ],
  },

  diarrhea_blood: {
    type: 'single',
    text: 'อุจจาระมีมูกเลือด หรือมีไข้สูงร่วมด้วยหรือไม่',
    options: [
      { label: 'มี', to: 'outcome:diarrhea_dysentery' },
      { label: 'ไม่มี', to: 'diarrhea_dehydration' },
    ],
  },
  diarrhea_dehydration: {
    type: 'single',
    text: 'มีอาการขาดน้ำหรือไม่: ปัสสาวะน้อยหรือสีเข้มมาก ปากแห้ง อ่อนเพลียมาก หน้ามืดเวลาลุก หรือดื่มน้ำไม่ได้',
    options: [
      { label: 'มี', to: 'outcome:diarrhea_dehydration' },
      { label: 'ไม่มี', to: 'diarrhea_duration' },
    ],
  },
  diarrhea_duration: {
    type: 'single',
    text: 'ท้องเสียมานานแค่ไหน',
    options: [
      { label: 'ไม่เกิน 3 วัน', to: 'diarrhea_cause' },
      { label: 'มากกว่า 3 วัน', to: 'outcome:long_duration_doctor' },
    ],
  },
  diarrhea_cause: {
    type: 'single',
    text: 'เริ่มเป็นหลังกินอาหารที่สงสัยว่าไม่สะอาด หรือมีคนกินด้วยกันแล้วเป็นเหมือนกันหรือไม่',
    options: [
      { label: 'ใช่', to: 'outcome:diarrhea_food_poisoning' },
      { label: 'ไม่ใช่ หรือไม่แน่ใจ', to: 'outcome:diarrhea_simple' },
    ],
  },

  constipation_flags: {
    type: 'single',
    text: 'มีอาการต่อไปนี้หรือไม่: ถ่ายมีเลือด น้ำหนักลดโดยไม่ทราบสาเหตุ ปวดท้องมากร่วมกับไม่ผายลม หรือเริ่มท้องผูกครั้งแรกหลังอายุ 50 ปี',
    options: [
      { label: 'มี', to: 'outcome:constipation_redflag' },
      { label: 'ไม่มี', to: 'outcome:constipation_simple' },
    ],
  },

  vomit_severity: {
    type: 'single',
    text: 'อาเจียนรุนแรงแค่ไหน',
    options: [
      { label: 'อาเจียนตลอดจนดื่มน้ำไม่ได้ หรือปวดท้องมาก', to: 'outcome:vomiting_severe' },
      { label: 'คลื่นไส้ อาเจียนบ้าง ยังดื่มน้ำได้', to: 'vomit_cause' },
    ],
  },
  vomit_cause: {
    type: 'single',
    text: 'สาเหตุที่น่าจะเป็น',
    options: [
      { label: 'เดินทาง นั่งรถหรือเรือ', to: 'outcome:motion_sickness' },
      { label: 'ร่วมกับท้องเสีย', to: 'diarrhea_blood' },
      { label: 'อาจตั้งครรภ์', to: 'outcome:other_pharmacist' },
      { label: 'ไม่ทราบสาเหตุ', to: 'outcome:vomiting_simple' },
    ],
  },

  // ───────────── skin ─────────────
  skin_menu: {
    type: 'single',
    text: 'ปัญหาผิวหนังแบบไหน',
    options: [
      { label: 'ผื่นหรือตุ่มคัน', to: 'rash_drug' },
      { label: 'แผล รอยถลอก หรือถูกสัตว์กัด', to: 'wound_type' },
      { label: 'แผลไฟไหม้ น้ำร้อนลวก', to: 'burn_size' },
      { label: 'สิว', to: 'outcome:acne' },
      { label: 'ผิวบวมแดงร้อน กดเจ็บ', to: 'outcome:skin_infection' },
    ],
  },
  rash_drug: {
    type: 'single',
    text: 'ผื่นขึ้นหลังเริ่มใช้ยาใหม่ภายใน 2 เดือนที่ผ่านมาหรือไม่',
    options: [
      { label: 'ใช่', to: 'outcome:drug_allergy' },
      { label: 'ไม่ใช่', to: 'rash_look' },
    ],
  },
  rash_look: {
    type: 'single',
    text: 'ลักษณะผื่นตรงกับแบบไหนมากที่สุด',
    options: [
      { label: 'ปื้นนูนแดงคัน ขึ้นเร็วยุบเร็ว ย้ายที่ไปมา', to: 'outcome:urticaria' },
      { label: 'ตุ่มแดงคันเป็นจุด ๆ ตรงที่ถูกแมลงกัด', to: 'outcome:insect_bite' },
      { label: 'วงขอบชัด ขอบแดงมีขุย คัน หรือขาวลอกตามซอกนิ้วเท้า', to: 'outcome:fungal_skin' },
      { label: 'ผื่นแดงคันตรงที่สัมผัสสิ่งของหรือสารเคมี', to: 'outcome:contact_dermatitis' },
      { label: 'ตุ่มน้ำใสเป็นกลุ่ม เรียงเป็นแนวข้างเดียว ปวดแสบ', to: 'outcome:shingles_possible' },
      { label: 'ไม่ตรงกับแบบไหนเลย', to: 'outcome:other_pharmacist' },
    ],
  },
  wound_type: {
    type: 'single',
    text: 'แผลเป็นแบบไหน',
    options: [
      { label: 'ถูกสุนัข แมว หรือสัตว์อื่นกัดหรือข่วน', to: 'outcome:wound_doctor' },
      { label: 'แผลลึก ยาว ขอบแยก หรือเลือดไม่ค่อยหยุด', to: 'outcome:wound_doctor' },
      { label: 'ถูกตะปูหรือของสกปรกตำ', to: 'outcome:wound_doctor' },
      { label: 'แผลถลอกหรือแผลตื้นขนาดเล็ก', to: 'outcome:wound_minor' },
    ],
  },
  burn_size: {
    type: 'single',
    text: 'แผลไฟไหม้มีลักษณะแบบไหน',
    options: [
      { label: 'ใหญ่กว่าฝ่ามือ หรืออยู่ที่หน้า มือ เท้า ข้อพับ อวัยวะเพศ หรือผิวขาวซีด/ดำไหม้', to: 'outcome:burn_major' },
      { label: 'แดง หรือมีตุ่มน้ำเล็ก ๆ ขนาดเล็กกว่าฝ่ามือ', to: 'outcome:burn_minor' },
    ],
  },

  // ───────────── musculoskeletal ─────────────
  msk_menu: {
    type: 'single',
    text: 'ปวดบริเวณไหน',
    options: [
      { label: 'หลัง หรือเอว', to: 'back_flags' },
      { label: 'ข้อ (เข่า ข้อเท้า นิ้ว ฯลฯ)', to: 'joint_type' },
      { label: 'กล้ามเนื้อ หรือหลังบาดเจ็บ/ใช้งานหนัก', to: 'injury_severity' },
    ],
  },
  back_flags: {
    type: 'single',
    text: 'มีอาการชาหรืออ่อนแรงที่ขา กลั้นปัสสาวะหรืออุจจาระไม่ได้ หรือมีไข้ร่วมหรือไม่',
    options: [
      { label: 'มี', to: 'outcome:back_pain_redflag' },
      { label: 'ไม่มี', to: 'back_duration' },
    ],
  },
  back_duration: {
    type: 'single',
    text: 'ปวดมานานแค่ไหน',
    options: [
      { label: 'ไม่เกิน 6 สัปดาห์', to: 'outcome:back_pain_simple' },
      { label: 'มากกว่า 6 สัปดาห์', to: 'outcome:long_duration_doctor' },
    ],
  },
  joint_type: {
    type: 'single',
    text: 'อาการข้อเป็นแบบไหน',
    options: [
      { label: 'ข้อบวมแดงร้อนปวดมาก เป็นทันที (มักเป็นข้อเดียว)', to: 'outcome:joint_gout' },
      { label: 'หลังบาดเจ็บ บวมมาก ลงน้ำหนักไม่ได้ หรือผิดรูป', to: 'outcome:injury_xray' },
      { label: 'ปวดข้อเรื้อรังหลายเดือน ข้อฝืดตอนเช้า', to: 'outcome:joint_chronic' },
      { label: 'ปวดเล็กน้อยหลังใช้งานหนัก', to: 'outcome:muscle_strain' },
    ],
  },
  injury_severity: {
    type: 'single',
    text: 'บาดเจ็บรุนแรงแค่ไหน',
    options: [
      { label: 'บวมมาก ผิดรูป ขยับไม่ได้ หรือลงน้ำหนักไม่ได้', to: 'outcome:injury_xray' },
      { label: 'ปวดเมื่อย ตึง ยังใช้งานได้', to: 'outcome:muscle_strain' },
    ],
  },

  // ───────────── eye / ear / mouth ─────────────
  eent_menu: {
    type: 'single',
    text: 'ไม่สบายที่ส่วนไหน',
    options: [
      { label: 'ตา', to: 'eye_flags' },
      { label: 'หู', to: 'ear_type' },
      { label: 'แผลในปาก', to: 'outcome:mouth_ulcer' },
      { label: 'ปวดฟัน', to: 'outcome:toothache' },
    ],
  },
  eye_flags: {
    type: 'single',
    text: 'มีอาการต่อไปนี้หรือไม่: ปวดตามาก ตามัวลง สู้แสงไม่ได้ หรือมีสารเคมี/วัตถุเข้าตา',
    options: [
      { label: 'มี', to: 'outcome:eye_urgent' },
      { label: 'ไม่มี', to: 'eye_type' },
    ],
  },
  eye_type: {
    type: 'single',
    text: 'ตาแดงแบบไหน',
    options: [
      { label: 'คันตามาก น้ำตาไหล เป็นทั้งสองข้าง ร่วมกับจาม', to: 'outcome:conjunctivitis_allergic' },
      { label: 'มีขี้ตามาก ตาแฉะ ลืมตาตอนเช้ายาก', to: 'outcome:conjunctivitis_infective' },
      { label: 'ไม่แน่ใจ', to: 'outcome:conjunctivitis_infective' },
    ],
  },
  ear_type: {
    type: 'single',
    text: 'อาการทางหูเป็นแบบไหน',
    options: [
      { label: 'ปวดหูร่วมกับไข้หรือเป็นหวัด', to: 'outcome:ear_otitis_media' },
      { label: 'ปวดหู คันหู ดึงใบหูแล้วเจ็บ หลังว่ายน้ำหรือแคะหู', to: 'outcome:ear_otitis_externa' },
      { label: 'หูอื้อ ได้ยินน้อยลง ไม่ปวด', to: 'outcome:ear_wax' },
      { label: 'มีหนองหรือน้ำไหลจากหู', to: 'outcome:ear_otitis_media' },
    ],
  },

  // ───────────── urinary / women's health ─────────────
  gu_menu: {
    type: 'single',
    text: 'อาการแบบไหน',
    options: [
      { label: 'ปัสสาวะแสบขัด ปัสสาวะบ่อย', to: 'uti_flags' },
      { label: 'ปวดประจำเดือน', to: 'lower_abd_female' },
      { label: 'ตกขาวผิดปกติ คันช่องคลอด', to: 'vaginal_type' },
    ],
  },
  uti_flags: {
    type: 'single',
    text: 'มีไข้ หนาวสั่น ปวดหลังบั้นเอว หรือปัสสาวะเป็นเลือดหรือไม่',
    options: [
      { label: 'มี', to: 'outcome:fever_urinary' },
      { label: 'ไม่มี', to: 'uti_group' },
    ],
  },
  uti_group: {
    type: 'route',
    rules: [
      { when: { sex: ['male'] }, to: 'outcome:uti_complicated' },
      { when: { pregnancy: ['pregnant', 'maybe'] }, to: 'outcome:uti_complicated' },
      { when: { age: ['infant3m', 'infant', 'toddler', 'child'] }, to: 'outcome:uti_complicated' },
    ],
    to: 'uti_recurrent',
  },
  uti_recurrent: {
    type: 'single',
    text: 'เป็นแบบนี้บ่อยหรือไม่ (3 ครั้งขึ้นไปใน 1 ปี)',
    options: [
      { label: 'ใช่', to: 'outcome:uti_complicated' },
      { label: 'ไม่ใช่', to: 'outcome:uti_simple' },
    ],
  },
  vaginal_type: {
    type: 'single',
    text: 'ตกขาวมีลักษณะแบบไหน',
    options: [
      { label: 'ก้อนขาวคล้ายนมบูด คันมาก ไม่มีกลิ่นเหม็น', to: 'outcome:vaginal_candida' },
      { label: 'มีกลิ่นเหม็นคาว สีเทา เหลือง หรือเขียว', to: 'outcome:vaginal_doctor' },
      { label: 'ร่วมกับปวดท้องน้อยหรือมีไข้', to: 'outcome:vaginal_doctor' },
    ],
  },
};
