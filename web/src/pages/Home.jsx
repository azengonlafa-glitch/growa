import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useDocData, useQueryData } from '../lib/hooks.js';
import { useSession, can } from '../lib/session.js';
import { useMeds, useTodaySchedule, daysLeft, isLow } from '../lib/meds.js';
import { ORDER_STATUS, baht, timeAgo } from '../lib/format.js';
import { Badge, Card, Notice } from '../components/ui.jsx';

const ACTIVE = new Set(['pharmacy_checking', 'awaiting_pharmacist', 'need_more_info', 'awaiting_payment', 'payment_failed', 'paid', 'preparing', 'shipping', 'delivery_issue', 'out_of_stock']);

function PatientToday({ patient }) {
  const [meds] = useMeds(can(patient, 'viewMeds') ? patient.id : null);
  const [slots] = useTodaySchedule(can(patient, 'viewMeds') ? patient.id : null, meds);
  if (!can(patient, 'viewMeds')) return null;
  const now = Date.now();
  const unlogged = slots.filter((s) => !s.log && s.at <= now);
  const next = slots.find((s) => !s.log && s.at > now);
  const low = meds.filter(isLow);

  return (
    <a className="card card-link stack" href="#/meds" onClick={() => sessionStorage.setItem('medsPatient', patient.id)}>
      <div className="between">
        <h3>{patient.isSelf ? 'ยาของฉัน' : patient.displayName}</h3>
        {patient.viaCaregiver ? <Badge tone="info">ผู้ดูแล</Badge> : null}
      </div>
      <div className="row">
        <div className="stat"><span className="stat-value num">{slots.filter((s) => s.log?.status === 'taken').length}/{slots.length}</span><span className="muted small">มื้อที่บันทึกว่ากินแล้ววันนี้</span></div>
      </div>
      {unlogged.length ? <Badge tone="warn">ยังไม่ได้บันทึก {unlogged.length} มื้อ</Badge> : null}
      {next ? <p className="small">มื้อถัดไป <strong>{next.time} น.</strong> · {next.med.name}</p> : <p className="muted small">ไม่มีมื้อยาที่เหลือวันนี้</p>}
      {low.map((m) => (
        <Badge key={m.id} tone="bad">{m.name} เหลือประมาณ {daysLeft(m)} วัน</Badge>
      ))}
    </a>
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
  const self = patients.find((p) => p.isSelf && p.isOwner);
  const [orders] = useQueryData(
    query(collection(db, 'orders'), where('placedBy', '==', user.uid), orderBy('createdAt', 'desc'), limit(10)),
    [user.uid],
  );
  const active = orders.filter((o) => ACTIVE.has(o.status));

  return (
    <div className="stack-lg">
      <header className="page-header">
        <h1>สวัสดี {profile?.displayName ?? ''}</h1>
        <p className="muted">ดูแลการใช้ยาของคุณและครอบครัวในที่เดียว</p>
      </header>

      {self ? <HealthPrompt patient={self} /> : null}

      {invitations.length ? (
        <Notice tone="info" title={`มีคำเชิญเป็นผู้ดูแล ${invitations.length} รายการ`}>
          <a href="#/family">ไปที่หน้าครอบครัวเพื่อตอบรับ</a>
        </Notice>
      ) : null}

      {staffOf.length ? (
        <a className="card card-link between" href="#/pharmacist">
          <div>
            <h3>⚕ งานของร้าน {staffOf[0].pharmacy.name}</h3>
            <p className="muted small">คำสั่งซื้อใหม่ คิวประเมิน และการจัดส่ง</p>
          </div>
          <span aria-hidden>→</span>
        </a>
      ) : null}

      <div className="grid-cards">
        <a className="card card-link stack" href="#/symptom">
          <h3>♡ ประเมินอาการเบื้องต้น</h3>
          <p className="muted small">ตอบคำถามทีละข้อ แล้วรู้ว่าควรดูแลตัวเอง ปรึกษาเภสัชกร หรือพบแพทย์</p>
        </a>
        <a className="card card-link stack" href="#/pharmacies">
          <h3>✚ ร้านยาใกล้ฉัน</h3>
          <p className="muted small">ร้านที่มีใบอนุญาตจาก อย. และร้านพาร์ทเนอร์ที่สั่งซื้อได้</p>
        </a>
      </div>

      <section>
        <div className="section-title"><h2>ยาวันนี้</h2><a href="#/meds" className="small">ดูทั้งหมด</a></div>
        <div className="grid-cards">
          {patients.map((p) => <PatientToday key={p.id} patient={p} />)}
        </div>
      </section>

      <section>
        <div className="section-title"><h2>คำสั่งซื้อที่กำลังดำเนินการ</h2><a href="#/orders" className="small">ดูทั้งหมด</a></div>
        <Card>
          {active.length ? (
            <div className="list">
              {active.map((o) => (
                <a key={o.id} className="list-item" href={`#/orders/${o.id}`} style={{ color: 'inherit' }}>
                  <div className="list-item-main">
                    <div className="truncate">{o.items.map((i) => i.name).join(', ')}</div>
                    <div className="muted small">{timeAgo(o.createdAt)} · {baht(o.total)}</div>
                  </div>
                  <Badge tone={ORDER_STATUS[o.status]?.[1]}>{ORDER_STATUS[o.status]?.[0]}</Badge>
                </a>
              ))}
            </div>
          ) : <p className="muted">ไม่มีคำสั่งซื้อที่กำลังดำเนินการ</p>}
        </Card>
      </section>
    </div>
  );
}
