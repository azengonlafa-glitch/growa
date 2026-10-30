import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteField, doc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { go, useAction, useQueryData } from '../lib/hooks.js';
import { useSession, can } from '../lib/session.js';
import { useMeds, useTodaySchedule, daysLeft, isLow, DOSE_STATUS } from '../lib/meds.js';
import { NAMED_TIME_LABELS, bangkokDayStart, DAY_MS } from '../../../functions/src/schedule.js';
import './meds.css';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorText, Field, Icon, Loading, Notice, Segmented } from '../components/ui.jsx';

const clock = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
const MEAL_TEXT = { before: 'ก่อนอาหาร', after: 'หลังอาหาร', with: 'พร้อมอาหาร' };

// Which part of the day a dose belongs to: เช้า 08:00 · เที่ยง 12:00 · เย็น 18:00 · ก่อนนอน 21:00 (other times by the hour).
export const PERIODS = [['morning', 'เช้า', 0, 10], ['noon', 'เที่ยง', 10, 15], ['evening', 'เย็น', 15, 19], ['bedtime', 'ก่อนนอน', 19, 24]];
export const periodOf = (time) => { const h = Number(time.slice(0, 2)); return PERIODS.find(([, , a, b]) => h >= a && h < b) ?? PERIODS[3]; };

export function DoseRow({ slot, patient }) {
  const { user, memberNames } = useSession();
  const { busy, error, run } = useAction();
  const due = slot.at <= Date.now();
  const log = (status) => run(async () => {
    const ref = await addDoc(collection(db, 'patients', patient.id, 'doseLogs'), {
      medicationId: slot.med.id,
      scheduledFor: Timestamp.fromMillis(slot.at),
      status,
      loggedBy: user.uid,
      loggedAt: serverTimestamp(),
      ...(slot.log ? { correctsLogId: slot.log.id } : {}),
    });
    // Updates the stock estimate and tells caregivers about a confirmed miss.
    // The dose is already saved, so a failure here (e.g. quota) must not look like the log was lost; the hook is idempotent.
    await call('afterDoseLog', { patientId: patient.id, logId: ref.id }).catch((e) => console.warn('afterDoseLog failed', e?.code));
  });
  const [label, tone] = slot.log ? DOSE_STATUS[slot.log.status] : due ? ['ยังไม่ได้บันทึก', 'warn'] : ['ยังไม่ถึงเวลา', 'neutral'];

  return (
    <div className="dose-slot">
      <div className="between">
        <span className="dose-time num">{slot.time}</span>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div>
        <strong style={{ fontSize: '1.15rem' }}>{slot.med.name}</strong>
        <div className="muted small">ครั้งละ {slot.med.dosePerIntake} {slot.med.unit ?? ''}{MEAL_TEXT[slot.med.mealRelation] ? ` · ${MEAL_TEXT[slot.med.mealRelation]}` : ''}</div>
        {slot.log?.loggedAt?.toMillis ? (
          <div className="dose-when small">บันทึกเมื่อ {clock.format(slot.log.loggedAt.toMillis())} น.{slot.log.loggedBy ? ` · โดย ${slot.log.loggedBy === user.uid ? 'คุณ' : memberNames?.[slot.log.loggedBy] ?? 'ผู้ดูแล'}` : ''}</div>
        ) : null}
      </div>
      {can(patient, 'logDoses') && (!slot.log || slot.log.status !== 'taken') ? (
        <div className="row">
          <Button busy={busy} onClick={() => log('taken')} style={{ flex: '1 1 100%' }} aria-label={`กินแล้ว ${slot.med.name} ${slot.time}`}><Icon name="check" stroke={2.8} />กินแล้ว</Button>
          {due ? (
            <ConfirmButton size="sm" busy={busy} question="ยืนยันว่าพลาดมื้อนี้?" yes="ยืนยันว่าพลาด" onConfirm={() => log('missed')} ariaLabel={`พลาดมื้อนี้ ${slot.med.name} ${slot.time}`}>พลาดมื้อนี้</ConfirmButton>
          ) : null}
          <Button size="sm" variant="ghost" busy={busy} onClick={() => log('skipped')} aria-label={`งดตามแพทย์สั่ง ${slot.med.name} ${slot.time}`}>งดตามแพทย์สั่ง</Button>
        </div>
      ) : null}
      {can(patient, 'logDoses') && slot.log?.status === 'taken' ? (
        <div className="row">
          <span className="hint">บันทึกผิด? แก้เป็น</span>
          <ConfirmButton size="sm" busy={busy} question="ยืนยันว่ายังไม่ได้กิน?" yes="ยืนยันว่าพลาด" onConfirm={() => log('missed')} ariaLabel={`แก้เป็นพลาดมื้อ ${slot.med.name} ${slot.time}`}>พลาดมื้อนี้</ConfirmButton>
          <Button size="sm" variant="ghost" busy={busy} onClick={() => log('skipped')} aria-label={`แก้เป็นงดมื้อนี้ ${slot.med.name} ${slot.time}`}>งดมื้อนี้</Button>
        </div>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function RefillForm({ patient, med, onDone }) {
  const [partners] = useQueryData(query(collection(db, 'pharmacies'), where('verificationStatus', '==', 'approved')), []);
  const [pharmacyId, setPharmacyId] = useState('');
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const { busy, error, run, setError } = useAction();

  const choose = async (id) => {
    setPharmacyId(id);
    setProduct(null);
    if (!id) return;
    const snap = await getDocs(query(collection(db, 'pharmacies', id, 'products'), where('catalogId', '==', med.catalogId ?? '-'), where('active', '==', true)));
    if (snap.empty) setError('ร้านนี้ไม่มียานี้ในรายการ ลองเลือกร้านอื่น');
    else {
      setError(null);
      setProduct({ id: snap.docs[0].id, ...snap.docs[0].data() });
    }
  };

  return (
    <Card className="stack">
      <h3>ขอเติมยา: {med.name}</h3>
      <p className="muted small">ระบบไม่สั่งยาซ้ำอัตโนมัติ กรุณาตรวจว่ายังใช้ยาเดิมในขนาดเดิมก่อนยืนยัน</p>
      {!med.catalogId ? <Notice tone="warn">ยานี้ยังไม่ได้เชื่อมกับฐานข้อมูลยา กรุณาปรึกษาเภสัชกรโดยตรง</Notice> : (
        <>
          <Field label="เลือกร้าน">
            <select value={pharmacyId} onChange={(e) => choose(e.target.value)}>
              <option value="">— เลือกร้านพาร์ทเนอร์ —</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          {product ? (
            <Field label={`จำนวน (${product.packSize} · ฿${product.price})`} hint={product.unitsPerPack ? `ได้ ${product.unitsPerPack * qty} ${med.unit ?? 'หน่วย'}` : null}>
              <input type="number" min={1} max={10} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </Field>
          ) : null}
          <Button busy={busy} disabled={!product} onClick={() => run(async () => {
            const res = await call('createRefillRequest', {
              patientId: patient.id, pharmacyId, items: [{ productId: product.id, qty, medicationId: med.id }],
            });
            onDone();
            go(`orders/${res.orderId}`);
          })}>ส่งคำขอเติมยา</Button>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

// ───────── medicine list: one table, one form ─────────
// Each medicine holds: name + strength, form, related condition, times, before/after meal, how long to take it,
// what is left, and a free note (cautions). The table shows name, condition, times, type and what is left.
const FORMS = [
  ['tablet', 'ยาเม็ด', 'เม็ด'], ['capsule', 'แคปซูล', 'แคปซูล'], ['liquid', 'ยาน้ำ', 'มล.'], ['injection', 'ยาฉีด', 'ครั้ง'],
  ['topical', 'ยาทา/ครีม', 'ครั้ง'], ['drops', 'ยาหยอด', 'หยด'], ['inhaler', 'ยาพ่น', 'ครั้ง'], ['other', 'อื่น ๆ', 'หน่วย'],
];
const FORM_LABEL = Object.fromEntries(FORMS.map(([k, l]) => [k, l]));
const FORM_UNIT = Object.fromEntries(FORMS.map(([k, , u]) => [k, u]));
const TIME_OPTIONS = ['morning', 'noon', 'evening', 'bedtime'];
const MEAL = { before: 'ก่อนอาหาร', after: 'หลังอาหาร', with: 'พร้อมอาหาร', none: 'ไม่เกี่ยวกับอาหาร' };
const COMMON_CONDITIONS = ['ความดันโลหิตสูง', 'เบาหวาน', 'ไขมันในเลือดสูง', 'โรคหัวใจ', 'โรคไต', 'โรคกระเพาะ', 'หอบหืด', 'ภูมิแพ้', 'ไทรอยด์', 'ปวด/อักเสบ'];
const timeLabel = (t) => NAMED_TIME_LABELS[t] ?? t;
const endMs = (med) => med.endDate?.toMillis?.() ?? null;
const startMs = (med) => med.startDate?.toMillis?.() ?? null;
const daysOfCourse = (med) => (endMs(med) && startMs(med) ? Math.max(1, Math.round((endMs(med) - startMs(med)) / DAY_MS)) : null);

function AddMedForm({ patient, med = null, onDone }) {
  const { user } = useSession();
  const [catalog] = useQueryData(collection(db, 'catalog'), []);
  const [f, setF] = useState(() => (med ? {
    name: med.name, form: med.form ?? 'tablet', condition: med.condition ?? '', catalogId: med.catalogId ?? '',
    dosePerIntake: med.dosePerIntake, unit: med.unit ?? '', times: med.times ?? [], mealRelation: med.mealRelation ?? 'none',
    duration: endMs(med) ? 'days' : 'ongoing', days: daysOfCourse(med) ?? 30,
    stockOnHand: med.stockOnHand ?? 0, refillThresholdDays: med.refillThresholdDays ?? 7, notes: med.notes ?? '',
  } : {
    name: '', form: 'tablet', condition: '', catalogId: '', dosePerIntake: 1, unit: 'เม็ด', times: ['morning'], mealRelation: 'after',
    duration: 'ongoing', days: 30, stockOnHand: 30, refillThresholdDays: 7, notes: '',
  }));
  const [customTime, setCustomTime] = useState('');
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggleTime = (t, on) => setF((x) => ({ ...x, times: on ? [...x.times, t] : x.times.filter((y) => y !== t) }));
  const pickForm = (k) => setF((x) => ({ ...x, form: k, unit: !x.unit || x.unit === FORM_UNIT[x.form] ? FORM_UNIT[k] : x.unit }));
  const customTimes = f.times.filter((t) => !TIME_OPTIONS.includes(t));
  const valid = f.name.trim() && f.times.length && (f.duration === 'ongoing' || Number(f.days) >= 1);

  const save = () => run(async () => {
    const { catalogId, duration, days, ...rest } = f;
    const today = bangkokDayStart(Date.now());
    const start = med && startMs(med) ? startMs(med) : today;
    const course = duration === 'days'
      ? { startDate: Timestamp.fromMillis(start), endDate: Timestamp.fromMillis(start + Math.round(Number(days)) * DAY_MS) }
      : { startDate: Timestamp.fromMillis(start), endDate: med ? deleteField() : undefined };
    if (course.endDate === undefined) delete course.endDate;
    const data = {
      ...rest,
      name: f.name.trim(),
      condition: f.condition.trim(),
      notes: f.notes.trim(),
      dosePerIntake: Number(f.dosePerIntake),
      stockOnHand: Number(f.stockOnHand),
      refillThresholdDays: Number(f.refillThresholdDays),
      ...course,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    };
    if (med) {
      // Editing keeps the stock-count date unless the count itself changed.
      await updateDoc(med.ref, {
        ...data,
        catalogId: catalogId || deleteField(),
        ...(Number(f.stockOnHand) !== med.stockOnHand ? { stockCountedAt: serverTimestamp() } : {}),
      });
      await call('afterMedicationWrite', { patientId: patient.id, medicationId: med.id });
    } else {
      const medRef = doc(collection(db, 'patients', patient.id, 'medications'));
      await setDoc(medRef, { ...data, ...(catalogId ? { catalogId } : {}), asNeeded: false, active: true, stockCountedAt: serverTimestamp() });
      await call('afterMedicationWrite', { patientId: patient.id, medicationId: medRef.id });
    }
    onDone();
  });

  return (
    <Card className="stack-lg med-form">
      <div>
        <h3>{med ? `แก้ไขยา: ${med.name}` : 'เพิ่มยา'}</h3>
        <p className="muted small">กรอกตามฉลากยาหรือที่แพทย์/เภสัชกรสั่ง</p>
      </div>

      <fieldset className="med-sec">
        <legend>ยาอะไร</legend>
        <Field label="ชื่อยาและขนาดยา"><input required autoComplete="off" value={f.name} onChange={set('name')} placeholder="เช่น Metformin 500 mg" maxLength={200} /></Field>
        <Field label="รูปแบบยา">
          <div className="chip-row" role="group" aria-label="รูปแบบยา">
            {FORMS.map(([k, label]) => (
              <button key={k} type="button" className={`btn btn-sm ${f.form === k ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={f.form === k} onClick={() => pickForm(k)}>{label}</button>
            ))}
          </div>
        </Field>
        <Field label="โรคที่เกี่ยวข้อง" hint="ไม่บังคับ เช่น ความดันโลหิตสูง">
          <input list="med-conditions" autoComplete="off" value={f.condition} onChange={set('condition')} placeholder="เช่น เบาหวาน" maxLength={100} />
          <datalist id="med-conditions">{COMMON_CONDITIONS.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="เชื่อมกับฐานข้อมูลยา (เพื่อสั่งเติมยาได้)">
          <select value={f.catalogId} onChange={set('catalogId')}>
            <option value="">— ไม่เชื่อม —</option>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.genericName} {c.strength}</option>)}
          </select>
        </Field>
      </fieldset>

      <fieldset className="med-sec">
        <legend>ใช้เมื่อไร</legend>
        <div className="grid-2">
          <Field label="ครั้งละ"><input type="number" min={0.25} step={0.25} value={f.dosePerIntake} onChange={set('dosePerIntake')} /></Field>
          <Field label="หน่วย"><input autoComplete="off" value={f.unit} onChange={set('unit')} /></Field>
        </div>
        <Field label="เวลาใช้ยา">
          <div className="chip-row">
            {TIME_OPTIONS.map((t) => (
              <label key={t} className="check"><input type="checkbox" checked={f.times.includes(t)} onChange={(e) => toggleTime(t, e.target.checked)} />{NAMED_TIME_LABELS[t]}</label>
            ))}
            {customTimes.map((t) => (
              <button key={t} type="button" className="btn btn-sm btn-secondary" onClick={() => toggleTime(t, false)} aria-label={`เอาเวลา ${t} ออก`}>{t} ✕</button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} aria-label="เวลาที่กำหนดเอง" style={{ maxWidth: 160 }} />
            <Button size="sm" variant="secondary" disabled={!customTime || f.times.includes(customTime)} onClick={() => { toggleTime(customTime, true); setCustomTime(''); }}>+ เพิ่มเวลา</Button>
          </div>
        </Field>
        <Field label="ก่อน/หลังอาหาร">
          <Segmented label="ก่อนหรือหลังอาหาร" value={f.mealRelation} onChange={(v) => setF((x) => ({ ...x, mealRelation: v }))} options={[['before', 'ก่อนอาหาร'], ['after', 'หลังอาหาร'], ['with', 'พร้อมอาหาร'], ['none', 'ไม่ระบุ']]} />
        </Field>
        <Field label="ระยะเวลาการใช้ยา">
          <Segmented label="ระยะเวลาการใช้ยา" value={f.duration} onChange={(v) => setF((x) => ({ ...x, duration: v }))} options={[['ongoing', 'ใช้ต่อเนื่อง'], ['days', 'กำหนดจำนวนวัน']]} />
          {f.duration === 'days' ? (
            <div className="row" style={{ marginTop: 8 }}>
              <input type="number" min={1} max={730} inputMode="numeric" value={f.days} onChange={set('days')} aria-label="จำนวนวันที่ใช้ยา" style={{ maxWidth: 140 }} /> <span>วัน นับจากวันนี้</span>
            </div>
          ) : null}
        </Field>
      </fieldset>

      <fieldset className="med-sec">
        <legend>เหลือเท่าไร</legend>
        <div className="grid-2">
          <Field label="จำนวนยาคงเหลือ" hint="นับจากของจริง"><input type="number" min={0} value={f.stockOnHand} onChange={set('stockOnHand')} /></Field>
          <Field label="เตือนเมื่อเหลือ (วัน)"><input type="number" min={0} max={90} value={f.refillThresholdDays} onChange={set('refillThresholdDays')} /></Field>
        </div>
        <Field label="หมายเหตุเพิ่มเติม" hint="เช่น ข้อควรระวัง">
          <textarea rows={2} maxLength={500} value={f.notes} onChange={set('notes')} placeholder="เช่น ห้ามดื่มแอลกอฮอล์ ง่วงนอนได้" />
        </Field>
      </fieldset>

      <div className="row">
        <Button busy={busy} disabled={!valid} onClick={save}>บันทึก</Button>
        <Button variant="secondary" onClick={onDone}>ยกเลิก</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

// "ใช้ 30 วัน (เหลือ 12 วัน)" / "สิ้นสุดแล้ว" / null when it is ongoing
function courseText(med) {
  const end = endMs(med);
  if (!end) return null;
  const left = Math.ceil((end - Date.now()) / DAY_MS);
  const total = daysOfCourse(med);
  return left <= 0 ? { text: `ใช้ครบ ${total} วันแล้ว`, over: true } : { text: `ใช้ ${total} วัน · เหลือ ${left} วัน`, over: false };
}

function MedRow({ med, patient, onRefill, onEdit }) {
  const { user } = useSession();
  const { busy, error, run } = useAction();
  const left = daysLeft(med);
  const course = courseText(med);
  const canEdit = can(patient, 'editMeds');
  return (
    <tr className={course?.over ? 'med-over' : ''}>
      <td data-label="ชื่อยา" className="med-name">
        <strong>{med.name}</strong>
        <span className="muted small">ครั้งละ {med.dosePerIntake} {med.unit ?? ''}</span>
        {course ? <span className={`small ${course.over ? 'med-warn' : 'muted'}`}>{course.text}</span> : null}
        {med.notes ? <span className="med-note small"><Icon name="info" size={14} />{med.notes}</span> : null}
      </td>
      <td data-label="โรค">{med.condition || <span className="muted">—</span>}</td>
      <td data-label="เวลาใช้ยา">
        {med.asNeeded ? 'เมื่อมีอาการ' : (med.times ?? []).map(timeLabel).join(' · ')}
        {med.mealRelation && med.mealRelation !== 'none' ? <span className="muted small med-meal">{MEAL[med.mealRelation]}</span> : null}
      </td>
      <td data-label="ประเภท">{FORM_LABEL[med.form] ?? <span className="muted">—</span>}</td>
      <td data-label="คงเหลือ" className="med-left">
        <strong className="num">{med.estimatedRemaining ?? med.stockOnHand}</strong> {med.unit ?? ''}
        {left !== null ? <span className="muted small"> ราว {left} วัน</span> : null}
        <span>{isLow(med) ? <Badge tone="bad">ใกล้หมด</Badge> : <Badge tone="good">พอใช้</Badge>}</span>
        <span className="muted small med-est">ค่าประมาณ มื้อที่ไม่ได้บันทึกนับว่าใช้ไปแล้ว</span>
      </td>
      <td data-label="จัดการ" className="med-actions">
        {can(patient, 'requestRefill') ? <Button size="sm" variant={isLow(med) ? 'primary' : 'secondary'} onClick={onRefill}>ขอเติมยา</Button> : null}
        {canEdit ? <Button size="sm" variant="secondary" onClick={onEdit} aria-label={`แก้ไข ${med.name}`}>แก้ไข</Button> : null}
        {canEdit ? (
          <ConfirmButton size="sm" variant="ghost" busy={busy} question={`หยุดใช้ ${med.name}?`} yes="หยุดใช้ยานี้" no="ไม่หยุด" ariaLabel={`หยุดใช้ ${med.name}`}
            onConfirm={() => run(async () => {
              await updateDoc(med.ref, { active: false, updatedAt: serverTimestamp(), updatedBy: user.uid });
              await call('afterMedicationWrite', { patientId: patient.id, medicationId: med.id });
            })}>หยุดใช้ยา</ConfirmButton>
        ) : null}
        <ErrorText>{error}</ErrorText>
      </td>
    </tr>
  );
}

// Today's doses grouped by part of the day, with logging right in the row. Used on the home screen and the medicines page.
export function TodaySchedule({ patient, slots, loading }) {
  if (loading) return <Loading />;
  if (!slots.length) return <p className="muted">ไม่มีมื้อยาวันนี้</p>;
  return PERIODS.map(([id, label]) => {
    const inPeriod = slots.filter((sl) => periodOf(sl.time)[0] === id);
    return inPeriod.length ? (
      <section key={id} className="dose-period" aria-label={label}>
        <h3 className="dose-period-title">{label}<span className="muted small">{inPeriod.filter((sl) => sl.log?.status === 'taken').length}/{inPeriod.length}</span></h3>
        {inPeriod.map((sl) => <DoseRow key={`${sl.med.id}-${sl.at}`} slot={sl} patient={patient} />)}
      </section>
    ) : null;
  });
}

// The medicines tab for one person (the shared page above it shows the header).
// show: 'all' (default) · 'list' (add form + medicine table only, the schedule lives on the home screen)
export function MedsView({ patient, show = 'all' }) {
  const [meds, loading] = useMeds(patient.id);
  const [slots] = useTodaySchedule(patient.id, meds);
  const [panel, setPanel] = useState(null); // 'add' | { edit: med } | { refill: med }
  const panelRef = useRef(null);
  const taken = slots.filter((s) => s.log?.status === 'taken').length;
  const low = meds.filter(isLow).length;

  // The add/refill forms open above the list; bring them into view so the tap visibly does something.
  useEffect(() => {
    if (!panel) return;
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    panelRef.current?.querySelector('input, select')?.focus({ preventScroll: true });
  }, [panel]);

  return (
    <div className="stack-lg meds-page">
      <section className="meds-sum" aria-label="สรุปวันนี้">
        <div><b className="num">{taken}</b><span>/ {slots.length} มื้อที่กินแล้ววันนี้</span></div>
        <div><b className="num">{meds.length}</b><span>รายการยา{low ? ` · ใกล้หมด ${low}` : ''}</span></div>
        <a className="btn btn-secondary btn-sm" href="#/report"><Icon name="list" size={18} />รายงานการใช้ยา</a>
        {can(patient, 'editMeds') ? <button type="button" className="round-btn round-btn-primary" aria-label="เพิ่มยา" onClick={() => setPanel('add')}><Icon name="plus" size={28} stroke={2.8} /></button> : null}
      </section>

      {panel ? (
        <div ref={panelRef} className="meds-panel" style={{ scrollMarginTop: 16 }}>
          {panel === 'add' ? <AddMedForm patient={patient} onDone={() => setPanel(null)} /> : panel.edit ? <AddMedForm key={panel.edit.id} patient={patient} med={panel.edit} onDone={() => setPanel(null)} /> : <RefillForm patient={patient} med={panel.refill} onDone={() => setPanel(null)} />}
        </div>
      ) : null}

      {show === 'all' ? (
        <section className="stack meds-today">
          <h2>ตารางกินยาวันนี้</h2>
          <Card><TodaySchedule patient={patient} slots={slots} loading={loading} /></Card>
        </section>
      ) : null}

      <section className="stack meds-list">
        <h2>รายการยา</h2>
        {!loading && !meds.length ? <Empty icon="pill" title="ยังไม่มียาในรายการ">กดปุ่ม + เพื่อเพิ่มยาตัวแรก</Empty> : (
          <div className="med-table-wrap">
            <table className="med-table">
              <thead><tr><th>ชื่อยา</th><th>โรค</th><th>เวลาใช้ยา</th><th>ประเภท</th><th>คงเหลือ</th><th><span className="sr-only">จัดการ</span></th></tr></thead>
              <tbody>{meds.map((m) => <MedRow key={m.id} med={m} patient={patient} onRefill={() => setPanel({ refill: m })} onEdit={() => setPanel({ edit: m })} />)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
