import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAction, useDocData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { Badge, Button, Card, ErrorText, Field, Loading, Notice, Segmented } from '../components/ui.jsx';

const SEVERITY = [['mild', 'เล็กน้อย'], ['moderate', 'ปานกลาง'], ['severe', 'รุนแรง']];
const COMMON_CONDITIONS = [
  'ความดันโลหิตสูง', 'เบาหวาน', 'ไขมันในเลือดสูง', 'โรคหัวใจ', 'โรคไต', 'โรคตับ',
  'หอบหืด', 'ภูมิแพ้', 'โรคกระเพาะ', 'ไทรอยด์', 'ภูมิคุ้มกันต่ำ', 'ใช้ยาละลายลิ่มเลือด',
];
const thisYear = new Date().getFullYear();

const empty = { allergies: [], conditions: [], notes: '', shareWithPharmacist: true };

function fromDoc(d) {
  if (!d) return empty;
  return {
    allergies: d.allergies ?? [],
    conditions: d.conditions ?? [],
    notes: d.notes ?? '',
    shareWithPharmacist: d.consent?.shareWithPharmacist !== false,
  };
}

export function AllergyEditor({ value, onChange }) {
  const [substance, setSubstance] = useState('');
  const [reaction, setReaction] = useState('');
  const [severity, setSeverity] = useState('moderate');
  const add = () => {
    if (!substance.trim()) return;
    onChange([...value, { substance: substance.trim(), reaction: reaction.trim(), severity }]);
    setSubstance('');
    setReaction('');
  };
  return (
    <div className="stack">
      {value.length ? (
        <div className="list">
          {value.map((a, i) => (
            <div key={`${a.substance}-${i}`} className="list-item">
              <div className="list-item-main">
                <strong>{a.substance}</strong>
                <div className="muted small">{a.reaction || 'ไม่ได้ระบุอาการ'} · {SEVERITY.find(([k]) => k === a.severity)?.[1] ?? '—'}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`ลบ ${a.substance}`}>ลบ</Button>
            </div>
          ))}
        </div>
      ) : <p className="muted small">ยังไม่มีประวัติแพ้ยา ถ้าไม่เคยแพ้ยาก็เว้นไว้ได้</p>}
      <div className="grid-2">
        <Field label="ชื่อยาหรือสารที่แพ้"><input value={substance} onChange={(e) => setSubstance(e.target.value)} placeholder="เช่น เพนิซิลลิน, ซัลฟา, แอสไพริน" /></Field>
        <Field label="อาการที่เคยเป็น"><input value={reaction} onChange={(e) => setReaction(e.target.value)} placeholder="เช่น ผื่น, ปากบวม, หายใจลำบาก" /></Field>
      </div>
      <div className="row">
        <Segmented value={severity} onChange={setSeverity} options={SEVERITY} />
        <Button size="sm" variant="secondary" onClick={add} disabled={!substance.trim()}>+ เพิ่มประวัติแพ้ยา</Button>
      </div>
    </div>
  );
}

function ConditionPicker({ value, onChange }) {
  const [custom, setCustom] = useState('');
  const toggle = (c) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  const extras = value.filter((c) => !COMMON_CONDITIONS.includes(c));
  return (
    <div className="stack">
      <div className="chip-row">
        {[...COMMON_CONDITIONS, ...extras].map((c) => (
          <button key={c} type="button" className={`btn btn-sm ${value.includes(c) ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={value.includes(c)} onClick={() => toggle(c)}>
            {c}
          </button>
        ))}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (custom.trim() && !value.includes(custom.trim())) onChange([...value, custom.trim()]); setCustom(''); }}>
        <input style={{ flex: '1 1 200px' }} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="โรคอื่น ๆ" aria-label="เพิ่มโรคประจำตัวอื่น" />
        <Button size="sm" variant="secondary" type="submit" disabled={!custom.trim()}>เพิ่ม</Button>
      </form>
    </div>
  );
}

export function HealthForm({ patient }) {
  const { user } = useSession();
  const [health, loading] = useDocData(doc(db, 'patients', patient.id, 'health', 'profile'), [patient.id]);
  const [form, setForm] = useState(empty);
  const [birthYear, setBirthYear] = useState(patient.birthYear ?? '');
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const editable = patient.isOwner || patient.viaHouse;

  useEffect(() => { setForm(fromDoc(health)); }, [health]);
  useEffect(() => { setBirthYear(patient.birthYear ?? ''); setSaved(false); }, [patient.id, patient.birthYear]);

  if (loading) return <Loading />;
  const set = (k) => (v) => { setForm({ ...form, [k]: v }); setSaved(false); };

  const save = () => run(async () => {
    // Thai users usually know their year in พ.ศ.; store ค.ศ. as the field expects.
    let year = birthYear === '' ? null : Number(birthYear);
    if (year !== null && year > thisYear && year - 543 <= thisYear) year -= 543;
    if (year !== null && !(Number.isInteger(year) && year >= 1900 && year <= thisYear)) {
      throw new Error('ปีเกิดไม่ถูกต้อง กรอกเป็น ค.ศ. เช่น 1985 หรือ พ.ศ. เช่น 2528');
    }
    if (year !== (patient.birthYear ?? null)) {
      await updateDoc(doc(db, 'patients', patient.id), {
        displayName: patient.displayName, archived: patient.archived ?? false, birthYear: year,
      });
    }
    await setDoc(doc(db, 'patients', patient.id, 'health', 'profile'), {
      allergies: form.allergies,
      conditions: form.conditions,
      notes: form.notes,
      consent: { shareWithPharmacist: form.shareWithPharmacist, updatedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
    setSaved(true);
  });

  if (!editable) {
    return (
      <Card className="stack">
        <Notice tone="info">คุณดูข้อมูลนี้ในฐานะผู้ดูแล เฉพาะเจ้าของข้อมูลเท่านั้นที่แก้ไขได้</Notice>
        <p><strong>ปีเกิด:</strong> {patient.birthYear ?? 'ไม่ได้ระบุ'}</p>
        <p><strong>แพ้ยา:</strong> {form.allergies.length ? form.allergies.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ') : 'ไม่ได้บันทึก'}</p>
        <p><strong>โรคประจำตัว:</strong> {form.conditions.join(', ') || 'ไม่ได้บันทึก'}</p>
        {form.notes ? <p><strong>หมายเหตุ:</strong> {form.notes}</p> : null}
      </Card>
    );
  }

  return (
    <div className="stack-lg">
      <Card className="stack">
        <h2>ข้อมูลพื้นฐาน</h2>
        <Field label="ปีเกิด" hint="กรอกเป็น ค.ศ. หรือ พ.ศ. ก็ได้ ใช้คำนวณอายุ เพราะขนาดยาและข้อห้ามขึ้นกับอายุ">
          <input type="number" name="birth-year" inputMode="numeric" autoComplete="off" min={1900} max={thisYear + 543} value={birthYear} onChange={(e) => { setBirthYear(e.target.value); setSaved(false); }} placeholder="เช่น 1985 หรือ 2528" />
        </Field>
      </Card>

      <Card className="stack">
        <div className="between"><h2>ประวัติแพ้ยา</h2>{form.allergies.length ? <Badge tone="bad">{form.allergies.length} รายการ</Badge> : null}</div>
        <AllergyEditor value={form.allergies} onChange={set('allergies')} />
      </Card>

      <Card className="stack">
        <h2>โรคประจำตัว</h2>
        <ConditionPicker value={form.conditions} onChange={set('conditions')} />
      </Card>

      <Card className="stack">
        <h2>หมายเหตุสำหรับเภสัชกร</h2>
        <textarea rows={3} maxLength={1000} value={form.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="เช่น ตั้งครรภ์ ให้นมบุตร กลืนยาเม็ดใหญ่ลำบาก" aria-label="หมายเหตุ" />
      </Card>

      <Card className="stack">
        <h2>ความยินยอม</h2>
        <label className="check">
          <input type="checkbox" checked={form.shareWithPharmacist} onChange={(e) => set('shareWithPharmacist')(e.target.checked)} />
          อนุญาตให้เภสัชกรของร้านที่ฉันสั่งยาหรือขอคำปรึกษา เห็นประวัติแพ้ยา โรคประจำตัว และยาที่ใช้อยู่
        </label>
        <p className="muted small">
          เภสัชกรเห็นข้อมูลเฉพาะตอนที่คุณสั่งยาหรือขอคำปรึกษาจากร้านนั้น และผู้ดูแลแพลตฟอร์มไม่เห็นข้อมูลนี้
          ถ้าปิด เภสัชกรอาจต้องถามข้อมูลเพิ่มก่อนจ่ายยา
        </p>
      </Card>

      <div className="row">
        <Button busy={busy} onClick={save}>บันทึก</Button>
        <span role="status" aria-live="polite">{saved ? <Badge tone="good">บันทึกแล้ว</Badge> : null}</span>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
