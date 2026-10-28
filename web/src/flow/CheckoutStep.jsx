import { doc } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { go, useAction, useDocData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { baht, DRUG_CLASS } from '../lib/format.js';
import ProductArt from '../components/ProductArt.jsx';
import { Badge, Button, Card, ErrorText, MockBadge, Notice } from '../components/ui.jsx';
import FlowPage, { Redirect } from './FlowPage.jsx';
import { CardboardBox, TablePage } from './Table.jsx';
import { STEPS_GOODS, useFlow } from './state.jsx';

function ReceiptBarcode() {
  const pattern = [3,1,2,1,1,3,1,1,2,1,3,2,1,1,3,1,2,1,1,2,3,1,1,2,1,3,1,2,1,1,2,3,1,1,2,1,2,1,3,1,1,2,1,3];
  const rects = [];
  let x = 0;
  for (let i = 0; i < pattern.length; i++) {
    const w = pattern[i] * 3;
    if (i % 2 === 0) rects.push(<rect key={i} x={x} y={0} width={w} height={50} fill="#1a1a1a" />);
    x += w;
  }
  return (
    <svg viewBox={`0 0 ${x} 50`} preserveAspectRatio="none" style={{ width: '100%', height: 44, display: 'block' }} aria-hidden="true">
      {rects}
    </svg>
  );
}

export const PAYMENT_METHODS = [
  ['promptpay', 'พร้อมเพย์ (QR)', 'สแกนจ่ายผ่านแอปธนาคาร'],
  ['card', 'บัตรเครดิต/เดบิต', 'Visa / Mastercard'],
  ['banking', 'โอนผ่านแอปธนาคาร', 'โอนแล้วแนบสลิป'],
];

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export default function CheckoutStep() {
  const { profile, patients } = useSession();
  const flow = useFlow();
  const { pharmacy, cart, triage, consult, kind } = flow;
  const [shop] = useDocData(pharmacy ? doc(db, 'pharmacies', pharmacy.id) : null, [pharmacy?.id]);
  const { busy, error, run } = useAction();

  if (!pharmacy) return <Redirect to="pharmacies" />;
  if (!cart.length) return <Redirect to="choose" />;

  const self = patients.find((p) => p.isSelf && p.isOwner);
  const address = profile?.addresses?.[0];
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const km = address?.geo && pharmacy.geo ? distanceKm(address.geo, pharmacy.geo) : null;
  const zone = km !== null ? shop?.deliveryZones?.find((z) => km <= z.radiusKm) : null;
  const needsReview = cart.some((l) => l.requiresPharmacistReview);
  const setQty = (id, qty) => flow.update((p) => ({ cart: qty <= 0 ? p.cart.filter((l) => l.productId !== id) : p.cart.map((l) => (l.productId === id ? { ...l, qty: Math.min(10, qty) } : l)) }));
  const goods = kind === 'goods';
  const backTo = kind === 'goods' ? 'shop' : consult?.reviewId ? 'consult' : 'result';

  const place = () => run(async () => {
    const res = await call('createOrder', {
      patientId: triage?.patientId ?? self.id,
      pharmacyId: pharmacy.id,
      items: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
      ...(consult?.reviewId ? { reviewId: consult.reviewId } : {}),
      ...(triage?.sessionId && kind === 'drug' ? { triageId: triage.sessionId } : {}),
    });
    flow.update({ cart: [], consult: null });
    go(`track/${res.orderId}`);
  });

  return (
    <TablePage>
    <FlowPage
      step={goods ? 4 : 5}
      steps={goods ? STEPS_GOODS : undefined}
      title="ตรวจรายการสั่งซื้อ"
      wide
      onBack={() => go(backTo)}
      footer={<Button size="lg" block busy={busy} disabled={!self && !triage} onClick={place}>ยืนยันสั่งซื้อ · {baht(subtotal + (zone?.fee ?? 0))}</Button>}
    >
      <CardboardBox>
      <div className="split split-even">
      <div className="stack">
      <Card className="stack" style={{ gap: 4 }}>
        <span className="muted small">ร้านที่จะจัดยาให้</span>
        <strong>{pharmacy.name}</strong>
        <span className="muted small">{pharmacy.address}</span>
        {pharmacy.sample ? <div><MockBadge /></div> : null}
      </Card>

      <section className="stack" aria-label="รายการสินค้า">
        <h2>รายการ</h2>
        <div className="receipt">
          {/* Header */}
          <div className="receipt-head">
            <div className="receipt-title">รายการสั่งซื้อ</div>
            <div className="receipt-store">{pharmacy.name}</div>
            {pharmacy.address ? <div className="receipt-store muted">{pharmacy.address}</div> : null}
            {pharmacy.sample ? <div style={{ marginTop: 4 }}><MockBadge /></div> : null}
          </div>
          <div className="receipt-dash" />
          {/* Column labels */}
          <div className="receipt-col-labels">
            <span style={{ flex: 1 }}>รายการ</span>
            <span style={{ width: 72, textAlign: 'center' }}>จำนวน</span>
            <span style={{ width: 64, textAlign: 'right' }}>ราคา</span>
          </div>
          <div className="receipt-dash" />
          {/* Items */}
          {cart.map((l) => (
            <div key={l.productId} className="receipt-line-item">
              <span className="mini-art"><ProductArt catalogId={l.catalogId || l.productId} label={l.name} /></span>
              <div className="receipt-line-info">
                <strong>{l.name}</strong>
                <span className="muted small">{l.packSize}</span>
                <Badge tone={l.requiresPharmacistReview ? 'warn' : 'neutral'}>{DRUG_CLASS[l.drugClass] ?? DRUG_CLASS.unknown}</Badge>
              </div>
              <div className="qty" role="group" aria-label={`จำนวน ${l.name}`}>
                <button type="button" onClick={() => setQty(l.productId, l.qty - 1)} aria-label={l.qty === 1 ? `เอา ${l.name} ออกจากตะกร้า` : `ลด ${l.name}`}>−</button>
                <span aria-live="polite">{l.qty}</span>
                <button type="button" onClick={() => setQty(l.productId, l.qty + 1)} aria-label={`เพิ่ม ${l.name}`} disabled={Boolean(consult?.reviewId)}>+</button>
              </div>
              <span className="receipt-item-price num">{baht(l.price * l.qty)}</span>
            </div>
          ))}
          <div className="receipt-dash" />
          {/* Summary rows */}
          <div className="receipt-summary-row"><span>ค่าสินค้า</span><span className="num">{baht(subtotal)}</span></div>
          <div className="receipt-summary-row">
            <span>ค่าจัดส่ง (ประมาณ)</span>
            <span className="num">{zone ? baht(zone.fee) : km !== null && shop ? 'นอกพื้นที่' : '—'}</span>
          </div>
          <div className="receipt-dash" />
          {/* Totals */}
          <div className="receipt-total-row">
            <span>จำนวนรายการ</span>
            <span>{cart.reduce((s, l) => s + l.qty, 0)} ชิ้น</span>
          </div>
          <div className="receipt-total-row receipt-grand">
            <span>รวมทั้งหมด</span>
            <span className="num">{baht(subtotal + (zone?.fee ?? 0))}</span>
          </div>
          <div className="receipt-dash" />
          {/* Disclaimer */}
          <div className="receipt-notice">
            ยอดจริงคำนวณจากระบบเมื่อส่งคำสั่งซื้อ<br />ราคาและค่าจัดส่งเป็นข้อมูลจำลอง
          </div>
          {/* Barcode */}
          <div className="receipt-barcode-wrap" aria-hidden="true">
            <ReceiptBarcode />
          </div>
          <div className="receipt-footer-text">ขอบคุณที่ใช้ growa</div>
        </div>
        {km !== null && shop && !zone ? <Notice tone="warn">ที่อยู่ของคุณอยู่นอกพื้นที่จัดส่งของร้านนี้ ระบบอาจปฏิเสธคำสั่งซื้อ</Notice> : null}
      </section>

      </div>

      <div className="stack">
      <section className="stack" aria-label="ที่อยู่จัดส่ง">
        <h2>ส่งที่</h2>
        <Card>
          <strong>{address?.label ?? 'ที่อยู่หลัก'}</strong>
          <p className="muted small">{address?.line1 ?? 'ยังไม่มีที่อยู่'}</p>
          <a className="small" href="#/profile">เปลี่ยนที่อยู่หรือปักหมุดใหม่ (ที่อยู่ในโปรไฟล์)</a>
        </Card>
      </section>

      <section className="stack" aria-label="ช่องทางชำระเงิน">
        <div className="between"><h2>ช่องทางชำระเงิน</h2><MockBadge label="จำลอง" /></div>
        <div className="option-list" role="group" aria-label="เลือกช่องทางชำระเงิน">
          {PAYMENT_METHODS.map(([id, label, hint]) => (
            <button key={id} type="button" className={`option${flow.payment === id ? ' selected' : ''}`} aria-pressed={flow.payment === id} onClick={() => flow.update({ payment: id })}>
              <span className="option-box" aria-hidden>{flow.payment === id ? '✓' : ''}</span>
              <span className="store-option-main"><strong>{label}</strong><span className="muted small">{hint}</span></span>
            </button>
          ))}
        </div>
        <Notice tone="info" title="ยังไม่เก็บเงินตอนนี้">
          หลังกดยืนยัน ร้านจะตรวจสต็อก{needsReview && !consult?.reviewId ? ' และเภสัชกรจะประเมินยาที่ต้องผ่านเภสัชกร' : ''}
          {' '}เมื่อพร้อมแล้วระบบจะให้คุณชำระด้วยช่องทางที่เลือก
        </Notice>
      </section>
      <ErrorText>{error}</ErrorText>
      </div>
      </div>
      </CardboardBox>
    </FlowPage>
    </TablePage>
  );
}
