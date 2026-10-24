import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { go, useAction, useFlash, useQueryData } from '../lib/hooks.js';
import { useSession, can } from '../lib/session.js';
import { useMeds, useTodaySchedule, daysLeft, isLow, DOSE_STATUS } from '../lib/meds.js';
import { NAMED_TIME_LABELS } from '../../../functions/src/schedule.js';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorText, Field, Flash, Icon, Loading, Notice, PageHeader, Segmented } from '../components/ui.jsx';

function DoseRow({ slot, patient }) {
  const { user } = useSession();
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
    await call('afterDoseLog', { patientId: patient.id, logId: ref.id });
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
        <div className="muted small">ครั้งละ {slot.med.dosePerIntake} {slot.med.unit ?? ''}{slot.med.mealRelation === 'after' ? ' · หลังอาหาร' : slot.med.mealRelation === 'before' ? ' · ก่อนอาหาร' : ''}</div>
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

const TIME_OPTIONS = ['morning', 'noon', 'evening', 'bedtime'];

function AddMedForm({ patient, med = null, onDone }) {
  const { user } = useSession();
  const [catalog] = useQueryData(collection(db, 'catalog'), []);
  const [f, setF] = useState(med ? {
    name: med.name, catalogId: med.catalogId ?? '', dosePerIntake: med.dosePerIntake, unit: med.unit ?? '', times: med.times ?? [],
    mealRelation: med.mealRelation ?? 'none', stockOnHand: med.stockOnHand ?? 0, refillThresholdDays: med.refillThresholdDays ?? 7,
  } : { name: '', catalogId: '', dosePerIntake: 1, unit: 'เม็ด', times: ['morning'], mealRelation: 'after', stockOnHand: 30, refillThresholdDays: 7 });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = () => run(async () => {
    const { catalogId, ...rest } = f;
    if (med) {
      // Editing keeps the stock-count date unless the count itself changed.
      await updateDoc(med.ref, {
        ...rest,
        catalogId: catalogId || null,
        dosePerIntake: Number(f.dosePerIntake),
        stockOnHand: Number(f.stockOnHand),
        refillThresholdDays: Number(f.refillThresholdDays),
        ...(Number(f.stockOnHand) !== med.stockOnHand ? { stockCountedAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await call('afterMedicationWrite', { patientId: patient.id, medicationId: med.id });
      onDone();
      return;
    }
    const medRef = doc(collection(db, 'patients', patient.id, 'medications'));
    await setDoc(medRef, {
      ...rest,
      ...(catalogId ? { catalogId } : {}),
      dosePerIntake: Number(f.dosePerIntake),
      stockOnHand: Number(f.stockOnHand),
      refillThresholdDays: Number(f.refillThresholdDays),
      asNeeded: false,
      active: true,
      stockCountedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
    await call('afterMedicationWrite', { patientId: patient.id, medicationId: medRef.id });
    onDone();
  });

  return (
    <Card className="stack">
      <h3>{med ? `แก้ไขยา: ${med.name}` : 'เพิ่มยา'}</h3>
      <p className="muted small">กรอกตามฉลากยาหรือที่แพทย์/เภสัชกรสั่ง</p>
      <Field label="ชื่อยา"><input required value={f.name} onChange={set('name')} placeholder="เช่น แอมโลดิปีน 5 มก." /></Field>
      <Field label="เชื่อมกับฐานข้อมูลยา (เพื่อสั่งเติมยาได้)">
        <select value={f.catalogId} onChange={set('catalogId')}>
          <option value="">— ไม่เชื่อม —</option>
          {catalog.map((c) => <option key={c.id} value={c.id}>{c.genericName} {c.strength}</option>)}
        </select>
      </Field>
      <div className="grid-2">
        <Field label="ครั้งละ"><input type="number" min={0.25} step={0.25} value={f.dosePerIntake} onChange={set('dosePerIntake')} /></Field>
        <Field label="หน่วย"><input value={f.unit} onChange={set('unit')} /></Field>
      </div>
      <Field label="เวลารับประทาน">
        <div className="chip-row">
          {TIME_OPTIONS.map((t) => (
            <label key={t} className="check">
              <input type="checkbox" checked={f.times.includes(t)} onChange={(e) => setF({ ...f, times: e.target.checked ? [...f.times, t] : f.times.filter((x) => x !== t) })} />
              {NAMED_TIME_LABELS[t]}
            </label>
          ))}
        </div>
      </Field>
      <Field label="ก่อน/หลังอาหาร">
        <select value={f.mealRelation} onChange={set('mealRelation')}>
          <option value="after">หลังอาหาร</option><option value="before">ก่อนอาหาร</option>
          <option value="with">พร้อมอาหาร</option><option value="none">ไม่ระบุ</option>
        </select>
      </Field>
      <div className="grid-2">
        <Field label="จำนวนที่มีตอนนี้"><input type="number" min={0} value={f.stockOnHand} onChange={set('stockOnHand')} /></Field>
        <Field label="เตือนเมื่อเหลือ (วัน)"><input type="number" min={0} max={90} value={f.refillThresholdDays} onChange={set('refillThresholdDays')} /></Field>
      </div>
      <div className="row">
        <Button busy={busy} disabled={!f.name || !f.times.length} onClick={save}>บันทึก</Button>
        <Button variant="secondary" onClick={onDone}>ยกเลิก</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function MedCard({ med, patient, onRefill, onEdit }) {
  const { user } = useSession();
  const [count, setCount] = useState('');
  const [saved, flash] = useFlash();
  const { busy, error, run } = useAction();
  const left = daysLeft(med);
  return (
    <Card className="stack">
      <div className="between">
        <strong>{med.name}</strong>
        {isLow(med) ? <Badge tone="bad">ใกล้หมด</Badge> : <Badge tone="good">พอใช้</Badge>}
      </div>
      <p className="muted small">
        {med.times.map((t) => NAMED_TIME_LABELS[t] ?? t).join(' · ')} · ครั้งละ {med.dosePerIntake} {med.unit ?? ''}
      </p>
      <p>
        เหลือประมาณ <strong className="num">{med.estimatedRemaining ?? med.stockOnHand}</strong> {med.unit ?? ''}
        {left !== null ? <> (ราว <strong className="num">{left}</strong> วัน)</> : null}
      </p>
      <p className="muted small">ค่าประมาณจากตารางยา มื้อที่ยังไม่ได้บันทึกนับว่าใช้ไปแล้ว</p>
      {can(patient, 'editMeds') ? (
        <form className="row" onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await updateDoc(med.ref, { stockOnHand: Number(count), stockCountedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: user.uid });
            await call('afterMedicationWrite', { patientId: patient.id, medicationId: med.id });
            setCount('');
            flash('อัปเดตจำนวนยาแล้ว');
          });
        }}>
          <input type="number" min={0} inputMode="numeric" style={{ flex: 1 }} placeholder="นับยาที่เหลือจริง…" value={count} onChange={(e) => setCount(e.target.value)} aria-label={`จำนวน${med.name}ที่นับได้จริง`} />
          <Button type="submit" size="sm" variant="secondary" busy={busy} disabled={count === ''} aria-label={`อัปเดตจำนวน${med.name}`}>อัปเดต</Button>
        </form>
      ) : null}
      <Flash>{saved}</Flash>
      <div className="row">
        {can(patient, 'requestRefill') ? <Button size="sm" variant={isLow(med) ? 'primary' : 'secondary'} onClick={onRefill}>ขอเติมยา</Button> : null}
        {can(patient, 'editMeds') ? <Button size="sm" variant="secondary" onClick={onEdit} aria-label={`แก้ไข ${med.name}`}>แก้ไข</Button> : null}
        {can(patient, 'editMeds') ? (
          <ConfirmButton size="sm" variant="ghost" busy={busy} question={`หยุดใช้ ${med.name}?`} yes="หยุดใช้ยานี้" no="ไม่หยุด" ariaLabel={`หยุดใช้ ${med.name}`}
            onConfirm={() => run(async () => {
              await updateDoc(med.ref, { active: false, updatedAt: serverTimestamp(), updatedBy: user.uid });
              await call('afterMedicationWrite', { patientId: patient.id, medicationId: med.id });
            })}>หยุดใช้ยา</ConfirmButton>
        ) : null}
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

export default function Meds() {
  const { patients } = useSession();
  const visible = patients.filter((p) => can(p, 'viewMeds'));
  const [patientId, setPatientId] = useState(() => sessionStorage.getItem('medsPatient'));
  const patient = visible.find((p) => p.id === patientId) ?? visible.find((p) => p.viaCaregiver) ?? visible[0];
  const [meds, loading] = useMeds(patient?.id);
  const [slots] = useTodaySchedule(patient?.id, meds);
  const [panel, setPanel] = useState(null); // 'add' | { edit: med } | { refill: med }
  const panelRef = useRef(null);

  // The add/refill forms open above the list; bring them into view so the tap visibly does something.
  useEffect(() => {
    if (!panel) return;
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    panelRef.current?.querySelector('input, select')?.focus({ preventScroll: true });
  }, [panel]);

  if (!patient) return <Empty title="ยังไม่มีโปรไฟล์ที่ดูได้" />;
  const pick = (id) => { sessionStorage.setItem('medsPatient', id); setPatientId(id); setPanel(null); };

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow={`วันนี้ ${slots.length} มื้อ`}
        title={patient.isSelf && !patient.viaCaregiver ? 'ยาของฉัน' : `ยาของ${patient.displayName}`}
        actions={can(patient, 'editMeds') ? <button type="button" className="round-btn round-btn-primary" aria-label="เพิ่มยา" onClick={() => setPanel('add')}><Icon name="plus" size={28} stroke={2.8} /></button> : null}
      />
      {visible.length > 1 ? (
        <Segmented label="เลือกโปรไฟล์" value={patient.id} onChange={pick} options={visible.map((p) => [p.id, p.isSelf && !p.viaCaregiver ? 'ตัวเอง' : p.displayName])} />
      ) : null}
      {patient.viaCaregiver ? <Notice tone="info">คุณกำลังดูข้อมูลของ {patient.displayName} ในฐานะผู้ดูแล ทุกการบันทึกจะระบุชื่อคุณ</Notice> : null}

      {panel ? (
        <div ref={panelRef} style={{ scrollMarginTop: 16 }}>
          {panel === 'add' ? <AddMedForm patient={patient} onDone={() => setPanel(null)} /> : panel.edit ? <AddMedForm key={panel.edit.id} patient={patient} med={panel.edit} onDone={() => setPanel(null)} /> : <RefillForm patient={patient} med={panel.refill} onDone={() => setPanel(null)} />}
        </div>
      ) : null}

      <section className="stack">
        <h2>วันนี้</h2>
        <Card>
          {loading ? <Loading /> : slots.length ? slots.map((s) => <DoseRow key={`${s.med.id}-${s.at}`} slot={s} patient={patient} />)
            : <p className="muted">ไม่มีมื้อยาวันนี้</p>}
        </Card>
      </section>

      <section className="stack">
        <h2>รายการยา</h2>
        <div className="grid-cards">
          {meds.map((m) => <MedCard key={m.id} med={m} patient={patient} onRefill={() => setPanel({ refill: m })} onEdit={() => setPanel({ edit: m })} />)}
        </div>
        {!loading && !meds.length ? <Empty icon="pill" title="ยังไม่มียาในรายการ" /> : null}
      </section>
    </div>
  );
}
