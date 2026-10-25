// After the order is placed: one screen that follows the order from stock check to delivery.
// Payment appears only once the pharmacy confirmed stock (and a pharmacist approved, where needed),
// and the delivery map appears while the order is on its way.
import { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { call, db, isProduction } from '../firebase.js';
import { go, useAction, useDocData, useHashRoute } from '../lib/hooks.js';
import { baht } from '../lib/format.js';
import { Badge, Button, Card, ConfirmButton, ErrorText, Icon, Loading, MockBadge, Notice } from '../components/ui.jsx';
import { Confetti } from '../components/Flair.jsx';
import FlowPage from './FlowPage.jsx';
import { CardboardBox, TablePage } from './Table.jsx';
import TrackMap from './TrackMap.jsx';
import { PAYMENT_METHODS } from './CheckoutStep.jsx';
import PayPanel from '../components/PayPanel.jsx';
import { useFlow } from './state.jsx';

const DEMO_BUTTON = !isProduction || import.meta.env.VITE_DEMO_SIMULATION === 'true';
// The courier covers the whole route in this many ms on screen, so a demo does not take 30 real minutes.
const DEMO_TRIP_MS = 60_000;

const STAGES = ['ร้านยืนยันสต็อก', 'ชำระเงิน', 'ร้านจัดยา', 'กำลังจัดส่ง', 'ได้รับยา'];
const STAGE_OF = {
  pharmacy_checking: 0, awaiting_pharmacist: 0, need_more_info: 0,
  awaiting_payment: 1, payment_failed: 1,
  paid: 2, preparing: 2,
  shipping: 3, delivery_issue: 3,
  delivered: 5,
};
// Same list the server allows the buyer to cancel from (USER_CANCELLABLE in functions/src/orders.js).
const CANCELLABLE = ['pharmacy_checking', 'out_of_stock', 'awaiting_pharmacist', 'need_more_info', 'awaiting_payment', 'payment_failed'];

const ENDED = {
  out_of_stock: ['ร้านแจ้งว่าสินค้าไม่พร้อม', 'ยังไม่มีการเก็บเงิน ลองเลือกร้านอื่นหรือสินค้าอื่น'],
  rejected: ['เภสัชกรไม่อนุมัติการจ่ายยา', 'ยังไม่มีการเก็บเงิน ปรึกษาเภสัชกรหรือพบแพทย์'],
  cancelled: ['คำสั่งซื้อถูกยกเลิก', 'ยังไม่มีการเก็บเงิน'],
  refunded: ['คืนเงินแล้ว', 'ร้านคืนเงินตามคำสั่งซื้อนี้แล้ว'],
};
const DEMO_STEP_LABEL = {
  pharmacy_checking: 'จำลองร้านยืนยันสต็อก',
  paid: 'จำลองร้านจัดยาเสร็จ',
  preparing: 'จำลองร้านส่งของ',
};

function Stages({ stage }) {
  return (
    <ol className="stages" aria-label="ความคืบหน้าคำสั่งซื้อ">
      {STAGES.map((label, i) => (
        <li key={label} className={i < stage ? 'done' : i === stage ? 'now' : ''} aria-current={i === stage ? 'step' : undefined}>
          <span className="stage-dot" aria-hidden>{i < stage ? <Icon name="check" size={16} stroke={3} /> : i + 1}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Payment({ order, flow }) {
  const { busy, error, run } = useAction();
  const method = PAYMENT_METHODS.find(([id]) => id === flow.payment) ?? PAYMENT_METHODS[0];
  const pay = (simulateFailure = false) => run(() => call('payOrder', { orderId: order.id, method: method[0], ...(simulateFailure ? { simulateFailure: true } : {}) }));
  return (
    <section className="stack" aria-label="ชำระเงิน">
      <Notice tone="good" title={order.status === 'payment_failed' ? 'ชำระเงินไม่สำเร็จ ลองอีกครั้งได้' : 'ร้านยืนยันสต็อกแล้ว ชำระเงินได้เลย'}>
        {order.needsPharmacistReview ? 'เภสัชกรอนุมัติรายการที่ต้องผ่านเภสัชกรแล้ว ' : ''}ยอดคำนวณจากระบบ ไม่ใช่จากหน้าจอของคุณ
      </Notice>
      <Card className="stack">
        <div className="between"><h2>ยอดที่ต้องชำระ</h2><MockBadge label="จำลอง" /></div>
        <div className="list">
          <div className="list-item"><span>ค่าสินค้า</span><span className="num">{baht(order.subtotal)}</span></div>
          <div className="list-item"><span>ค่าจัดส่ง</span><span className="num">{baht(order.deliveryFee)}</span></div>
          <div className="list-item"><strong>รวม</strong><strong className="num">{baht(order.total)}</strong></div>
        </div>
      </Card>
      <div className="option-list" role="group" aria-label="เลือกช่องทางชำระเงิน">
        {PAYMENT_METHODS.map(([id, label, hint]) => (
          <button key={id} type="button" className={`option${flow.payment === id ? ' selected' : ''}`} aria-pressed={flow.payment === id} onClick={() => flow.update({ payment: id })}>
            <span className="option-box" aria-hidden>{flow.payment === id ? '✓' : ''}</span>
            <span className="store-option-main"><strong>{label}</strong><span className="muted small">{hint}</span></span>
          </button>
        ))}
      </div>
      <PayPanel order={order} method={method[0]} busy={busy} onPay={() => pay()} />
      <p className="muted small">ไม่มีการตัดเงินจริง ระบบชำระเงินนี้เป็นข้อมูลจำลองเพื่อสาธิตขั้นตอน</p>
      <ErrorText>{error}</ErrorText>
      {DEMO_BUTTON ? (
        <Button size="sm" variant="ghost" onClick={() => pay(true)} disabled={busy}>จำลองชำระเงินไม่สำเร็จ</Button>
      ) : null}
    </section>
  );
}

// Where the simulated courier is, from the time the shop marked the order as shipping.
function useTrip(order) {
  const now = useNow(order.status === 'shipping');
  const startedAt = order.delivery?.startedAt?.toMillis?.() ?? now;
  const progress = Math.max(0, Math.min(1, (now - startedAt) / DEMO_TRIP_MS));
  return { progress, left: Math.ceil((order.delivery?.etaMinutes ?? 0) * (1 - progress)), arrived: progress >= 1 };
}

function CourierCard({ order, trip }) {
  const d = order.delivery;
  return (
    <Card className="courier">
      <span className="courier-avatar" aria-hidden><Icon name="user" size={30} /></span>
      <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <strong>{d?.courier?.name ?? 'ผู้ส่ง'}</strong>
        <span className="muted small">{d?.courier?.vehicle ?? 'ผู้ส่ง'} · ระยะทาง {d?.distanceKm ?? '—'} กม. · ข้อมูลจำลอง</span>
      </div>
      <div className="eta" aria-live="polite">
        {trip.arrived ? <strong>ถึงแล้ว</strong> : <><strong className="num">{trip.left}</strong><span className="small"> นาที</span></>}
        <span className="muted small">เวลาถึงโดยประมาณ</span>
      </div>
    </Card>
  );
}

function TrackingMap({ order, pharmacy, trip }) {
  const from = pharmacy?.geo;
  const to = order.deliveryAddress?.geo;
  if (!from || !to) return null;
  return (
    <section className="stack" aria-label="แผนที่ติดตามการจัดส่ง">
      <TrackMap from={from} to={to} progress={trip.progress} />
      <p className="muted small">เส้นทางและตำแหน่งผู้ส่งเป็นข้อมูลจำลอง ไม่ใช่ GPS จริง</p>
    </section>
  );
}

export default function OrderStep() {
  const flow = useFlow();
  const [, orderId] = useHashRoute();
  const [order, loading, err] = useDocData(orderId ? doc(db, 'orders', orderId) : null, [orderId]);
  const [pharmacy] = useDocData(order ? doc(db, 'pharmacies', order.pharmacyId) : null, [order?.pharmacyId]);
  const trip = useTrip(order ?? {});
  const sim = useAction();
  const recv = useAction();
  const cancel = useAction();
  const again = () => { flow.restart(); go('choose'); };

  if (loading) return <FlowPage title="ติดตามคำสั่งซื้อ"><Loading /></FlowPage>;
  if (!order || err) {
    return (
      <FlowPage title="ติดตามคำสั่งซื้อ" onBack={() => go('')}>
        <Notice tone="warn" title="ไม่พบคำสั่งซื้อนี้">ลองเปิดจากรายการคำสั่งซื้อ หรือเริ่มสั่งใหม่</Notice>
        <Button block onClick={again}>เริ่มสั่งซื้อใหม่</Button>
      </FlowPage>
    );
  }

  const ended = ENDED[order.status];
  const stage = STAGE_OF[order.status] ?? 0;
  const demoLabel = DEMO_STEP_LABEL[order.status];
  const needsPharmacist = order.needsPharmacistReview && !order.reviewId;
  const canSimulate = DEMO_BUTTON && pharmacy?.sample && demoLabel && !(order.status === 'pharmacy_checking' && needsPharmacist);

  return (
    <TablePage>
    <FlowPage wide title={order.status === 'delivered' ? 'ได้รับยาแล้ว' : 'ติดตามคำสั่งซื้อ'}>
      {order.status === 'delivered' ? <Confetti /> : null}
      <CardboardBox>
      {ended ? (
        <>
          <Notice tone="warn" title={ended[0]}>{ended[1]}</Notice>
          <Button block onClick={again}>เริ่มสั่งซื้อใหม่</Button>
        </>
      ) : (
        <div className="track-layout">
          <div className="stack track-main">
            <Stages stage={stage} />
            {['shipping', 'delivery_issue'].includes(order.status) ? <CourierCard order={order} trip={trip} /> : null}

            {order.status === 'pharmacy_checking' ? (
              <Notice tone="info" title="ร้านกำลังตรวจสต็อก">
                ยังไม่มีการเก็บเงิน เมื่อร้านยืนยันสต็อก{needsPharmacist ? ' และเภสัชกรอนุมัติ' : ''}แล้ว ระบบจะให้คุณชำระเงินที่หน้านี้
              </Notice>
            ) : null}
            {['awaiting_pharmacist', 'need_more_info'].includes(order.status) ? (
              <Notice tone="warn" title={order.status === 'need_more_info' ? 'เภสัชกรขอข้อมูลเพิ่ม' : 'รอเภสัชกรประเมิน'}>
                ยาในคำสั่งซื้อนี้ต้องผ่านเภสัชกรก่อนชำระเงิน <a href={`#/orders/${order.id}`}>เปิดรายละเอียดเพื่อตอบเภสัชกร</a>
              </Notice>
            ) : null}
            {['awaiting_payment', 'payment_failed'].includes(order.status) ? <Payment order={order} flow={flow} /> : null}
            {['paid', 'preparing'].includes(order.status) ? (
              <Notice tone="good" title={<><span className="pp-ok" aria-hidden><Icon name="check" size={22} stroke={3} /></span>{order.status === 'paid' ? 'ชำระเงินแล้ว รอร้านจัดยา' : 'ร้านกำลังจัดยา'}</>}>
                {PAYMENT_METHODS.find(([id]) => id === order.paymentMethod)?.[1] ? `ช่องทาง ${PAYMENT_METHODS.find(([id]) => id === order.paymentMethod)[1]} · ` : ''}รหัสชำระเงิน (จำลอง) <span className="num">{order.paymentRef}</span>
              </Notice>
            ) : null}
            {order.status === 'delivery_issue' ? <Notice tone="warn" title="การจัดส่งมีปัญหา">ร้านจะติดต่อคุณ หรือโทรหาร้านได้</Notice> : null}
            {order.status === 'delivered' ? (
              <Notice tone="good" title="จัดส่งสำเร็จ">ขอบคุณที่ใช้ growa อย่าลืมอ่านฉลากและถามเภสัชกรเมื่อไม่แน่ใจ</Notice>
            ) : null}

            {canSimulate ? (
              <div className="demo-box">
                <span className="muted small"><Badge tone="neutral">เฉพาะเดโม</Badge> ร้านนี้เป็นร้านตัวอย่าง ไม่มีเภสัชกรจริงคอยตอบ</span>
                <Button size="sm" variant="secondary" busy={sim.busy} onClick={() => sim.run(() => call('demoPharmacyOrder', { orderId: order.id }))}>{demoLabel}</Button>
                <ErrorText>{sim.error}</ErrorText>
              </div>
            ) : null}

            {['shipping', 'delivered'].includes(order.status) ? null : (
              <Card className="stack" style={{ gap: 4 }}>
                <span className="muted small">ร้านที่จัดยาให้</span>
                <strong>{pharmacy?.name}</strong>
                <span className="muted small">{pharmacy?.address}</span>
                {pharmacy?.sample ? <div><MockBadge /></div> : null}
              </Card>
            )}
          </div>

          <aside className="stack track-side">
            {['shipping', 'delivery_issue'].includes(order.status) ? <TrackingMap order={order} pharmacy={pharmacy} trip={trip} /> : null}
            {order.status === 'shipping' ? (
              <>
                <Button size="lg" block busy={recv.busy} onClick={() => recv.run(() => call('confirmReceived', { orderId: order.id }))}>
                  <Icon name="check" />ฉันได้รับยาแล้ว
                </Button>
                <ErrorText>{recv.error}</ErrorText>
              </>
            ) : null}
            {order.status === 'delivered' ? (
              <>
                <a className="btn btn-secondary btn-block" href={`#/orders/${order.id}`}>รีวิวร้านนี้</a>
                <Button size="lg" block onClick={again}>สั่งซื้อใหม่</Button>
              </>
            ) : null}
            {CANCELLABLE.includes(order.status) ? (
              <>
                <ConfirmButton variant="secondary" busy={cancel.busy} question="ยกเลิกคำสั่งซื้อนี้?" yes="ยกเลิกคำสั่งซื้อ" no="ไม่ยกเลิก" onConfirm={() => cancel.run(() => call('cancelOrder', { orderId: order.id, reason: 'ผู้ใช้ยกเลิก' }))}>ยกเลิกคำสั่งซื้อ</ConfirmButton>
                <ErrorText>{cancel.error}</ErrorText>
              </>
            ) : null}
            <a className="btn btn-ghost btn-sm" href="#/orders">ดูคำสั่งซื้อทั้งหมด</a>
          </aside>

          <div className="track-items">
              <Card className="stack" style={{ gap: 6 }}>
                <h2>รายการ</h2>
                {order.items.map((l) => (
                  <div key={l.productId} className="between"><span>{l.name} × {l.qty}</span><span className="num">{baht(l.unitPrice * l.qty)}</span></div>
                ))}
                <div className="between"><span className="muted">ค่าจัดส่ง</span><span className="num">{baht(order.deliveryFee)}</span></div>
                <div className="between"><strong>รวม</strong><strong className="num">{baht(order.total)}</strong></div>
                <span className="muted small">ราคาเป็นข้อมูลจำลอง</span>
              </Card>
            </div>
        </div>
      )}
      </CardboardBox>
    </FlowPage>
    </TablePage>
  );
}
