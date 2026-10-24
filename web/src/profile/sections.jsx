// The profile form, split into sections. The first-time setup shows one section per screen and the profile page
// shows them all; both pass the same `f` (form) and `set(patch)`.
import { useState } from 'react';
import { Button, Field, Icon, Notice } from '../components/ui.jsx';
import { AllergyEditor } from '../pages/Health.jsx';
import {
  ALCOHOL, BLOOD, CONDITIONS, EXERCISE, FAMILY_HISTORY, MONTHS, OCCUPATIONS, OCCUPATION_OTHER, OTHER_ALLERGIES, PREGNANCY, SEX, SMOKING,
  ageOf, bmiOf,
} from './model.js';

// One answer from a short list; tapping the chosen one again clears it.
function Choice({ options, value, onChange, label }) {
  return (
    <div className="chips chips-wrap" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" className={`chip${value === v ? ' on' : ''}`} aria-pressed={value === v} onClick={() => onChange(value === v ? '' : v)}>{text}</button>
      ))}
    </div>
  );
}

// Several answers from a list, plus anything typed in.
function MultiChips({ options, value, onChange, placeholder, label }) {
  const [custom, setCustom] = useState('');
  const toggle = (c) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  const extras = value.filter((c) => !options.includes(c));
  const add = (e) => {
    e.preventDefault();
    const c = custom.trim();
    if (c && !value.includes(c)) onChange([...value, c]);
    setCustom('');
  };
  return (
    <div className="stack">
      <div className="chips chips-wrap" role="group" aria-label={label}>
        {[...options, ...extras].map((c) => (
          <button key={c} type="button" className={`chip${value.includes(c) ? ' on' : ''}`} aria-pressed={value.includes(c)} onClick={() => toggle(c)}>{c}</button>
        ))}
      </div>
      <form className="add-row" onSubmit={add}>
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={80} />
        <Button size="sm" variant="secondary" type="submit" disabled={!custom.trim()}><Icon name="plus" size={18} stroke={2.6} />เพิ่ม</Button>
      </form>
    </div>
  );
}

// A list of short texts (current medicines).
function TextList({ value, onChange, placeholder, empty }) {
  const [draft, setDraft] = useState('');
  const add = (e) => {
    e.preventDefault();
    const t = draft.trim();
    if (t) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="stack">
      {value.length ? (
        <ul className="text-list">
          {value.map((t, i) => (
            <li key={`${t}-${i}`}>
              <Icon name="pill" size={18} /><span>{t}</span>
              <button type="button" className="x" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`ลบ ${t}`}><Icon name="close" size={16} stroke={2.4} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">{empty}</p>}
      <form className="add-row" onSubmit={add}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={120} />
        <Button size="sm" variant="secondary" type="submit" disabled={!draft.trim()}><Icon name="plus" size={18} stroke={2.6} />เพิ่ม</Button>
      </form>
    </div>
  );
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function PersonalSection({ f, set }) {
  const age = ageOf(f);
  return (
    <div className="stack-lg">
      <Field label="ชื่อ-นามสกุล *">
        <input name="name" autoComplete="name" value={f.displayName} onChange={(e) => set({ displayName: e.target.value })} placeholder="เช่น สมศรี ใจดี" maxLength={100} />
      </Field>
      <div className="field">
        <span className="field-label" id="birth-label">วันเกิด</span>
        <div className="birth-row" role="group" aria-labelledby="birth-label">
          <select aria-label="วัน" value={f.birthDay} onChange={(e) => set({ birthDay: e.target.value })}>
            <option value="">วัน</option>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select aria-label="เดือน" value={f.birthMonth} onChange={(e) => set({ birthMonth: e.target.value })}>
            <option value="">เดือน</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input aria-label="ปีเกิด พ.ศ." type="number" inputMode="numeric" value={f.birthYearBE} onChange={(e) => set({ birthYearBE: e.target.value })} placeholder="ปี พ.ศ. เช่น 2535" />
        </div>
        <span className="field-hint">{age !== null ? `อายุประมาณ ${age} ปี · ` : ''}ขนาดยาและข้อห้ามใช้ยาขึ้นกับอายุ รู้แค่ปีเกิดก็กรอกได้</span>
      </div>
      <div className="field">
        <span className="field-label">เพศ</span>
        <Choice label="เพศ" options={SEX} value={f.sex} onChange={(sex) => set({ sex })} />
      </div>
      <div className="field">
        <span className="field-label">อาชีพ</span>
        <select aria-label="อาชีพ" value={f.occupation} onChange={(e) => set({ occupation: e.target.value })}>
          <option value="">เลือกอาชีพ</option>
          {[...OCCUPATIONS, OCCUPATION_OTHER].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {f.occupation === OCCUPATION_OTHER ? (
          <input aria-label="ระบุอาชีพ" value={f.occupationOther} onChange={(e) => set({ occupationOther: e.target.value })} placeholder="ระบุอาชีพของคุณ" maxLength={80} />
        ) : null}
        <span className="field-hint">อาชีพช่วยให้เภสัชกรแนะนำได้ตรงขึ้น เช่น งานกะกลางคืน งานที่ต้องขับรถ หรือสัมผัสสารเคมี</span>
      </div>
      <Field label="เบอร์โทรศัพท์" hint="ใช้ให้ร้านยาและคนส่งติดต่อเมื่อมีปัญหากับคำสั่งซื้อ">
        <input type="tel" name="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="08x-xxx-xxxx" maxLength={20} />
      </Field>
    </div>
  );
}

export function BodySection({ f, set }) {
  const bmi = bmiOf(f);
  return (
    <div className="stack-lg">
      <div className="grid-2">
        <Field label="ส่วนสูง (ซม.)"><input type="number" inputMode="decimal" min={50} max={250} value={f.heightCm} onChange={(e) => set({ heightCm: e.target.value })} placeholder="เช่น 165" /></Field>
        <Field label="น้ำหนัก (กก.)"><input type="number" inputMode="decimal" min={2} max={400} value={f.weightKg} onChange={(e) => set({ weightKg: e.target.value })} placeholder="เช่น 58" /></Field>
      </div>
      {bmi ? (
        <p className="bmi" role="status">ค่าดัชนีมวลกาย (BMI) ประมาณ <strong className="num">{bmi.value.toFixed(1)}</strong> · {bmi.label} <span className="muted small">เป็นค่าโดยประมาณ ไม่ใช่การวินิจฉัย</span></p>
      ) : null}
      <div className="field">
        <span className="field-label">หมู่เลือด</span>
        <Choice label="หมู่เลือด" options={BLOOD.map((b) => [b, b])} value={f.bloodType} onChange={(bloodType) => set({ bloodType })} />
      </div>
      {f.sex === 'female' ? (
        <div className="field">
          <span className="field-label">การตั้งครรภ์และให้นมบุตร</span>
          <Choice label="การตั้งครรภ์" options={PREGNANCY} value={f.pregnancy} onChange={(pregnancy) => set({ pregnancy })} />
          <span className="field-hint">ยาหลายชนิดไม่เหมาะกับช่วงตั้งครรภ์และให้นมบุตร เภสัชกรจะใช้ข้อมูลนี้เตือนเท่านั้น</span>
        </div>
      ) : null}
      <div className="field">
        <span className="field-label">การสูบบุหรี่</span>
        <Choice label="การสูบบุหรี่" options={SMOKING} value={f.smoking} onChange={(smoking) => set({ smoking })} />
      </div>
      <div className="field">
        <span className="field-label">การดื่มแอลกอฮอล์</span>
        <Choice label="การดื่มแอลกอฮอล์" options={ALCOHOL} value={f.alcohol} onChange={(alcohol) => set({ alcohol })} />
      </div>
      <div className="field">
        <span className="field-label">การออกกำลังกาย</span>
        <Choice label="การออกกำลังกาย" options={EXERCISE} value={f.exercise} onChange={(exercise) => set({ exercise })} />
      </div>
    </div>
  );
}

export function AllergySection({ f, set }) {
  return (
    <div className="stack-lg">
      <div className="field">
        <span className="field-label">แพ้ยา</span>
        <AllergyEditor value={f.allergies} onChange={(allergies) => set({ allergies, noAllergies: false })} />
      </div>
      <div className="field">
        <span className="field-label">แพ้อาหารและสิ่งอื่น ๆ</span>
        <MultiChips label="แพ้อาหารและสิ่งอื่น ๆ" options={OTHER_ALLERGIES} value={f.otherAllergies} onChange={(otherAllergies) => set({ otherAllergies, noAllergies: false })} placeholder="พิมพ์สิ่งที่แพ้อื่น ๆ" />
      </div>
      {!f.allergies.length && !f.otherAllergies.length ? (
        <label className="check">
          <input type="checkbox" checked={f.noAllergies} onChange={(e) => set({ noAllergies: e.target.checked })} />
          ฉันไม่เคยแพ้ยา อาหาร หรือสิ่งใดเลย
        </label>
      ) : null}
    </div>
  );
}

export function HistorySection({ f, set }) {
  return (
    <div className="stack-lg">
      <div className="field">
        <span className="field-label">โรคประจำตัว</span>
        <MultiChips label="โรคประจำตัว" options={CONDITIONS} value={f.conditions} onChange={(conditions) => set({ conditions, noConditions: false })} placeholder="พิมพ์โรคอื่น ๆ" />
        {!f.conditions.length ? (
          <label className="check">
            <input type="checkbox" checked={f.noConditions} onChange={(e) => set({ noConditions: e.target.checked })} />
            ฉันไม่มีโรคประจำตัว
          </label>
        ) : null}
      </div>
      <div className="field">
        <span className="field-label">ยาที่ใช้อยู่ตอนนี้</span>
        <TextList value={f.currentMeds} onChange={(currentMeds) => set({ currentMeds })} placeholder="ชื่อยาและขนาด เช่น Amlodipine 5 mg" empty="ยังไม่มียาที่ใช้ประจำ รวมถึงยาที่ซื้อเองและยาทาหรือยาพ่น" />
        <span className="field-hint">อยากให้ระบบเตือนเวลากินยาและยาใกล้หมด เพิ่มได้ในเมนู "ยาของฉัน" ภายหลัง</span>
      </div>
      <Field label="วิตามิน อาหารเสริม และสมุนไพรที่กินเป็นประจำ">
        <input value={f.supplements} onChange={(e) => set({ supplements: e.target.value })} placeholder="เช่น วิตามินซี น้ำมันปลา ขมิ้นชัน" maxLength={300} />
      </Field>
      <Field label="เคยผ่าตัดหรือนอนโรงพยาบาลด้วยเรื่องอะไร" hint="ระบุเรื่องและปีโดยย่อ เช่น ผ่าตัดไส้ติ่ง 2560">
        <textarea rows={2} value={f.surgeries} onChange={(e) => set({ surgeries: e.target.value })} maxLength={500} aria-label="ประวัติการผ่าตัดและการนอนโรงพยาบาล" />
      </Field>
      <Field label="หมายเหตุอื่นถึงเภสัชกร" hint="เช่น กลืนยาเม็ดใหญ่ลำบาก ใช้ยาแล้วง่วงมาก ไม่ชอบรสยาน้ำบางชนิด">
        <textarea rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} aria-label="หมายเหตุถึงเภสัชกร" />
      </Field>
    </div>
  );
}

export function FamilySection({ f, set }) {
  return (
    <div className="stack-lg">
      <p className="muted">โรคที่พ่อ แม่ พี่น้อง หรือปู่ย่าตายายเคยเป็น บางโรคมีแนวโน้มเป็นในครอบครัว เภสัชกรใช้ประกอบการแนะนำเท่านั้น</p>
      <MultiChips label="โรคในครอบครัว" options={FAMILY_HISTORY} value={f.familyHistory} onChange={(familyHistory) => set({ familyHistory })} placeholder="พิมพ์โรคอื่น ๆ ในครอบครัว" />
    </div>
  );
}

// Moves the home pin to where the phone is now (asks for permission; nothing is stored except the saved coordinates).
function PinButton({ f, set }) {
  const [msg, setMsg] = useState('');
  const here = () => {
    if (!navigator.geolocation) return setMsg('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
    setMsg('กำลังหาตำแหน่ง…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { set({ addressGeo: { lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) } }); setMsg('ปักหมุดแล้ว กด "บันทึก" เพื่อใช้ตำแหน่งนี้'); },
      () => setMsg('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง อนุญาตในเบราว์เซอร์แล้วลองใหม่'),
    );
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <Button size="sm" variant="secondary" onClick={here}><Icon name="locate" size={18} />ปักหมุดบ้านที่ตำแหน่งปัจจุบัน</Button>
      <span className="muted small" role="status">
        {msg || (f.addressGeo ? `พิกัดที่ใช้อยู่: ${f.addressGeo.lat.toFixed(4)}, ${f.addressGeo.lng.toFixed(4)}` : 'ยังไม่มีพิกัดบ้าน')}
      </span>
    </div>
  );
}

export function ContactSection({ f, set }) {
  const setEmergency = (patch) => set({ emergency: { ...f.emergency, ...patch } });
  return (
    <div className="stack-lg">
      <div className="field">
        <span className="field-label">ผู้ติดต่อฉุกเฉิน</span>
        <div className="grid-2">
          <input aria-label="ชื่อผู้ติดต่อฉุกเฉิน" value={f.emergency.name} onChange={(e) => setEmergency({ name: e.target.value })} placeholder="ชื่อ" maxLength={100} />
          <input aria-label="เบอร์โทรผู้ติดต่อฉุกเฉิน" type="tel" inputMode="tel" value={f.emergency.phone} onChange={(e) => setEmergency({ phone: e.target.value })} placeholder="เบอร์โทร" maxLength={20} />
        </div>
        <input aria-label="ความสัมพันธ์" value={f.emergency.relation} onChange={(e) => setEmergency({ relation: e.target.value })} placeholder="ความสัมพันธ์ เช่น ลูกสาว คู่สมรส" maxLength={60} />
        <span className="field-hint">ใช้เมื่อเกิดเหตุฉุกเฉินเท่านั้น</span>
      </div>
      <Field label="ที่อยู่จัดส่ง" hint="แผนที่เลือกร้านใช้พิกัดบ้านเป็นจุดเริ่ม และคำนวณค่าส่งกับเวลาเดินทางจากพิกัดนี้">
        <textarea rows={2} value={f.addressLine} onChange={(e) => set({ addressLine: e.target.value })} maxLength={300} placeholder="บ้านเลขที่ ซอย ถนน แขวง เขต จังหวัด รหัสไปรษณีย์" aria-label="ที่อยู่จัดส่ง" />
      </Field>
      <PinButton f={f} set={set} />
    </div>
  );
}

export function ConsentSection({ f, set }) {
  return (
    <div className="stack-lg">
      <label className="check consent">
        <input type="checkbox" checked={f.shareWithPharmacist} onChange={(e) => set({ shareWithPharmacist: e.target.checked })} />
        <span>อนุญาตให้เภสัชกรของร้านที่ฉันสั่งยาหรือขอคำปรึกษา เห็นอายุ เพศ น้ำหนัก ประวัติแพ้ยา โรคประจำตัว และยาที่ใช้อยู่ เฉพาะตอนที่ฉันสั่งหรือขอคำปรึกษากับร้านนั้น</span>
      </label>
      <Notice tone="info" title="ข้อมูลของคุณปลอดภัยอย่างไร">
        <ul className="plain-list">
          <li>ข้อมูลสุขภาพเห็นได้เฉพาะคุณ และคนในครอบครัวที่คุณให้สิทธิ์ดูเท่านั้น</li>
          <li>ผู้ดูแลแพลตฟอร์มอ่านข้อมูลสุขภาพของคุณไม่ได้</li>
          <li>เภสัชกรเห็นเฉพาะสรุปที่จำเป็นต่อการจ่ายยา และเฉพาะเมื่อคุณอนุญาตข้อด้านบน</li>
          <li>แก้ไขข้อมูลหรือถอนความยินยอมได้ทุกเมื่อที่หน้าโปรไฟล์ หรือลบบัญชีและข้อมูลทั้งหมดได้</li>
        </ul>
      </Notice>
      <p className="muted small">ข้อมูลที่กรอกใช้ช่วยให้เภสัชกรเลือกยาได้ปลอดภัยขึ้น ไม่ใช่การวินิจฉัยโรค ถ้าไม่อนุญาต เภสัชกรอาจต้องถามข้อมูลเพิ่มก่อนจ่ายยา</p>
    </div>
  );
}

// [id, title, short description, component] in the order of the first-time setup.
export const SECTIONS = [
  ['personal', 'ข้อมูลส่วนตัว', 'ชื่อ วันเกิด เพศ และอาชีพ', PersonalSection],
  ['body', 'ร่างกายและไลฟ์สไตล์', 'ส่วนสูง น้ำหนัก หมู่เลือด และนิสัยด้านสุขภาพ', BodySection],
  ['allergy', 'ประวัติการแพ้', 'แพ้ยา อาหาร และสิ่งอื่น ๆ', AllergySection],
  ['history', 'โรคและยาที่ใช้', 'โรคประจำตัว ยาที่ใช้อยู่ และประวัติการรักษา', HistorySection],
  ['family', 'ประวัติครอบครัว', 'โรคที่คนในครอบครัวเคยเป็น', FamilySection],
  ['contact', 'ติดต่อและที่อยู่', 'ผู้ติดต่อฉุกเฉินและที่อยู่จัดส่ง', ContactSection],
  ['consent', 'ความยินยอม', 'ตรวจสอบและยืนยัน', ConsentSection],
];
