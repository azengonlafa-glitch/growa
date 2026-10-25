// Symptom consultation history management with local storage and demo records.

const STORAGE_KEY = 'growa_symptom_history_v1';

// Seed sample historical consultations for realistic demo and initial review
const SEED_HISTORY = [
  {
    id: 'sym-001',
    date: '2026-10-22T10:15:00.000Z',
    title: 'ไข้หวัด เจ็บคอ มีน้ำมูกใส',
    route: 'self_care',
    routeText: 'ดูแลตัวเองเบื้องต้นได้',
    duration: '2-3 วัน',
    severity: 'เล็กน้อยถึงปานกลาง',
    symptoms: ['เจ็บคอตอนกลืน', 'คัดจมูกน้ำมูกใส', 'ครั่นเนื้อครั่นตัว'],
    redFlags: 'ไม่มีสัญญาณอันตราย (ไม่มีหอบเหนื่อย, ไม่มีไข้สูงลอย)',
    advice: [
      'พักผ่อนให้เพียงพออย่างน้อย 7-8 ชั่วโมงต่อวัน',
      'ดื่มน้ำอุ่นบ่อย ๆ เพื่อช่วยละลายเสมหะและบรรเทาอาการเจ็บคอ',
      'ใช้น้ำเกลือกลั้วคอวันละ 2-3 ครั้ง',
      'หากมีไข้เกิน 38.5°C ติดต่อกันเกิน 3 วัน หรือเริ่มไอหอบ ให้ไปพบแพทย์',
    ],
    suggestedMeds: ['พาราเซตามอล 500 มก.', 'ยาแก้แพ้ลดน้ำมูก (Loratadine หรือ Cetirizine)', 'ยาอมบรรเทาอาการเจ็บคอ'],
    source: 'guided',
  },
  {
    id: 'sym-002',
    date: '2026-10-14T16:40:00.000Z',
    title: 'ปวดศีรษะตึงตัว ท้ายทอยและขมับ',
    route: 'pharmacist',
    routeText: 'ควรปรึกษาเภสัชกรหน้าร้าน',
    duration: '1 สัปดาห์ (เป็น ๆ หาย ๆ)',
    severity: 'ปานกลาง รบกวนการทำงาน',
    symptoms: ['ปวดตื้อ ๆ รอบศีรษะ', 'ปวดกล้ามเนื้อบ่าไหล่ตึง', 'ทำงานหน้าคอมพิวเตอร์นาน'],
    redFlags: 'ไม่มีอาการตาพร่ามัว ไม่มีแขนขาอ่อนแรง หรือปากเบี้ยว',
    advice: [
      'พักสายตาจากหน้าจอทุก 45 นาที และยืดเหยียดกล้ามเนื้อคอบ่าไหล่',
      'ตรวจสอบความดันโลหิตเบื้องต้นที่ร้านขายยา',
      'ปรึกษาเภสัชกรเพื่อเลือกยาแก้ปวดที่เหมาะสมกับโรคประจำตัวของคุณ',
    ],
    suggestedMeds: ['ยาแก้ปวดพาราเซตามอล', 'ยาทาคลายกล้ามเนื้อเฉพาะที่'],
    source: 'chat',
  },
  {
    id: 'sym-003',
    date: '2026-09-28T09:20:00.000Z',
    title: 'แสบท้อง แน่นหน้าอกหลังรับประทานอาหาร (กรดไหลย้อน)',
    route: 'self_care',
    routeText: 'ดูแลตัวเองเบื้องต้นได้และปรับพฤติกรรม',
    duration: '3-4 วัน',
    severity: 'ปานกลางหลังมื้อเย็น',
    symptoms: ['เรอเปรี้ยว', 'แสบร้อนกลางอก', 'ท้องอืดแน่นท้อง'],
    redFlags: 'ไม่มีอาการกลืนลำบาก ไม่มีอาเจียนเป็นเลือด',
    advice: [
      'หลีกเลี่ยงการนอนราบทันทีหลังรับประทานอาหารอย่างน้อย 3 ชั่วโมง',
      'ลดอาหารรสจัด ของมัน ของทอด ชา กาแฟ และน้ำอัดลม',
      'แบ่งรับประทานอาหารเป็นมื้อเล็ก ๆ เคี้ยวให้ละเอียด',
    ],
    suggestedMeds: ['ยาลดกรดชนิดน้ำหรือเคี้ยว (Antacids)', 'ยาน้ำบรรเทากรดไหลย้อน (Sodium Alginate)'],
    source: 'guided',
  },
];

export function getSymptomHistory(patientId = 'default') {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${patientId}`);
    if (!raw) {
      // Seed with initial realistic records so the user immediately sees history
      localStorage.setItem(`${STORAGE_KEY}_${patientId}`, JSON.stringify(SEED_HISTORY));
      return SEED_HISTORY;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load symptom history', e);
    return SEED_HISTORY;
  }
}

export function saveSymptomRecord(patientId = 'default', record) {
  try {
    const current = getSymptomHistory(patientId);
    const newRecord = {
      id: record.id || `sym-${Date.now()}`,
      date: record.date || new Date().toISOString(),
      title: record.title || 'ประเมินอาการทั่วไป',
      route: record.route || 'self_care',
      routeText: record.routeText || 'ดูแลตัวเองเบื้องต้นได้',
      duration: record.duration || 'ไม่ระบุ',
      severity: record.severity || 'ปานกลาง',
      symptoms: record.symptoms || [],
      redFlags: record.redFlags || 'ผ่านการคัดกรองอาการฉุกเฉินแล้ว',
      advice: record.advice || ['พักผ่อนให้เพียงพอ', 'สังเกตอาการต่อเนื่อง'],
      suggestedMeds: record.suggestedMeds || [],
      source: record.source || 'guided',
    };
    const updated = [newRecord, ...current];
    localStorage.setItem(`${STORAGE_KEY}_${patientId}`, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('Failed to save symptom record', e);
    return [];
  }
}

export function clearSymptomHistory(patientId = 'default') {
  try {
    localStorage.removeItem(`${STORAGE_KEY}_${patientId}`);
  } catch (e) {
    console.warn('Failed to clear symptom history', e);
  }
}
