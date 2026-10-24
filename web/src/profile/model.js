// The personal and health profile as one form. It is read from and written to three places, so the rest of the
// app can keep using them as before:
//   users/{uid}                      account: name, phone, emergency contact, delivery address, onboardedAt
//   patients/{pid}                   displayName and birthYear (what the ordering flow and rules already use)
//   patients/{pid}/health/profile    sensitive part: allergies, conditions, notes, consent, about{}, history{}
// The sensitive part is readable only by the owner and caregivers with viewHealth, never by platform admins.
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';

export const SEX = [['female', 'หญิง'], ['male', 'ชาย'], ['other', 'อื่น ๆ'], ['unspecified', 'ไม่ระบุ']];
export const BLOOD = ['A', 'B', 'AB', 'O', 'ไม่ทราบ'];
export const OCCUPATIONS = [
  'นักเรียน / นักศึกษา', 'พนักงานบริษัท', 'ข้าราชการ / รัฐวิสาหกิจ', 'ธุรกิจส่วนตัว / ค้าขาย', 'รับจ้างทั่วไป',
  'เกษตรกร', 'บุคลากรทางการแพทย์', 'ครู / อาจารย์', 'แม่บ้าน / พ่อบ้าน', 'เกษียณอายุ', 'ไม่ได้ทำงาน',
];
export const OCCUPATION_OTHER = 'อื่น ๆ';
export const PREGNANCY = [['none', 'ไม่ได้ตั้งครรภ์'], ['pregnant', 'ตั้งครรภ์'], ['breastfeeding', 'ให้นมบุตร'], ['planning', 'วางแผนตั้งครรภ์']];
export const SMOKING = [['never', 'ไม่สูบ'], ['former', 'เคยสูบ เลิกแล้ว'], ['current', 'สูบอยู่']];
export const ALCOHOL = [['none', 'ไม่ดื่ม'], ['occasional', 'นาน ๆ ครั้ง'], ['regular', 'ดื่มเป็นประจำ']];
export const EXERCISE = [['none', 'แทบไม่ออกกำลังกาย'], ['light', '1–2 ครั้ง / สัปดาห์'], ['regular', '3 ครั้งขึ้นไป / สัปดาห์']];
export const SEVERITY = [['mild', 'เล็กน้อย'], ['moderate', 'ปานกลาง'], ['severe', 'รุนแรง']];
export const CONDITIONS = [
  'ความดันโลหิตสูง', 'เบาหวาน', 'ไขมันในเลือดสูง', 'โรคหัวใจ', 'โรคหลอดเลือดสมอง', 'โรคไต', 'โรคตับ',
  'หอบหืด', 'ถุงลมโป่งพอง (COPD)', 'ภูมิแพ้', 'โรคกระเพาะ / กรดไหลย้อน', 'ไทรอยด์', 'เกาต์ / ข้ออักเสบ', 'กระดูกพรุน',
  'ลมชัก', 'ซึมเศร้า / วิตกกังวล', 'ภูมิคุ้มกันต่ำ', 'ใช้ยาละลายลิ่มเลือด', 'มะเร็ง (เคยหรือกำลังรักษา)',
];
export const OTHER_ALLERGIES = ['อาหารทะเล', 'ถั่ว', 'นมวัว', 'ไข่', 'แป้งสาลี / กลูเตน', 'ฝุ่น / ละอองเกสร', 'ยางลาเท็กซ์', 'แมลงกัดต่อย'];
export const FAMILY_HISTORY = [
  'เบาหวาน', 'ความดันโลหิตสูง', 'โรคหัวใจ', 'โรคหลอดเลือดสมอง', 'มะเร็ง', 'โรคไต', 'หอบหืด / ภูมิแพ้',
  'ไขมันในเลือดสูง', 'โรคทางพันธุกรรม', 'โรคทางจิตเวช',
];
export const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const pad = (n) => String(n).padStart(2, '0');
const str = (v) => (v == null ? '' : String(v));
const txt = (v) => str(v).trim();
const numOrNull = (v) => (txt(v) === '' ? null : Number(v));

export const emptyForm = () => ({
  displayName: '', phone: '',
  birthDay: '', birthMonth: '', birthYearBE: '',
  sex: '', occupation: '', occupationOther: '',
  heightCm: '', weightKg: '', bloodType: '', pregnancy: '',
  smoking: '', alcohol: '', exercise: '',
  allergies: [], otherAllergies: [], noAllergies: false,
  conditions: [], noConditions: false, currentMeds: [], supplements: '', surgeries: '', notes: '',
  familyHistory: [],
  emergency: { name: '', phone: '', relation: '' },
  addressLine: '',
  addressGeo: null,
  shareWithPharmacist: true,
});

// Builds the form from the three documents (any of them may be missing).
export function fromDocs(user, patient, health) {
  const f = emptyForm();
  const about = health?.about ?? {};
  const history = health?.history ?? {};
  f.displayName = user?.displayName ?? patient?.displayName ?? '';
  f.phone = user?.phone ?? '';
  const iso = typeof about.birthDate === 'string' ? about.birthDate.split('-').map(Number) : null;
  if (iso?.length === 3) [f.birthYearBE, f.birthMonth, f.birthDay] = [String(iso[0] + 543), String(iso[1]), String(iso[2])];
  else if (patient?.birthYear) f.birthYearBE = String(patient.birthYear + 543);
  f.sex = about.sex ?? '';
  const job = about.occupation ?? '';
  if (job && !OCCUPATIONS.includes(job)) { f.occupation = OCCUPATION_OTHER; f.occupationOther = job; } else f.occupation = job;
  f.heightCm = str(about.heightCm);
  f.weightKg = str(about.weightKg);
  f.bloodType = about.bloodType ?? '';
  f.pregnancy = about.pregnancy ?? '';
  f.smoking = about.smoking ?? '';
  f.alcohol = about.alcohol ?? '';
  f.exercise = about.exercise ?? '';
  f.allergies = health?.allergies ?? [];
  f.otherAllergies = history.otherAllergies ?? [];
  f.noAllergies = history.noAllergies === true;
  f.noConditions = history.noConditions === true;
  f.conditions = health?.conditions ?? [];
  f.currentMeds = history.currentMeds ?? [];
  f.supplements = history.supplements ?? '';
  f.surgeries = history.surgeries ?? '';
  f.notes = health?.notes ?? '';
  f.familyHistory = history.familyHistory ?? [];
  f.emergency = { name: user?.emergencyContact?.name ?? '', phone: user?.emergencyContact?.phone ?? '', relation: user?.emergencyContact?.relation ?? '' };
  f.addressLine = user?.addresses?.[0]?.line1 ?? '';
  f.addressGeo = user?.addresses?.[0]?.geo ?? null;
  f.shareWithPharmacist = health?.consent?.shareWithPharmacist !== false;
  return f;
}

// Birth date: year alone is fine; day and month only count together with the year. Years may be พ.ศ. or ค.ศ.
export function parseBirth(f) {
  const d = txt(f.birthDay);
  const m = txt(f.birthMonth);
  const y = txt(f.birthYearBE);
  if (!d && !m && !y) return { empty: true, year: null, iso: null };
  let year = Number(y);
  if (year > 2400) year -= 543;
  const thisYear = new Date().getFullYear();
  if (!y || !Number.isInteger(year) || year < 1900 || year > thisYear) return { error: 'ปีเกิดไม่ถูกต้อง เช่น พ.ศ. 2528' };
  if (!d && !m) return { year, iso: null };
  const day = Number(d);
  const month = Number(m);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (!d || !m || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day || dt.getTime() > Date.now()) return { error: 'วันเกิดไม่ถูกต้อง ตรวจวัน เดือน และปีอีกครั้ง' };
  return { year, iso: `${year}-${pad(month)}-${pad(day)}` };
}

export function ageOf(f) {
  const b = parseBirth(f);
  if (!b.year) return null;
  const now = new Date();
  let age = now.getFullYear() - b.year;
  if (b.iso) {
    const [, m, d] = b.iso.split('-').map(Number);
    if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  }
  return age;
}

export function bmiOf(f) {
  const h = Number(f.heightCm);
  const w = Number(f.weightKg);
  if (!(h >= 50 && h <= 250 && w >= 2 && w <= 400)) return null;
  const value = w / ((h / 100) ** 2);
  // Asian-Pacific cut-offs, shown as a rough guide only.
  const label = value < 18.5 ? 'น้ำหนักน้อย' : value < 23 ? 'สมส่วน' : value < 25 ? 'น้ำหนักเกิน' : value < 30 ? 'อ้วนระดับ 1' : 'อ้วนระดับ 2';
  return { value, label };
}

// First problem in the form, or null. Optional fields only complain when filled in wrongly.
export function validate(f) {
  if (!txt(f.displayName)) return 'กรอกชื่อ-นามสกุลก่อน';
  const b = parseBirth(f);
  if (b.error) return b.error;
  if (txt(f.heightCm) && !(Number(f.heightCm) >= 50 && Number(f.heightCm) <= 250)) return 'ส่วนสูงควรอยู่ระหว่าง 50–250 ซม.';
  if (txt(f.weightKg) && !(Number(f.weightKg) >= 2 && Number(f.weightKg) <= 400)) return 'น้ำหนักควรอยู่ระหว่าง 2–400 กก.';
  for (const [label, v] of [['เบอร์โทร', f.phone], ['เบอร์โทรผู้ติดต่อฉุกเฉิน', f.emergency.phone]]) {
    if (txt(v) && !/^[0-9+\-\s()]{8,20}$/.test(txt(v))) return `${label}ไม่ถูกต้อง`;
  }
  if (f.occupation === OCCUPATION_OTHER && !txt(f.occupationOther)) return 'ระบุอาชีพของคุณ หรือเลือกอาชีพที่ใกล้เคียง';
  return null;
}

// Share of the useful fields that are filled in, and what is still missing (for the profile page).
export function completeness(f) {
  const b = parseBirth(f);
  const checks = [
    ['ชื่อ-นามสกุล', Boolean(txt(f.displayName))],
    ['วันเกิด', Boolean(b.iso)],
    ['เพศ', Boolean(f.sex)],
    ['อาชีพ', Boolean(f.occupation)],
    ['เบอร์โทร', Boolean(txt(f.phone))],
    ['ส่วนสูงและน้ำหนัก', Boolean(txt(f.heightCm) && txt(f.weightKg))],
    ['ไลฟ์สไตล์ (สูบบุหรี่ แอลกอฮอล์ ออกกำลังกาย)', Boolean(f.smoking && f.alcohol && f.exercise)],
    ['ประวัติการแพ้ (ตอบว่าไม่มีก็นับ)', f.allergies.length > 0 || f.otherAllergies.length > 0 || f.noAllergies === true],
    ['โรคประจำตัว', f.conditions.length > 0 || f.noConditions === true],
    ['ผู้ติดต่อฉุกเฉิน', Boolean(txt(f.emergency.name) && txt(f.emergency.phone))],
    ['ที่อยู่จัดส่ง', Boolean(txt(f.addressLine))],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter(([, ok]) => !ok).map(([label]) => label) };
}

// Writes the form to the three places in one batch. With `lenient` (skipping the rest of the setup) invalid optional
// values are dropped instead of blocking the save. `finish` marks the first-time setup as done.
export async function saveProfile({ uid, user, patient, form, finish = false, lenient = false }) {
  const f = lenient ? { ...form } : form;
  if (lenient) {
    if (parseBirth(f).error) { f.birthDay = ''; f.birthMonth = ''; f.birthYearBE = ''; }
    if (txt(f.heightCm) && !(Number(f.heightCm) >= 50 && Number(f.heightCm) <= 250)) f.heightCm = '';
    if (txt(f.weightKg) && !(Number(f.weightKg) >= 2 && Number(f.weightKg) <= 400)) f.weightKg = '';
    if (txt(f.phone) && !/^[0-9+\-\s()]{8,20}$/.test(txt(f.phone))) f.phone = '';
    if (txt(f.emergency.phone) && !/^[0-9+\-\s()]{8,20}$/.test(txt(f.emergency.phone))) f.emergency = { ...f.emergency, phone: '' };
    if (f.occupation === OCCUPATION_OTHER && !txt(f.occupationOther)) f.occupation = '';
  } else {
    const problem = validate(f);
    if (problem) throw new Error(problem);
  }
  const birth = parseBirth(f);
  const job = f.occupation === OCCUPATION_OTHER ? txt(f.occupationOther) : f.occupation;
  const showPregnancy = f.sex === 'female';
  const pid = patient.id;
  const batch = writeBatch(db);

  const userPatch = {
    displayName: txt(f.displayName),
    phone: txt(f.phone) || null,
    emergencyContact: txt(f.emergency.name) || txt(f.emergency.phone)
      ? { name: txt(f.emergency.name), phone: txt(f.emergency.phone), relation: txt(f.emergency.relation) }
      : null,
  };
  const address = user?.addresses?.[0];
  const geoMoved = f.addressGeo && (f.addressGeo.lat !== address?.geo?.lat || f.addressGeo.lng !== address?.geo?.lng);
  if (txt(f.addressLine) && (!address || txt(f.addressLine) !== address.line1 || geoMoved)) {
    // The map, delivery fee and travel time all use the pin, so a changed pin is saved together with the text.
    userPatch.addresses = [{ label: 'บ้าน', ...address, line1: txt(f.addressLine), ...(f.addressGeo ? { geo: f.addressGeo } : {}) }, ...(user?.addresses ?? []).slice(1)];
  }
  if (finish) userPatch.onboardedAt = serverTimestamp();
  batch.update(doc(db, 'users', uid), userPatch);

  batch.update(doc(db, 'patients', pid), { displayName: txt(f.displayName), archived: patient.archived ?? false, birthYear: birth.year ?? null });

  batch.set(doc(db, 'patients', pid, 'health', 'profile'), {
    allergies: f.allergies,
    conditions: f.conditions,
    notes: txt(f.notes),
    consent: { shareWithPharmacist: f.shareWithPharmacist, updatedAt: serverTimestamp() },
    about: {
      birthDate: birth.iso ?? null,
      sex: f.sex || null,
      occupation: job || null,
      heightCm: numOrNull(f.heightCm),
      weightKg: numOrNull(f.weightKg),
      bloodType: f.bloodType || null,
      pregnancy: showPregnancy ? f.pregnancy || null : null,
      smoking: f.smoking || null,
      alcohol: f.alcohol || null,
      exercise: f.exercise || null,
    },
    history: {
      otherAllergies: f.otherAllergies,
      noAllergies: f.noAllergies && !f.allergies.length && !f.otherAllergies.length,
      noConditions: f.noConditions && !f.conditions.length,
      currentMeds: f.currentMeds,
      supplements: txt(f.supplements),
      surgeries: txt(f.surgeries),
      familyHistory: f.familyHistory,
    },
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  try {
    await batch.commit();
  } catch (err) {
    if (err?.code === 'permission-denied') {
      throw new Error('บันทึกไม่สำเร็จ ฐานข้อมูลไม่อนุญาตให้บันทึกข้อมูลโปรไฟล์ในตอนนี้ (กฎความปลอดภัยฝั่งเซิร์ฟเวอร์อาจยังไม่อัปเดต) ลองใหม่ภายหลังหรือแจ้งผู้ดูแลระบบ');
    }
    throw err;
  }
}
