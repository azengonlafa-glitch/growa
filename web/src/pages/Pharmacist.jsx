import { useState } from 'react';
import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { useAction, useDocData, useQueryData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { ORDER_STATUS, ROUTE_INFO, baht, timeAgo } from '../lib/format.js';
import { Badge, Button, Card, Empty, ErrorText, Field, PageHeader, Segmented } from '../components/ui.jsx';

function Items({ items }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((i) => (
        <li key={i.name}>{i.name} × {i.qty} {i.requiresPharmacistReview ? <Badge tone="warn">ต้องประเมิน</Badge> : null}</li>
      ))}
    </ul>
  );
}

function NewOrder({ order }) {
  const [reason, setReason] = useState('');
  const [declining, setDeclining] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <Card className="stack">
      <div className="between"><strong>#{order.id.slice(0, 6)} · {timeAgo(order.createdAt)}</strong><span className="num">{baht(order.total)}</span></div>
      <Items items={order.items} />
      <p className="muted small">{order.source === 'refill' ? 'คำขอเติมยาประจำ · ' : ''}ส่งที่ {order.deliveryAddress?.line1}</p>
      {declining ? (
        <form className="row" onSubmit={(e) => { e.preventDefault(); run(() => call('pharmacyRespondOrder', { orderId: order.id, available: false, reason })); }}>
          <input style={{ flex: 1 }} required placeholder="เหตุผล เช่น สินค้าหมด" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="เหตุผล" />
          <Button size="sm" variant="danger" busy={busy}>แจ้งลูกค้า</Button>
        </form>
      ) : (
        <div className="row">
          <Button size="sm" busy={busy} onClick={() => run(() => call('pharmacyRespondOrder', { orderId: order.id, available: true }))}>มีสินค้า ยืนยัน</Button>
          <Button size="sm" variant="secondary" onClick={() => setDeclining(true)}>สินค้าไม่พร้อม</Button>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function ReviewCard({ review }) {
  const [catalog] = useQueryData(review.triageId ? collection(db, 'catalog') : null, [review.triageId]);
  const [notes, setNotes] = useState('');
  const [approved, setApproved] = useState([]);
  const { busy, error, run } = useAction();
  const p = review.patientSnapshot ?? {};
  const decide = (decision) => run(() => call('submitPharmacistReview', {
    reviewId: review.id, decision, notes: notes || null, approvedCatalogIds: approved,
  }));
  const route = review.triageResult?.route;

  return (
    <Card className="stack">
      <div className="between">
        <strong>{review.triageId ? 'ปรึกษาจากแบบประเมินอาการ' : `คำสั่งซื้อ #${review.orderId.slice(0, 6)}`}</strong>
        <Badge tone={review.decision === 'need_more_info' ? 'warn' : 'info'}>{review.decision === 'need_more_info' ? 'รอผู้ป่วยตอบ' : 'รอประเมิน'}</Badge>
      </div>
      <div className="grid-2">
        <div className="stack" style={{ gap: 4 }}>
          <span className="small"><strong>ผู้ป่วย:</strong> {p.displayName ?? '—'}{p.age ? `, ${p.age} ปี` : ''}</span>
          <span className="small"><strong>แพ้ยา:</strong> {p.allergies?.join(', ') || 'ไม่ได้บันทึก'}</span>
          <span className="small"><strong>โรคประจำตัว:</strong> {p.conditions?.join(', ') || 'ไม่ได้บันทึก'}</span>
          <span className="small"><strong>ยาที่ใช้อยู่:</strong> {p.currentMeds?.join(', ') || 'ไม่ได้บันทึก'}</span>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          {review.items ? <Items items={review.items} /> : null}
          {review.triageResult ? (
            <>
              <span className="small"><strong>ผลแบบประเมิน:</strong> {review.triageResult.title}</span>
              {route ? <Badge tone={ROUTE_INFO[route][1]}>{ROUTE_INFO[route][0]}</Badge> : null}
            </>
          ) : null}
        </div>
      </div>
      {review.triageSummary?.questionsForPharmacist?.length ? (
        <details>
          <summary className="small">คำตอบของผู้ป่วย ({review.triageSummary.questionsForPharmacist.length} ข้อ)</summary>
          <ol className="small">{review.triageSummary.questionsForPharmacist.map((t) => <li key={t}>{t}</li>)}</ol>
        </details>
      ) : null}
      {review.thread?.length ? (
        <ul className="timeline small">{review.thread.map((m, i) => <li key={i}><strong>{m.role === 'pharmacist' ? 'เภสัชกร' : 'ผู้ป่วย'}:</strong> {m.text}</li>)}</ul>
      ) : null}

      <Field label="บันทึก / คำแนะนำ / คำถามถึงผู้ป่วย">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {review.triageId ? (
        <Field label="ยาที่อนุมัติให้สั่งได้ (ภายใน 24 ชม.)">
          <select multiple value={approved} onChange={(e) => setApproved([...e.target.selectedOptions].map((o) => o.value))} style={{ minHeight: 120 }}>
            {catalog.filter((c) => c.deliverable).map((c) => <option key={c.id} value={c.id}>{c.genericName} {c.strength}</option>)}
          </select>
        </Field>
      ) : null}
      <div className="row">
        <Button size="sm" busy={busy} disabled={review.triageId && !approved.length} onClick={() => decide('approved')}>อนุมัติ</Button>
        <Button size="sm" variant="secondary" busy={busy} disabled={!notes} onClick={() => decide('need_more_info')}>ถามข้อมูลเพิ่ม</Button>
        <Button size="sm" variant="secondary" busy={busy} disabled={!notes} onClick={() => decide('refer_doctor')}>แนะนำพบแพทย์</Button>
        <Button size="sm" variant="danger" busy={busy} disabled={!notes} onClick={() => decide('rejected')}>ไม่อนุมัติ</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

const NEXT = { paid: ['preparing', 'เริ่มจัดเตรียมยา'], preparing: ['shipping', 'ส่งให้ผู้จัดส่ง'], shipping: ['delivered', 'จัดส่งสำเร็จ'], delivery_issue: ['shipping', 'นัดส่งใหม่'] };

function InProgress({ order }) {
  const { busy, error, run } = useAction();
  const next = NEXT[order.status];
  const [label, tone] = ORDER_STATUS[order.status];
  return (
    <div className="list-item">
      <div className="list-item-main">
        <div className="truncate">#{order.id.slice(0, 6)} · {order.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</div>
        <Badge tone={tone}>{label}</Badge>
        <ErrorText>{error}</ErrorText>
      </div>
      <div className="row">
        {next ? <Button size="sm" busy={busy} onClick={() => run(() => call('updateDelivery', { orderId: order.id, to: next[0] }))}>{next[1]}</Button> : null}
        {order.status === 'shipping' ? (
          <Button size="sm" variant="secondary" busy={busy} onClick={() => run(() => call('updateDelivery', { orderId: order.id, to: 'delivery_issue', note: 'ติดต่อผู้รับไม่ได้' }))}>แจ้งปัญหา</Button>
        ) : null}
      </div>
    </div>
  );
}

export default function Pharmacist() {
  const { staffOf } = useSession();
  const staff = staffOf[0];
  const pharmacyId = staff?.pharmacyId;
  const [tab, setTab] = useState('new');
  const [orders] = useQueryData(
    pharmacyId ? query(collection(db, 'orders'), where('pharmacyId', '==', pharmacyId), orderBy('createdAt', 'desc'), limit(50)) : null,
    [pharmacyId],
  );
  const isPharmacist = staff?.role === 'pharmacist' && staff?.licenseVerified;
  const [reviews] = useQueryData(
    isPharmacist ? query(collection(db, 'pharmacistReviews'), where('pharmacyId', '==', pharmacyId), where('decision', 'in', ['pending', 'need_more_info'])) : null,
    [pharmacyId, isPharmacist],
  );
  const [pharmacy] = useDocData(pharmacyId ? doc(db, 'pharmacies', pharmacyId) : null, [pharmacyId]);

  if (!staff) return <Empty title="คุณยังไม่ได้เป็นพนักงานของร้านใด" />;
  const fresh = orders.filter((o) => o.status === 'pharmacy_checking');
  const running = orders.filter((o) => ['paid', 'preparing', 'shipping', 'delivery_issue'].includes(o.status));

  return (
    <div className="stack-lg">
      <PageHeader
        title={pharmacy?.name ?? 'ร้านของฉัน'}
        subtitle={`${isPharmacist ? 'เภสัชกร (ยืนยันใบอนุญาตแล้ว)' : staff.role} · ข้อมูลอัปเดตแบบเรียลไทม์`}
      />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ['new', `คำสั่งซื้อใหม่ (${fresh.length})`],
          ...(isPharmacist ? [['review', `คิวประเมิน (${reviews.length})`]] : []),
          ['running', `กำลังดำเนินการ (${running.length})`],
        ]}
      />
      {tab === 'new' ? (fresh.length ? <div className="stack">{fresh.map((o) => <NewOrder key={o.id} order={o} />)}</div> : <Empty icon="▤" title="ไม่มีคำสั่งซื้อใหม่" />) : null}
      {tab === 'review' ? (reviews.length ? <div className="stack">{reviews.map((r) => <ReviewCard key={r.id} review={r} />)}</div> : <Empty icon="⚕" title="ไม่มีคำขอที่รอประเมิน" />) : null}
      {tab === 'running' ? (running.length ? <Card><div className="list">{running.map((o) => <InProgress key={o.id} order={o} />)}</div></Card> : <Empty title="ไม่มีงานจัดส่งค้าง" />) : null}
    </div>
  );
}
