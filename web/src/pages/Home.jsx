// Home of the care area: who we are looking after, today's doses (log them right here), the numbers that matter and
// what happened lately. Everything else is one tap away from the cards and the bottom tab bar.
import { useMemo, useState } from 'react';
import { collection, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useQueryData } from '../lib/hooks.js';
import { can, useSession } from '../lib/session.js';
import { useMeds, useTodaySchedule, isLow } from '../lib/meds.js';
import { analyse, percent } from '../lib/adherence.js';
import { bangkokDayStart, DAY_MS } from '../../../functions/src/schedule.js';
import { Badge, Button, Card, Empty, Icon } from '../components/ui.jsx';
import { TodaySchedule } from './Meds.jsx';
import { AVATARS, ageOf, useActivity } from './House.jsx';
import './home.css';

const clock = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
const dayFmt = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Bangkok' });
const STATUS_TEXT = { taken: 'กินแล้ว', skipped: 'งดมื้อนี้', missed: 'พลาดมื้อ' };

// A picked emoji, else the first real letter of the name (never a leading vowel sign or symbol).
const avatarOf = (p) => p.avatar ?? (p.isSelf ? AVATARS[7] : ([...p.displayName].find((c) => /[ก-ฮA-Za-z0-9]/.test(c)) ?? '🙂').toUpperCase());
const greeting = (h) => (h < 11 ? 'สวัสดีตอนเช้า' : h < 16 ? 'สวัสดีตอนกลางวัน' : h < 19 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนค่ำ');

function Chips({ patients, value, onChange }) {
  return (
    <div className="hm-chips" role="group" aria-label="เลือกคนที่ดูแล">
      {patients.map((p) => (
        <button key={p.id} type="button" className={p.id === value ? 'on' : ''} aria-pressed={p.id === value} onClick={() => onChange(p.id)}>
          <span className="hm-chip-av" aria-hidden>{avatarOf(p)}</span>
          <span>{p.isSelf && p.isOwner ? 'ตัวเอง' : p.displayName}</span>
        </button>
      ))}
    </div>
  );
}

// Three numbers that answer "is this person OK?" at a glance. Same definition of steadiness as the report.
function Numbers({ patient, meds, members }) {
  const from = bangkokDayStart(Date.now() - 6 * DAY_MS);
  const [logs] = useQueryData(query(collection(db, 'patients', patient.id, 'doseLogs'), where('scheduledFor', '>=', Timestamp.fromMillis(from))), [patient.id, from]);
  const total = useMemo(() => analyse(meds, logs, from, Date.now()).total, [meds, logs, from]);
  const pct = percent(total);
  const low = meds.filter(isLow).length;
  return (
    <dl className="hm-nums">
      <div className={pct !== null && pct < 70 ? 'warn' : ''}>
        <dt>กินยาตรงเวลา 7 วัน</dt>
        <dd><b className="num">{pct === null ? '—' : `${pct}%`}</b></dd>
        <span className="muted small">{pct === null ? 'ยังไม่มีมื้อให้คำนวณ' : `${total.ontime + total.late} มื้อ · ยังไม่บันทึก ${total.unlogged}`}</span>
      </div>
      <div className={low ? 'warn' : ''}>
        <dt>ยาใกล้หมด</dt>
        <dd><b className="num">{low}</b><span> รายการ</span></dd>
        <span className="muted small">{low ? 'ควรเติมยาเร็วๆ นี้ (ประมาณการ)' : 'ยังพอใช้ (ประมาณการ)'}</span>
      </div>
      <div>
        <dt>สมาชิกในบ้าน</dt>
        <dd><b className="num">{members}</b><span> คน</span></dd>
        <span className="muted small">ทุกคนช่วยบันทึกได้</span>
      </div>
    </dl>
  );
}

function PatientCard({ patient, members }) {
  const [meds] = useMeds(patient.id);
  const age = ageOf(patient.birthYear);
  const appt = patient.nextAppointment?.toMillis?.();
  const daysTo = appt ? Math.ceil((appt - Date.now()) / DAY_MS) : null;
  const open = (path) => { try { sessionStorage.setItem('medsPatient', patient.id); } catch { /* storage may be blocked */ } window.location.hash = `#/${path}`; };
  return (
    <Card className="hm-card">
      <header className="hm-card-head">
        <span className="hm-avatar" aria-hidden>{avatarOf(patient)}</span>
        <div>
          <h2>{patient.displayName}</h2>
          <p className="muted small">{[age !== null ? `อายุ ${age} ปี` : null, patient.hospital || null].filter(Boolean).join(' · ') || 'ยังไม่ได้ระบุอายุหรือโรงพยาบาล'}</p>
          {appt && daysTo !== null && daysTo >= 0 ? <Badge tone={daysTo <= 3 ? 'warn' : 'info'}>นัดหมอ {daysTo === 0 ? 'วันนี้' : `อีก ${daysTo} วัน`}</Badge> : null}
        </div>
      </header>
      <Numbers patient={patient} meds={meds} members={members} />
      <div className="row hm-actions">
        {can(patient, 'editMeds') ? <Button size="sm" onClick={() => open('meds')}><Icon name="plus" size={18} />เพิ่มยา</Button> : null}
        <Button size="sm" variant="secondary" onClick={() => open('report')}><Icon name="list" size={18} />รายงาน</Button>
        <Button size="sm" variant="secondary" onClick={() => open('health')}><Icon name="heart" size={18} />สุขภาพ</Button>
        <Button size="sm" variant="ghost" onClick={() => open('house')}>แก้ข้อมูล</Button>
      </div>
    </Card>
  );
}

function Today({ patient }) {
  const [meds, loading] = useMeds(patient.id);
  const [slots, slotsLoading] = useTodaySchedule(patient.id, meds);
  const done = slots.filter((s) => s.log?.status === 'taken').length;
  return (
    <section className="stack hm-today" aria-label="ตารางกินยาวันนี้">
      <h2>ตารางกินยาวันนี้ <span className="muted small">{slots.length ? `${done}/${slots.length} มื้อ` : ''}</span></h2>
      <Card><TodaySchedule patient={patient} slots={slots} loading={loading || slotsLoading} /></Card>
    </section>
  );
}

function Latest({ uid }) {
  const [rows] = useQueryData(query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(3)), [uid]);
  if (!rows.length) return null;
  return (
    <section className="stack" aria-label="แจ้งเตือนล่าสุด">
      <h2>แจ้งเตือนล่าสุด</h2>
      <Card className="hm-list">
        {rows.map((n) => (
          <a key={n.id} href="#/notifications" className={n.readAt ? '' : 'unread'}>
            <strong>{n.title}</strong>
            <span className="muted small">{n.createdAt?.toMillis ? clock.format(n.createdAt.toMillis()) + ' น.' : ''}</span>
          </a>
        ))}
        <a className="hm-more" href="#/notifications">ดูทั้งหมด</a>
      </Card>
    </section>
  );
}

function Recent({ patients, names, uid }) {
  const rows = useActivity(patients).slice(0, 4);
  if (!rows.length) return null;
  return (
    <section className="stack" aria-label="กิจกรรมล่าสุด">
      <h2>ใครบันทึกอะไรล่าสุด</h2>
      <Card className="hm-list">
        {rows.map((r) => (
          <a key={`${r.patientId}-${r.id}`} href="#/house">
            <strong>{r.loggedBy === uid ? 'คุณ' : names[r.loggedBy] ?? 'สมาชิก'} · {STATUS_TEXT[r.status] ?? r.status}</strong>
            <span className="muted small">{r.medName} ของ {r.patient} · {clock.format(r.loggedAt.toMillis())} น.</span>
          </a>
        ))}
      </Card>
    </section>
  );
}

export default function Home() {
  const { patients, house, user, profile, memberNames } = useSession();
  const visible = patients.filter((p) => can(p, 'viewMeds'));
  const [pickedId, setPickedId] = useState(() => { try { return sessionStorage.getItem('medsPatient'); } catch { return null; } });
  const patient = visible.find((p) => p.id === pickedId) ?? visible.find((p) => p.isSelf && p.isOwner) ?? visible[0];
  const pick = (id) => { try { sessionStorage.setItem('medsPatient', id); } catch { /* storage may be blocked */ } setPickedId(id); };
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(now)) % 24;
  const name = profile?.displayName ?? user.displayName ?? '';

  return (
    <div className="stack-lg hm">
      <header className="hm-hello">
        <p className="muted">{dayFmt.format(now)}</p>
        <h1>{greeting(hour)}{name ? ` ${name}` : ''}</h1>
        {house ? (
          <a className="hm-house" href="#/house"><Icon name="home" size={18} />{house.name}<span className="muted small">รหัสเชิญ {house.inviteCode}</span></a>
        ) : (
          <a className="hm-house hm-house-new" href="#/house"><Icon name="people" size={18} />สร้างบ้านเพื่อดูแลครอบครัวด้วยกัน<Icon name="chevron" size={16} /></a>
        )}
      </header>

      {!patient ? <Empty icon="people" title="ยังไม่มีโปรไฟล์ให้ดู">สร้างบ้านแล้วเพิ่มโปรไฟล์ของคนในครอบครัวได้ที่หน้าบ้านและครอบครัว</Empty> : (
        <>
          {visible.length > 1 ? <Chips patients={visible} value={patient.id} onChange={pick} /> : null}
          <PatientCard key={`c-${patient.id}`} patient={patient} members={house?.memberUids?.length ?? 1} />
          <Today key={`t-${patient.id}`} patient={patient} />
          <Latest uid={user.uid} />
          <Recent patients={visible.filter((p) => p.houseId)} names={memberNames} uid={user.uid} />
        </>
      )}
    </div>
  );
}
