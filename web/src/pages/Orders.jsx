import { useState } from 'react';
import { collection, doc, limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { useAction, useDocData, useQueryData } from '../lib/hooks.js';
import { useSession, can } from '../lib/session.js';
import { ORDER_STATUS, baht, dateTime, timeAgo } from '../lib/format.js';
import { CardboardBox, TablePage } from '../flow/Table.jsx';
import { Badge, Button, Card, ConfirmButton, Empty, ErrorText, Field, Loading, MockBadge, Notice, PageHeader } from '../components/ui.jsx';

// Orders still moving open the live tracking screen; finished ones open the detail page (receipt, rating).
const ACTIVE = ['pharmacy_checking', 'awaiting_pharmacist', 'need_more_info', 'awaiting_payment', 'payment_failed', 'paid', 'preparing', 'shipping', 'delivery_issue'];

function OrderRow({ o }) {
  const [label, tone] = ORDER_STATUS[o.status] ?? [o.status, 'neutral'];
  return (
    <a className="list-item" href={ACTIVE.includes(o.status) ? `#/track/${o.id}` : `#/orders/${o.id}`} style={{ color: 'inherit' }}>
      <div className="list-item-main">
        <div className="truncate">{o.items?.map((i) => `${i.name} ×${i.qty}`).join(', ')}</div>
        <div className="muted small">
          {timeAgo(o.createdAt)} · {baht(o.total)}{o.source === 'refill' ? ' · เติมยา' : ''}
        </div>
      </div>
      <Badge tone={tone}>{label}</Badge>
    </a>
  );
}

function FamilyOrders({ patient }) {
  const [rows] = useQueryData(
    query(collection(db, 'orders'), where('patientId', '==', patient.id), orderBy('createdAt', 'desc'), limit(10)),
    [patient.id],
  );
  if (!rows.length) return null;
  return (
    <section className="stack">
      <h2>คำสั่งซื้อของ {patient.displayName}</h2>
      <Card><div className="list">{rows.map((o) => <OrderRow key={o.id} o={o} />)}</div></Card>
    </section>
  );
}

export default function Orders() {
  const { user, patients } = useSession();
  const [mine, loading] = useQueryData(
    query(collection(db, 'orders'), where('placedBy', '==', user.uid), orderBy('createdAt', 'desc'), limit(30)),
    [user.uid],
  );
  return (
    <div className="stack-lg">
      <PageHeader tone="honey" eyebrow="ติดตามสถานะแบบเรียลไทม์" title="คำสั่งซื้อ" />
      {loading ? <Loading /> : mine.length ? (
        <Card><div className="list">{mine.map((o) => <OrderRow key={o.id} o={o} />)}</div></Card>
      ) : (
        <Empty icon="list" title="ยังไม่มีคำสั่งซื้อ"><a href="#/pharmacies">ค้นหาร้านยา</a></Empty>
      )}
      {patients.filter((p) => p.viaCaregiver && can(p, 'viewOrders')).map((p) => <FamilyOrders key={p.id} patient={p} />)}
    </div>
  );
}

const STEPS = ['pharmacy_checking', 'awaiting_pharmacist', 'awaiting_payment', 'paid', 'preparing', 'shipping', 'delivered'];
const CANCELLABLE = ['pharmacy_checking', 'out_of_stock', 'awaiting_pharmacist', 'need_more_info', 'awaiting_payment', 'payment_failed'];

function PharmacistThread({ reviewId }) {
  const [review] = useDocData(doc(db, 'pharmacistReviews', reviewId), [reviewId]);
  const [answer, setAnswer] = useState('');
  const { busy, error, run } = useAction();
  if (!review) return null;
  const DECISION = {
    approved: ['เภสัชกรอนุมัติแล้ว', 'good'],
    rejected: ['ไม่อนุมัติ', 'bad'],
    refer_doctor: ['แนะนำให้พบแพทย์', 'warn'],
    emergency: ['แนะนำให้ไปโรงพยาบาลทันที', 'bad'],
    need_more_info: ['เภสัชกรขอข้อมูลเพิ่ม', 'warn'],
    pending: ['รอเภสัชกรประเมิน', 'info'],
  };
  const [label, tone] = DECISION[review.decision] ?? DECISION.pending;
  return (
    <Card className="stack">
      <div className="between"><h3>การประเมินของเภสัชกร</h3><Badge tone={tone}>{label}</Badge></div>
      {review.thread?.length ? (
        <ul className="timeline">
          {review.thread.map((m, i) => (
            <li key={i}><strong>{m.role === 'pharmacist' ? 'เภสัชกร' : 'คุณ'}:</strong> {m.text}</li>
          ))}
        </ul>
      ) : null}
      {review.decision === 'need_more_info' ? (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => call('answerPharmacistQuestion', { reviewId, answer }).then(() => setAnswer(''))); }}>
          <Field label="ตอบเภสัชกร"><textarea rows={3} required value={answer} onChange={(e) => setAnswer(e.target.value)} /></Field>
          <Button type="submit" busy={busy}>ส่งคำตอบ</Button>
          <ErrorText>{error}</ErrorText>
        </form>
      ) : null}
      {review.notes && review.decision !== 'need_more_info' ? <p><strong>หมายเหตุ:</strong> {review.notes}</p> : null}
    </Card>
  );
}

function RateOrder({ order }) {
  const { user } = useSession();
  const [existing, loading] = useDocData(doc(db, 'pharmacyRatings', order.id), [order.id]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const { busy, error, run } = useAction();
  if (loading) return null;
  if (existing) return <Notice tone="good" title="ขอบคุณสำหรับรีวิว">{'★'.repeat(existing.rating)} {existing.comment}</Notice>;
  return (
    <Card className="stack">
      <h3>รีวิวร้านนี้</h3>
      <div className="row" role="group" aria-label={`ให้คะแนน ปัจจุบัน ${rating} ดาว`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={`btn btn-sm ${n <= rating ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRating(n)} aria-label={`${n} ดาว`} aria-pressed={n === rating}>★</button>
        ))}
      </div>
      <textarea rows={2} placeholder="เล่าประสบการณ์ (ไม่บังคับ)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} aria-label="ความคิดเห็น" />
      <Button busy={busy} onClick={() => run(async () => {
        await setDoc(doc(db, 'pharmacyRatings', order.id), {
          userUid: user.uid, pharmacyId: order.pharmacyId, rating, comment, hidden: false, createdAt: serverTimestamp(),
        });
        await call('afterRating', { orderId: order.id });
      })}>ส่งรีวิว</Button>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

export function OrderDetail({ orderId }) {
  const { user } = useSession();
  const [order, loading] = useDocData(doc(db, 'orders', orderId), [orderId]);
  const [events] = useQueryData(query(collection(db, 'orders', orderId, 'events'), orderBy('at')), [orderId]);
  const [pharmacy] = useDocData(order ? doc(db, 'pharmacies', order.pharmacyId) : null, [order?.pharmacyId]);
  const { busy, error, run } = useAction();

  if (loading) return <Loading />;
  if (!order) return <Empty title="ไม่พบคำสั่งซื้อ" />;
  const [label, tone] = ORDER_STATUS[order.status] ?? [order.status, 'neutral'];
  const isBuyer = order.placedBy === user.uid;
  const stepIndex = STEPS.indexOf(order.status === 'need_more_info' ? 'awaiting_pharmacist' : order.status === 'payment_failed' ? 'awaiting_payment' : order.status);

  return (
    <TablePage>
    <CardboardBox>
    <div className="stack-lg">
      <PageHeader tone="honey" eyebrow="ตอนนี้" title={label} back="orders" mascot />
      <p className="muted small">#{order.id.slice(0, 6)} · {pharmacy?.name} · {dateTime(order.createdAt)}</p>
      {order.needsPharmacistReview && ['pharmacy_checking', 'awaiting_pharmacist', 'need_more_info'].includes(order.status) ? (
        <Notice tone="good" title="เภสัชกรอนุมัติ ไม่ใช่ AI">ยังไม่มีการเก็บเงินจนกว่าเภสัชกรจะอนุมัติ</Notice>
      ) : null}

      {stepIndex >= 0 ? (
        <div className="steps">
          <div className="between">
            <span className="steps-label">ขั้นที่ {stepIndex + 1} จาก {STEPS.length}</span>
            <span className="muted small">{stepIndex + 1 < STEPS.length ? `ถัดไป: ${ORDER_STATUS[STEPS[stepIndex + 1]]?.[0] ?? ''}` : 'ครบทุกขั้นตอนแล้ว'}</span>
          </div>
          <div className="progress" role="progressbar" aria-label="ความคืบหน้าคำสั่งซื้อ" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={stepIndex + 1} aria-valuetext={`ขั้นที่ ${stepIndex + 1} จาก ${STEPS.length}: ${label}`}>
            <span style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>
      ) : null}

      {order.status === 'awaiting_payment' || order.status === 'payment_failed' ? (
        <Card className="stack">
          <h3>ชำระเงิน <MockBadge label="จำลอง" /></h3>
          <p className="muted small">ร้านยืนยันสินค้าแล้ว{order.needsPharmacistReview ? ' และเภสัชกรอนุมัติแล้ว' : ''} ระบบจึงเปิดให้ชำระเงิน</p>
          {isBuyer ? (
            <div className="stack">
              <Button busy={busy} onClick={() => run(() => call('payOrder', { orderId }))}>ชำระ {baht(order.total)}</Button>
              <details>
                <summary className="muted small">สำหรับทดสอบการสาธิต</summary>
                <div style={{ marginTop: 8 }}>
                  <Button size="sm" variant="secondary" busy={busy} onClick={() => run(() => call('payOrder', { orderId, simulateFailure: true }))}>จำลองชำระไม่สำเร็จ</Button>
                </div>
              </details>
            </div>
          ) : <p className="muted">รอผู้สั่งซื้อชำระเงิน</p>}
        </Card>
      ) : null}

      {order.status === 'rejected' ? <Notice tone="bad" title="เภสัชกรไม่อนุมัติการจ่ายยา">{order.rejectReason} — ไม่มีการเก็บเงิน</Notice> : null}
      {order.status === 'out_of_stock' ? <Notice tone="warn" title="ร้านแจ้งว่าสินค้าไม่พร้อม">เลือกร้านอื่นหรือยกเลิกคำขอได้ <a href="#/pharmacies">ค้นหาร้านอื่น</a></Notice> : null}

      {order.reviewId ? <PharmacistThread reviewId={order.reviewId} /> : null}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card className="stack">
          <h3>รายการ</h3>
          <div className="list">
            {order.items.map((i) => (
              <div key={i.productId} className="list-item">
                <span>{i.name} × {i.qty}{i.requiresPharmacistReview ? <> <Badge tone="warn">ผ่านเภสัชกร</Badge></> : null}</span>
                <span className="num">{baht(i.unitPrice * i.qty)}</span>
              </div>
            ))}
            <div className="list-item"><span>ค่าจัดส่ง</span><span className="num">{baht(order.deliveryFee)}</span></div>
            <div className="list-item"><strong>รวม</strong><strong className="num">{baht(order.total)}</strong></div>
          </div>
          {order.deliveryAddress ? <p className="muted small">ส่งที่: {order.deliveryAddress.line1}</p> : null}
        </Card>

        <Card className="stack">
          <h3>ความคืบหน้า</h3>
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id}>
                <strong>{ORDER_STATUS[e.to]?.[0] ?? 'สร้างคำสั่งซื้อ'}</strong>
                <div className="muted small">{dateTime(e.at)}{e.note && e.note !== order.source ? ` · ${e.note}` : ''}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="row">
        {order.status === 'shipping' ? <Button busy={busy} onClick={() => run(() => call('confirmReceived', { orderId }))}>ยืนยันว่าได้รับยาแล้ว</Button> : null}
        {CANCELLABLE.includes(order.status) ? (
          <ConfirmButton busy={busy} question="ยกเลิกคำสั่งซื้อนี้?" yes="ยกเลิกคำสั่งซื้อ" no="ไม่ยกเลิก" onConfirm={() => run(() => call('cancelOrder', { orderId, reason: 'ผู้ใช้ยกเลิก' }))}>ยกเลิกคำสั่งซื้อ</ConfirmButton>
        ) : null}
      </div>
      <ErrorText>{error}</ErrorText>

      {order.status === 'delivered' && isBuyer ? <RateOrder order={order} /> : null}
    </div>
    </CardboardBox>
    </TablePage>
  );
}
