// The house: one shared home for a family (e.g. "บ้านคุณย่าสมศรี"). Everyone in it sees and manages the same patient
// profiles, so several relatives can look after one person. Joining is by an 8-digit code.
// Tabs: members · patients · activity · reminder settings. The old email-invite caregivers live in a folded section.
import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { go, useAction, useDocData, useFlash, useQueryData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { timeAgo } from '../lib/format.js';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorText, Field, Flash, Icon, PageHeader, Segmented } from '../components/ui.jsx';
import { LegacyCaregivers } from './Family.jsx';
import './house.css';

const COMMON_CONDITIONS = ['ความดันโลหิตสูง', 'เบาหวาน', 'ไขมันในเลือดสูง', 'โรคหัวใจ', 'โรคไต', 'หอบหืด', 'ภูมิแพ้', 'ไทรอยด์'];
export const AVATARS = ['👵', '👴', '👩', '👨', '🧓', '👧', '👦', '🧑', '🐻', '🌻'];
const SEX = [['female', 'หญิง'], ['male', 'ชาย'], ['other', 'อื่น ๆ']];
const STATUS_TEXT = { taken: 'กินแล้ว', skipped: 'งดมื้อนี้', missed: 'ยืนยันว่าพลาดมื้อ' };
const day = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long' });
const clock = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
const groupCode = (c = '') => c.replace(/(\d{4})(?=\d)/, '$1 ');

export const ageOf = (birthYear) => {
  if (!birthYear) return null;
  const year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Bangkok', year: 'numeric' }).format(new Date()));
  const y = birthYear > 2400 ? birthYear - 543 : birthYear;
  return Math.max(0, year - y);
};

// ───────── no house yet ─────────
function StartHouse() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const create = useAction();
  const join = useAction();
  return (
    <div className="hs-start">
      <Card className="stack hs-start-card">
        <span className="hs-start-ico" aria-hidden><Icon name="home" size={30} /></span>
        <h2>สร้างบ้านของครอบครัว</h2>
        <p className="muted small">ตั้งชื่อบ้าน แล้วชวนญาติเข้ามาช่วยกันดูแลผู้ป่วยคนเดียวกัน ทุกคนในบ้านดูและจัดการยาของทุกคนได้</p>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); create.run(() => call('createHouse', { name })); }}>
          <Field label="ชื่อบ้าน"><input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น บ้านคุณย่าสมศรี" autoComplete="off" /></Field>
          <Button type="submit" size="lg" block busy={create.busy} disabled={!name.trim()}>สร้างบ้าน</Button>
          <ErrorText>{create.error}</ErrorText>
        </form>
      </Card>
      <Card className="stack hs-start-card">
        <span className="hs-start-ico hs-start-ico-2" aria-hidden><Icon name="people" size={30} /></span>
        <h2>เข้าร่วมบ้านด้วยรหัสเชิญ</h2>
        <p className="muted small">ขอรหัส 8 หลักจากเจ้าของบ้าน แล้วกรอกที่นี่</p>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); join.run(() => call('joinHouse', { code })); }}>
          <Field label="รหัสเชิญ 8 หลัก">
            <input
              className="hs-code-input" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={9} placeholder="0000 0000"
              value={groupCode(code)} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))} aria-label="รหัสเชิญ 8 หลัก"
            />
          </Field>
          <Button type="submit" size="lg" block busy={join.busy} disabled={code.length !== 8}>เข้าร่วมบ้าน</Button>
          <ErrorText>{join.error}</ErrorText>
        </form>
      </Card>
    </div>
  );
}

// ───────── invite code ─────────
function InviteCard({ house, isOwner }) {
  const [note, flash] = useFlash();
  const regen = useAction();
  const invite = useAction();
  const [email, setEmail] = useState('');
  const text = `ร่วมบ้าน "${house.name}" ใน growa ด้วยรหัสเชิญ ${groupCode(house.inviteCode)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(house.inviteCode); flash('คัดลอกรหัสแล้ว'); } catch { flash('คัดลอกไม่ได้ จดรหัสไว้แทนได้'); }
  };
  const share = async () => { try { await navigator.share({ title: 'รหัสเชิญเข้าบ้าน', text }); } catch { /* cancelled */ } };
  return (
    <Card className="hs-invite">
      <div>
        <span className="muted small">รหัสเชิญเข้าบ้าน (บอกคนที่ต้องการชวน)</span>
        <strong className="hs-code num" aria-label={`รหัสเชิญ ${house.inviteCode.split('').join(' ')}`}>{groupCode(house.inviteCode)}</strong>
      </div>
      <div className="row">
        <Button size="sm" variant="secondary" onClick={copy}><Icon name="check" size={18} />คัดลอกรหัส</Button>
        {typeof navigator !== 'undefined' && navigator.share ? <Button size="sm" variant="secondary" onClick={share}>แชร์</Button> : null}
        {isOwner ? (
          <ConfirmButton size="sm" variant="ghost" busy={regen.busy} question="เปลี่ยนรหัสใหม่? รหัสเดิมจะใช้ไม่ได้" yes="เปลี่ยนรหัส" no="ไม่เปลี่ยน" onConfirm={() => regen.run(() => call('regenerateInviteCode', { houseId: house.id }))}>เปลี่ยนรหัสใหม่</ConfirmButton>
        ) : null}
      </div>
      {isOwner ? (
        <form className="hs-invite-mail" onSubmit={(e) => { e.preventDefault(); invite.run(async () => { await call('inviteToHouse', { houseId: house.id, email }); setEmail(''); flash('ส่งคำเชิญแล้ว ถ้าอีเมลนี้มีบัญชีใน growa เขาจะเห็นคำเชิญในแจ้งเตือน ถ้ายังไม่มี ให้ส่งรหัสด้านบนให้เขาโดยตรง'); }); }}>
          <input type="email" name="invite-email" inputMode="email" autoComplete="off" spellCheck={false} required placeholder="หรือเชิญด้วยอีเมล เช่น name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="อีเมลของคนที่จะเชิญ" />
          <Button type="submit" size="sm" busy={invite.busy}>ส่งคำเชิญ</Button>
        </form>
      ) : null}
      <Flash>{note}</Flash>
      <ErrorText>{regen.error || invite.error}</ErrorText>
    </Card>
  );
}

// ───────── members ─────────
function Members({ house, isOwner, uid }) {
  const [members] = useQueryData(collection(db, 'houses', house.id, 'members'), [house.id]);
  const remove = useAction();
  const leave = useAction();
  const sorted = [...members].sort((a, b) => (a.role === 'owner' ? -1 : 0) - (b.role === 'owner' ? -1 : 0) || (a.joinedAt?.toMillis?.() ?? 0) - (b.joinedAt?.toMillis?.() ?? 0));
  return (
    <div className="stack-lg">
      <ul className="hs-members">
        {sorted.map((m) => (
          <li key={m.id} className="hs-member">
            <span className="hs-avatar" aria-hidden>{[...(m.displayName || '?')][0].toUpperCase()}</span>
            <span className="hs-member-main">
              <strong>{m.displayName}{m.id === uid ? ' (คุณ)' : ''}</strong>
              <span className="muted small">{m.joinedAt ? `เข้าร่วม ${day.format(m.joinedAt.toMillis())}` : ''}</span>
            </span>
            {m.role === 'owner' ? <Badge tone="info">เจ้าของบ้าน</Badge> : <Badge tone="neutral">สมาชิก</Badge>}
            {isOwner && m.id !== uid ? (
              <ConfirmButton size="sm" variant="ghost" busy={remove.busy} question={`เอา ${m.displayName} ออกจากบ้าน?`} yes="เอาออก" no="ไม่เอาออก" ariaLabel={`เอา ${m.displayName} ออกจากบ้าน`}
                onConfirm={() => remove.run(() => call('removeMember', { houseId: house.id, memberUid: m.id }))}>เอาออก</ConfirmButton>
            ) : null}
          </li>
        ))}
      </ul>
      <ErrorText>{remove.error}</ErrorText>
      <div className="hs-leave">
        {isOwner && house.memberUids.length > 1
          ? <p className="muted small">เจ้าของบ้านต้องเอาสมาชิกคนอื่นออกก่อน จึงจะออกจากบ้านได้</p>
          : (
            <ConfirmButton size="sm" variant="secondary" busy={leave.busy} question={house.memberUids.length === 1 ? 'ออกและปิดบ้านนี้? (โปรไฟล์ยังอยู่กับเจ้าของ)' : 'ออกจากบ้านนี้?'} yes="ออกจากบ้าน" no="อยู่ต่อ"
              onConfirm={() => leave.run(() => call('leaveHouse', { houseId: house.id }))}><Icon name="logout" size={18} />ออกจากบ้าน</ConfirmButton>
          )}
        <ErrorText>{leave.error}</ErrorText>
      </div>
    </div>
  );
}

// ───────── patients ─────────
function ConditionChips({ value, onChange }) {
  const [extra, setExtra] = useState('');
  const toggle = (c) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  const all = [...COMMON_CONDITIONS, ...value.filter((c) => !COMMON_CONDITIONS.includes(c))];
  return (
    <div className="stack">
      <div className="chip-row">
        {all.map((c) => <button key={c} type="button" className={`btn btn-sm ${value.includes(c) ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={value.includes(c)} onClick={() => toggle(c)}>{c}</button>)}
      </div>
      <div className="row">
        <input style={{ flex: '1 1 180px' }} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="โรคอื่น ๆ" aria-label="เพิ่มโรคประจำตัวอื่น" maxLength={60} />
        <Button size="sm" variant="secondary" disabled={!extra.trim()} onClick={() => { if (!value.includes(extra.trim())) onChange([...value, extra.trim()]); setExtra(''); }}>เพิ่ม</Button>
      </div>
    </div>
  );
}

const toDateInput = (ts) => (ts?.toMillis ? new Date(ts.toMillis() + 7 * 3600e3).toISOString().slice(0, 10) : '');

function PatientForm({ patient = null, houseId, onDone }) {
  const { user } = useSession();
  const [health] = useDocData(patient ? doc(db, 'patients', patient.id, 'health', 'profile') : null, [patient?.id]);
  const [f, setF] = useState({
    displayName: patient?.displayName ?? '', birthYear: patient?.birthYear ?? '', sex: patient?.sex ?? '', hospital: patient?.hospital ?? '', doctor: patient?.doctor ?? '',
    nextAppointment: toDateInput(patient?.nextAppointment), conditions: null, avatar: patient?.avatar ?? '',
  });
  const conditions = f.conditions ?? health?.conditions ?? [];
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = () => run(async () => {
    let year = f.birthYear === '' ? null : Number(f.birthYear);
    if (year && year > 2400) year -= 543;
    if (year !== null && !(Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear())) throw new Error('ปีเกิดไม่ถูกต้อง กรอกเป็น ค.ศ. หรือ พ.ศ.');
    const details = {
      displayName: f.displayName.trim(), birthYear: year, hospital: f.hospital.trim(), doctor: f.doctor.trim(),
      ...(f.sex ? { sex: f.sex } : {}),
      ...(f.avatar ? { avatar: f.avatar } : {}),
      nextAppointment: f.nextAppointment ? Timestamp.fromDate(new Date(`${f.nextAppointment}T00:00:00+07:00`)) : null,
    };
    let pid = patient?.id;
    if (patient) {
      await updateDoc(doc(db, 'patients', pid), { ...details, archived: patient.archived ?? false });
    } else {
      const ref = doc(collection(db, 'patients'));
      pid = ref.id;
      await setDoc(ref, { ...details, ownerUid: user.uid, isSelf: false, archived: false, houseId, createdAt: serverTimestamp() });
    }
    if (f.conditions) {
      const ref = doc(db, 'patients', pid, 'health', 'profile');
      // A profile that was just created has no health document yet, so there is nothing to read (and keep) first.
      const cur = patient ? (await getDoc(ref)).data() ?? {} : {};
      await setDoc(ref, { ...cur, allergies: cur.allergies ?? [], conditions: f.conditions, updatedAt: serverTimestamp(), updatedBy: user.uid });
    }
    onDone();
  });

  return (
    <Card className="stack-lg hs-form">
      <h3>{patient ? `แก้ข้อมูล ${patient.displayName}` : 'เพิ่มโปรไฟล์ผู้ป่วย'}</h3>
      <div className="grid-2">
        <Field label="ชื่อหรือชื่อเรียก"><input required maxLength={100} value={f.displayName} onChange={set('displayName')} placeholder="เช่น คุณยายสมศรี" autoComplete="off" /></Field>
        <Field label="ปีเกิด" hint="ค.ศ. หรือ พ.ศ. ก็ได้ ใช้คำนวณอายุ"><input type="number" inputMode="numeric" value={f.birthYear} onChange={set('birthYear')} placeholder="เช่น 2490" autoComplete="off" /></Field>
      </div>
      <Field label="รูปประจำตัว">
        <div className="hs-avatars" role="group" aria-label="เลือกรูปประจำตัว">
          {AVATARS.map((e) => <button key={e} type="button" className={f.avatar === e ? 'on' : ''} aria-pressed={f.avatar === e} onClick={() => setF((x) => ({ ...x, avatar: x.avatar === e ? '' : e }))}><span aria-hidden>{e}</span><span className="sr-only">เลือก {e}</span></button>)}
        </div>
      </Field>
      <Field label="เพศ"><Segmented label="เพศ" value={f.sex} onChange={(v) => setF((x) => ({ ...x, sex: v }))} options={SEX} /></Field>
      <Field label="โรคประจำตัว"><ConditionChips value={conditions} onChange={(v) => setF((x) => ({ ...x, conditions: v }))} /></Field>
      <div className="grid-2">
        <Field label="โรงพยาบาล"><input maxLength={120} value={f.hospital} onChange={set('hospital')} placeholder="เช่น โรงพยาบาลประจำจังหวัด" autoComplete="off" /></Field>
        <Field label="แพทย์ที่ดูแล"><input maxLength={120} value={f.doctor} onChange={set('doctor')} placeholder="เช่น นพ.สมชาย ใจดี" autoComplete="off" /></Field>
      </div>
      <Field label="วันนัดครั้งถัดไป"><input type="date" value={f.nextAppointment} onChange={set('nextAppointment')} style={{ maxWidth: 220 }} /></Field>
      <div className="row">
        <Button busy={busy} disabled={!f.displayName.trim()} onClick={save}>บันทึก</Button>
        <Button variant="secondary" onClick={onDone}>ยกเลิก</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function PatientCard({ patient, onEdit }) {
  const [health] = useDocData(doc(db, 'patients', patient.id, 'health', 'profile'), [patient.id]);
  const age = ageOf(patient.birthYear);
  const sex = SEX.find(([k]) => k === patient.sex)?.[1];
  const appt = patient.nextAppointment?.toMillis?.();
  const daysTo = appt ? Math.ceil((appt - Date.now()) / 864e5) : null;
  const open = (path) => { try { sessionStorage.setItem('medsPatient', patient.id); } catch { /* storage may be blocked */ } go(path); };
  const conditions = health?.conditions ?? [];
  return (
    <Card className="hs-patient">
      <header className="hs-patient-head">
        <span className="hs-avatar hs-avatar-lg" aria-hidden>{patient.avatar ?? [...patient.displayName][0]?.toUpperCase()}</span>
        <div>
          <h3>{patient.displayName}{patient.isSelf ? <span className="muted small"> · โปรไฟล์ของสมาชิก</span> : null}</h3>
          <p className="muted small">{[age !== null ? `อายุ ${age} ปี` : null, sex].filter(Boolean).join(' · ') || 'ยังไม่ได้ระบุอายุ/เพศ'}</p>
        </div>
      </header>
      <dl className="hs-facts">
        <div><dt>โรคประจำตัว</dt><dd>{conditions.length ? conditions.join(' · ') : <span className="muted">ไม่ได้บันทึก</span>}</dd></div>
        <div><dt>โรงพยาบาล</dt><dd>{patient.hospital || <span className="muted">—</span>}</dd></div>
        <div><dt>แพทย์</dt><dd>{patient.doctor || <span className="muted">—</span>}</dd></div>
        <div>
          <dt>นัดครั้งถัดไป</dt>
          <dd>{appt ? <>{day.format(appt)} {daysTo !== null && daysTo >= 0 ? <Badge tone={daysTo <= 3 ? 'warn' : 'info'}>{daysTo === 0 ? 'วันนี้' : `อีก ${daysTo} วัน`}</Badge> : <Badge tone="neutral">ผ่านมาแล้ว</Badge>}</> : <span className="muted">ยังไม่ได้ระบุ</span>}</dd>
        </div>
      </dl>
      <div className="row hs-patient-actions">
        <Button size="sm" onClick={() => open('meds')}><Icon name="pill" size={18} />ยาและตารางกินยา</Button>
        <Button size="sm" variant="secondary" onClick={() => open('report')}>รายงานการใช้ยา</Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>แก้ข้อมูล</Button>
      </div>
    </Card>
  );
}

function Patients({ house, patients }) {
  const [editing, setEditing] = useState(null); // 'new' | patient
  const list = patients.filter((p) => p.houseId === house.id || p.viaHouse);
  return (
    <div className="stack-lg">
      {editing ? <PatientForm key={editing === 'new' ? 'new' : editing.id} patient={editing === 'new' ? null : editing} houseId={house.id} onDone={() => setEditing(null)} /> : null}
      <div className="hs-grid">
        {list.map((p) => <PatientCard key={p.id} patient={p} onEdit={() => { setEditing(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}
      </div>
      {!list.length ? <Empty icon="people" title="ยังไม่มีโปรไฟล์ในบ้าน" /> : null}
      {!editing ? <Button variant="secondary" block onClick={() => setEditing('new')}><Icon name="plus" size={20} />เพิ่มโปรไฟล์ผู้ป่วย</Button> : null}
    </div>
  );
}

// ───────── activity ─────────
export function useActivity(patients) {
  const [logs, setLogs] = useState({});
  const [meds, setMeds] = useState({});
  const key = patients.map((p) => p.id).sort().join(',');
  useEffect(() => {
    const off = [];
    for (const p of patients) {
      off.push(onSnapshot(query(collection(db, 'patients', p.id, 'doseLogs'), orderBy('loggedAt', 'desc'), limit(15)),
        (snap) => setLogs((x) => ({ ...x, [p.id]: snap.docs.map((d) => ({ id: d.id, patientId: p.id, ...d.data() })) })), () => {}));
      off.push(onSnapshot(collection(db, 'patients', p.id, 'medications'),
        (snap) => setMeds((x) => ({ ...x, [p.id]: Object.fromEntries(snap.docs.map((d) => [d.id, d.data().name])) })), () => {}));
    }
    return () => off.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(() => Object.values(logs).flat()
    .filter((l) => l.loggedAt?.toMillis)
    .sort((a, b) => b.loggedAt.toMillis() - a.loggedAt.toMillis()).slice(0, 40)
    .map((l) => ({ ...l, medName: meds[l.patientId]?.[l.medicationId] ?? 'ยา', patient: patients.find((p) => p.id === l.patientId)?.displayName ?? '' })), [logs, meds, patients]);
}

function Activity({ patients, names, uid }) {
  const rows = useActivity(patients);
  if (!rows.length) return <Empty icon="clock" title="ยังไม่มีกิจกรรม">เมื่อมีคนในบ้านบันทึกการกินยา จะแสดงที่นี่ว่าใครบันทึกอะไรเมื่อไร</Empty>;
  return (
    <ol className="hs-feed">
      {rows.map((r) => {
        const who = r.loggedBy === uid ? 'คุณ' : names[r.loggedBy] ?? 'สมาชิก';
        const ms = r.loggedAt.toMillis();
        const sched = r.scheduledFor?.toMillis?.();
        return (
          <li key={`${r.patientId}-${r.id}`} className={`hs-feed-row hs-${r.status}`}>
            <span className="hs-feed-dot" aria-hidden><Icon name={r.status === 'taken' ? 'check' : r.status === 'missed' ? 'close' : 'minus'} size={16} stroke={2.8} /></span>
            <div>
              <p><strong>{who}</strong> บันทึกว่า<strong>{STATUS_TEXT[r.status] ?? r.status}</strong> · {r.medName}{r.patient ? ` ของ ${r.patient}` : ''}</p>
              <p className="muted small">{sched ? `มื้อเวลา ${clock.format(sched)} น. · ` : ''}บันทึกเมื่อ {clock.format(ms)} น. ({timeAgo(r.loggedAt)})</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ───────── reminder settings ─────────
const AFTER = [15, 30, 45, 60, 90, 120];
const REPEAT = [[0, 'ไม่เตือนซ้ำ'], [15, 'ทุก 15 นาที'], [30, 'ทุก 30 นาที'], [60, 'ทุก 1 ชั่วโมง'], [120, 'ทุก 2 ชั่วโมง']];
const TIMES = [1, 2, 3, 5];

function Settings({ house, isOwner }) {
  const s = { overdueAfterMin: 30, repeatEveryMin: 30, maxRepeats: 3, ...(house.settings ?? {}) };
  const [f, setF] = useState(s);
  const [name, setName] = useState(house.name);
  const [saved, flash] = useFlash();
  const { busy, error, run } = useAction();
  const dirty = name !== house.name || JSON.stringify(f) !== JSON.stringify(s);
  const num = (k) => (e) => setF((x) => ({ ...x, [k]: Number(e.target.value) }));
  return (
    <Card className="stack-lg hs-settings">
      <div>
        <h2>เตือนเมื่อยาเลยเวลา</h2>
        <p className="muted small">มื้อยาที่ยังไม่มีใครบันทึก จะแจ้งสมาชิกทุกคนในบ้านพร้อมกัน (ยังไม่บันทึก ไม่ได้แปลว่าพลาด จนกว่าจะมีคนยืนยัน)</p>
      </div>
      <Field label="ชื่อบ้าน"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={!isOwner} /></Field>
      <div className="grid-2">
        <Field label="แจ้งเตือนเมื่อเลยเวลา">
          <select value={f.overdueAfterMin} onChange={num('overdueAfterMin')} disabled={!isOwner}>
            {[...new Set([...AFTER, f.overdueAfterMin])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m < 60 ? `${m} นาที` : `${m / 60} ชั่วโมง`}</option>)}
          </select>
        </Field>
        <Field label="เตือนซ้ำ">
          <select value={f.repeatEveryMin} onChange={num('repeatEveryMin')} disabled={!isOwner}>
            {[...REPEAT, ...(REPEAT.some(([m]) => m === f.repeatEveryMin) ? [] : [[f.repeatEveryMin, `ทุก ${f.repeatEveryMin} นาที`]])].map(([m, l]) => <option key={m} value={m}>{l}</option>)}
          </select>
        </Field>
      </div>
      {f.repeatEveryMin > 0 ? (
        <Field label="เตือนซ้ำได้สูงสุด">
          <select value={f.maxRepeats} onChange={num('maxRepeats')} disabled={!isOwner}>
            {[...new Set([...TIMES, f.maxRepeats])].sort((a, b) => a - b).map((t) => <option key={t} value={t}>{t} ครั้ง</option>)}
          </select>
        </Field>
      ) : null}
      <p className="hs-note"><Icon name="info" size={16} />แจ้งเตือนส่งเข้า "แจ้งเตือน" ในแอป เมื่อมีสมาชิกเปิดแอปอยู่ (ตรวจทุก 5 นาที) ยังไม่มีการส่งเข้ามือถือหรืออีเมล</p>
      {isOwner ? (
        <div className="row">
          <Button busy={busy} disabled={!dirty || !name.trim()} onClick={() => run(async () => {
            await updateDoc(doc(db, 'houses', house.id), { name: name.trim(), settings: { overdueAfterMin: f.overdueAfterMin, repeatEveryMin: f.repeatEveryMin, maxRepeats: f.repeatEveryMin > 0 ? f.maxRepeats : 0 }, updatedAt: serverTimestamp() });
            flash('บันทึกแล้ว');
          })}>บันทึก</Button>
          <Flash>{saved}</Flash>
        </div>
      ) : <p className="muted small">เฉพาะเจ้าของบ้านแก้การตั้งค่านี้ได้</p>}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

// ───────── page ─────────
export default function House() {
  const { user, house, patients, memberNames } = useSession();
  const [tab, setTab] = useState('patients');

  if (!house) {
    return (
      <div className="stack-lg">
        <PageHeader eyebrow="ดูแลกันและกัน" title="บ้านและครอบครัว" subtitle="สร้างบ้านหรือเข้าร่วมบ้าน เพื่อให้หลายคนช่วยกันดูแลผู้ป่วยคนเดียวกัน" mascot />
        <StartHouse />
        <details className="hs-legacy"><summary>ผู้ดูแลแบบเดิม (เชิญด้วยอีเมล)</summary><LegacyCaregivers /></details>
      </div>
    );
  }
  const isOwner = house.ownerUid === user.uid;
  const housePatients = patients.filter((p) => p.houseId === house.id);
  return (
    <div className="stack-lg hs">
      <PageHeader eyebrow={`สมาชิก ${house.memberUids.length} คน · ผู้ป่วย ${housePatients.length} โปรไฟล์`} title={house.name} subtitle="ทุกคนในบ้านดูและจัดการยาของทุกโปรไฟล์ได้ ต้องการแก้ไขโปรไฟล์ใดก็แก้ได้เลย" />
      <InviteCard house={house} isOwner={isOwner} />
      <Segmented label="หมวดของบ้าน" value={tab} onChange={setTab} options={[['patients', 'ผู้ป่วย'], ['members', 'สมาชิก'], ['activity', 'กิจกรรม'], ['settings', 'การเตือน']]} />
      {tab === 'patients' ? <Patients house={house} patients={patients} /> : null}
      {tab === 'members' ? <Members house={house} isOwner={isOwner} uid={user.uid} /> : null}
      {tab === 'activity' ? <Activity patients={housePatients} names={memberNames} uid={user.uid} /> : null}
      {tab === 'settings' ? <Settings house={house} isOwner={isOwner} /> : null}
      <details className="hs-legacy"><summary>ผู้ดูแลนอกบ้าน (เชิญด้วยอีเมล)</summary><LegacyCaregivers /></details>
    </div>
  );
}
