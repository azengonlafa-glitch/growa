import { useState } from 'react';
import { addDoc, collection, doc, limit, orderBy, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { useAction, useDocData, useQueryData } from '../lib/hooks.js';
import { useSession, can } from '../lib/session.js';
import { useMeds, useTodaySchedule, daysLeft, isLow } from '../lib/meds.js';
import { ORDER_STATUS } from '../lib/format.js';
import { Button, ErrorText, Icon, Mascot, Notice } from '../components/ui.jsx';

const ACTIVE = new Set(['pharmacy_checking', 'awaiting_pharmacist', 'need_more_info', 'awaiting_payment', 'payment_failed', 'paid', 'preparing', 'shipping', 'delivery_issue', 'out_of_stock']);

function greeting() {
  const h = new Date(Date.now() + (new Date().getTimezoneOffset() + 420) * 60000).getHours();
  return h < 11 ? 'สวัสดีตอนเช้า' : h < 16 ? 'สวัสดีตอนบ่าย' : h < 19 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนค่ำ';
}

// The one thing to do next: the next unlogged dose with a single big button.
function NextDose({ patient, slots }) {
  const { user } = useSession();
  const { busy, error, run } = useAction();
  const now = Date.now();
  // Oldest unlogged dose that is already due comes first, then the next upcoming one.
  const next = slots.find((s) => !s.log && s.at <= now) ?? slots.find((s) => !s.log && s.at > now);
  const taken = slots.filter((s) => s.log?.status === 'taken').length;

  const logTaken = () => run(async () => {
    const ref = await addDoc(collection(db, 'patients', patient.id, 'doseLogs'), {
      medicationId: next.med.id,
      scheduledFor: Timestamp.fromMillis(next.at),
      status: 'taken',
      loggedBy: user.uid,
      loggedAt: serverTimestamp(),
    });
    await call('afterDoseLog', { patientId: patient.id, logId: ref.id });
  });

  return (
    <section className="float-card stack" aria-label="มื้อถัดไป" style={{ gap: 4 }}>
      <div className="between">
        <span className="muted" style={{ fontWeight: 700 }}>{next && next.at <= now ? 'ถึงเวลากินยา' : 'มื้อถัดไป'}</span>
        <div className="dots" role="img" aria-label={`บันทึกว่ากินแล้ว ${taken} จาก ${slots.length} มื้อ`}>
          {slots.slice(0, 8).map((s) => <span key={`${s.med.id}-${s.at}`} className={s.log?.status === 'taken' ? 'on' : ''} />)}
        </div>
      </div>
      {next ? (
        <>
          <div className="big-time num">{next.time}</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: 4 }}>{next.med.name}</div>
          <div className="muted">
            {next.med.dosePerIntake} {next.med.unit ?? ''}{next.med.mealRelation === 'after' ? ' · หลังอาหาร' : next.med.mealRelation === 'before' ? ' · ก่อนอาหาร' : ''}
          </div>
          {can(patient, 'logDoses') ? (
            <Button size="lg" busy={busy} onClick={logTaken} style={{ marginTop: 14 }}>
              <Icon name="check" stroke={2.8} />กินแล้ว
            </Button>
          ) : null}
          <ErrorText>{error}</ErrorText>
        </>
      ) : (
        <p style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', margin: '10px 0 4px' }}>
          {slots.length ? 'วันนี้ครบทุกมื้อแล้ว' : 'วันนี้ไม่มีมื้อยา'}
        </p>
      )}
    </section>
  );
}

function HealthPrompt({ patient }) {
  const [health, loading] = useDocData(doc(db, 'patients', patient.id, 'health', 'profile'), [patient.id]);
  if (loading || health) return null;
  return (
    <Notice tone="warn" title="ยังไม่ได้กรอกประวัติแพ้ยาและโรคประจำตัว">
      ข้อมูลนี้ช่วยให้เภสัชกรเลือกยาได้ปลอดภัย <a href="#/health">กรอกตอนนี้</a>
    </Notice>
  );
}

export default function Home() {
  const { user, profile, patients, invitations, staffOf } = useSession();
  const viewablePatients = patients.filter((p) => can(p, 'viewMeds'));
  // A caregiver opens on the person they look after; everyone else on themselves.
  const [pickedId, setPickedId] = useState(() => sessionStorage.getItem('medsPatient'));
  const patient = viewablePatients.find((p) => p.id === pickedId)
    ?? viewablePatients.find((p) => p.viaCaregiver) ?? viewablePatients[0];
  const [meds] = useMeds(patient?.id);
  const [slots] = useTodaySchedule(patient?.id, meds);
  const low = meds.filter(isLow).sort((a, b) => (daysLeft(a) ?? 0) - (daysLeft(b) ?? 0))[0];
  const self = patients.find((p) => p.isSelf && p.isOwner);

  const [orders] = useQueryData(
    query(collection(db, 'orders'), where('placedBy', '==', user.uid), orderBy('createdAt', 'desc'), limit(10)),
    [user.uid],
  );
  const [unread] = useQueryData(
    query(collection(db, 'users', user.uid, 'notifications'), where('readAt', '==', null)),
    [user.uid],
  );
  const active = orders.filter((o) => ACTIVE.has(o.status));
  const firstOrder = active[0];
  const title = patient ? (patient.isSelf && !patient.viaCaregiver ? 'วันนี้ของคุณ' : `วันนี้ของ${patient.displayName}`) : `สวัสดี ${profile?.displayName ?? ''}`;
  const pick = (id) => { sessionStorage.setItem('medsPatient', id); setPickedId(id); };

  return (
    <div className="stack-lg">
      <header className="hero" style={{ paddingBottom: patient ? 72 : 28 }}>
        <div className="between" style={{ alignItems: 'center' }}>
          {viewablePatients.length > 1 ? (
            <label className="round-btn" style={{ width: 'auto', borderRadius: 999, padding: '4px 14px 4px 4px', gap: 10, display: 'flex', alignItems: 'center' }}>
              <span className="avatar" style={{ width: 40, height: 40, fontSize: '1.1rem' }} aria-hidden>{(patient.displayName ?? '?').slice(0, 1)}</span>
              <span className="sr-only" style={{ position: 'absolute', opacity: 0 }}>เลือกคนที่ดูแล</span>
              <select value={patient.id} onChange={(e) => pick(e.target.value)} aria-label="เลือกคนที่ดูแล"
                style={{ border: 0, background: 'transparent', minHeight: 40, width: 'auto', padding: '0 4px', fontWeight: 700, fontSize: '1rem' }}>
                {viewablePatients.map((p) => <option key={p.id} value={p.id}>{p.isSelf && !p.viaCaregiver ? 'ตัวเอง' : p.displayName}</option>)}
              </select>
            </label>
          ) : <span />}
          <a className="round-btn" href="#/notifications" aria-label={unread.length ? `แจ้งเตือน ${unread.length} รายการ` : 'แจ้งเตือน'}>
            <Icon name="bell" />
            {unread.length ? <span className="nav-badge">{unread.length}</span> : null}
          </a>
        </div>
        <div style={{ marginTop: 22 }}>
          <div className="hero-eyebrow">{greeting()}</div>
          <h1 className="hero-title" style={{ fontSize: '2.2rem', maxWidth: '8.5em' }}>{title}</h1>
        </div>
        <div className="hero-mascot"><Mascot size={104} label="มาสคอตแคปซูลยิ้ม" /></div>
      </header>

      {patient ? <NextDose patient={patient} slots={slots} /> : null}

      <div className="tile-grid" style={patient ? { marginTop: -4 } : undefined}>
        {low ? (
          <a className="tile tile-honey" href="#/meds" onClick={() => patient && sessionStorage.setItem('medsPatient', patient.id)}>
            <span className="tile-icon"><Icon name="pill" /></span>
            <div><div className="tile-value num">{daysLeft(low)} วัน</div><div className="tile-label">{low.name} ใกล้หมด (ประมาณ)</div></div>
          </a>
        ) : (
          <a className="tile tile-honey" href="#/meds">
            <span className="tile-icon"><Icon name="pill" /></span>
            <div><div className="tile-value">ยาพอใช้</div><div className="tile-label">ดูรายการยา</div></div>
          </a>
        )}
        {firstOrder ? (
          <a className="tile tile-sage" href={`#/orders/${firstOrder.id}`}>
            <span className="tile-icon"><Icon name="truck" /></span>
            <div><div className="tile-value">{active.length} รายการ</div><div className="tile-label">{ORDER_STATUS[firstOrder.status]?.[0]}</div></div>
          </a>
        ) : (
          <a className="tile tile-sage" href="#/pharmacies">
            <span className="tile-icon"><Icon name="store" /></span>
            <div><div className="tile-value">หาร้านยา</div><div className="tile-label">ใกล้คุณ</div></div>
          </a>
        )}
      </div>

      {self ? <HealthPrompt patient={self} /> : null}

      {invitations.length ? (
        <Notice tone="info" title={`มีคำเชิญเป็นผู้ดูแล ${invitations.length} รายการ`}>
          <a href="#/family">ไปที่หน้าครอบครัวเพื่อตอบรับ</a>
        </Notice>
      ) : null}

      {staffOf.length ? (
        <a className="tile tile-peach" href="#/pharmacist" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <span className="tile-icon"><Icon name="list" /></span>
          <div><div className="tile-label" style={{ fontSize: '1.05rem' }}>งานของร้าน {staffOf[0].pharmacy.name}</div><div className="muted small">คำสั่งซื้อใหม่ คิวประเมิน และการจัดส่ง</div></div>
        </a>
      ) : null}
    </div>
  );
}
