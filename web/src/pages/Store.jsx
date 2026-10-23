import { useMemo, useState } from 'react';
import { collection, doc, query, where } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { go, useAction, useDocData, useQueryData } from '../lib/hooks.js';
import { useSession, can } from '../lib/session.js';
import { DRUG_CLASS, baht, timeAgo } from '../lib/format.js';
import { Badge, Button, Card, Empty, ErrorText, Field, Loading, MockBadge, Notice, PageHeader } from '../components/ui.jsx';

export default function Store({ pharmacyId }) {
  const { patients, profile } = useSession();
  const [pharmacy, loading] = useDocData(doc(db, 'pharmacies', pharmacyId), [pharmacyId]);
  const [products] = useQueryData(
    query(collection(db, 'pharmacies', pharmacyId, 'products'), where('active', '==', true)), [pharmacyId],
  );
  const [ratings] = useQueryData(
    query(collection(db, 'pharmacyRatings'), where('pharmacyId', '==', pharmacyId), where('hidden', '==', false)), [pharmacyId],
  );
  const buyFor = patients.filter((p) => can(p, 'requestRefill'));
  const [patientId, setPatientId] = useState(buyFor[0]?.id ?? '');
  const [cart, setCart] = useState({});
  const { busy, error, run } = useAction();

  // An approved pharmacist review from the symptom checker, if the user came from there.
  const approved = JSON.parse(sessionStorage.getItem('approvedReview') ?? 'null');
  const reviewId = approved?.pharmacyId === pharmacyId && approved?.patientId === patientId ? approved.reviewId : null;

  const lines = useMemo(
    () => products.filter((p) => cart[p.id]).map((p) => ({ ...p, qty: cart[p.id] })),
    [products, cart],
  );
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const needsReview = lines.some((l) => l.requiresPharmacistReview);
  const setQty = (id, q) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(10, q)) }));

  if (loading) return <Loading />;
  if (!pharmacy) return <Empty title="ไม่พบร้านนี้" />;

  const placeOrder = () => run(async () => {
    const res = await call('createOrder', {
      patientId, pharmacyId, reviewId,
      items: lines.map((l) => ({ productId: l.id, qty: l.qty })),
    });
    if (reviewId) sessionStorage.removeItem('approvedReview');
    go(`orders/${res.orderId}`);
  });

  return (
    <div className="stack-lg">
      <PageHeader title={pharmacy.name} subtitle={pharmacy.address} back="pharmacies" />
      <div className="row">
        <Badge tone="good">ร้านพาร์ทเนอร์ · ตรวจสอบแล้ว</Badge>
        {pharmacy.sample ? <MockBadge /> : null}
        {pharmacy.ratingCount ? <span>★ {pharmacy.ratingAvg} ({pharmacy.ratingCount} รีวิว)</span> : null}
        <span className="muted small">ค่าจัดส่งเริ่มต้น {baht(pharmacy.deliveryZones?.[0]?.fee)}</span>
      </div>

      {reviewId ? (
        <Notice tone="good" title="มีผลอนุมัติจากเภสัชกรแล้ว">ยาที่เภสัชกรอนุมัติจะไม่ต้องรอประเมินซ้ำ (ภายใน 24 ชั่วโมง)</Notice>
      ) : null}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="stack">
          <h2>สินค้า</h2>
          <Card>
            <div className="list">
              {products.map((p) => {
                const blocked = !p.deliverable || p.stockStatus === 'out_of_stock';
                return (
                  <div key={p.id} className="list-item">
                    <div className="list-item-main stack" style={{ gap: 2 }}>
                      <strong>{p.name}</strong>
                      <span className="muted small">{p.packSize} · {baht(p.price)}</span>
                      <div className="chip-row">
                        <Badge tone={p.requiresPharmacistReview ? 'warn' : 'neutral'}>{DRUG_CLASS[p.drugClass] ?? DRUG_CLASS.unknown}</Badge>
                        {p.stockStatus === 'out_of_stock' ? <Badge tone="bad">หมด</Badge> : null}
                      </div>
                      <span className="muted small">
                        สต็อกอัปเดต {timeAgo(p.stockUpdatedAt)}{p.stockSource === 'manual' ? ' · ร้านกรอกเอง ไม่ใช่เรียลไทม์' : ''}
                      </span>
                    </div>
                    {blocked ? <span className="muted small">สั่งไม่ได้</span> : cart[p.id] ? (
                      <div className="qty" aria-label={`จำนวน ${p.name}`}>
                        <button onClick={() => setQty(p.id, cart[p.id] - 1)} aria-label="ลด">−</button>
                        <span>{cart[p.id]}</span>
                        <button onClick={() => setQty(p.id, cart[p.id] + 1)} aria-label="เพิ่ม">+</button>
                      </div>
                    ) : <Button size="sm" variant="secondary" onClick={() => setQty(p.id, 1)}>เพิ่ม</Button>}
                  </div>
                );
              })}
            </div>
          </Card>
        </section>

        <section className="stack">
          <h2>ตะกร้า</h2>
          <Card className="stack">
            {lines.length ? (
              <>
                <div className="list">
                  {lines.map((l) => (
                    <div key={l.id} className="list-item">
                      <span>{l.name} × {l.qty}</span><span className="num">{baht(l.price * l.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="between"><span>ยอดสินค้า</span><strong className="num">{baht(subtotal)}</strong></div>
                <p className="muted small">ค่าจัดส่งและยอดรวมคำนวณจากระบบตามที่อยู่ของคุณ ({profile?.addresses?.[0]?.label ?? 'ที่อยู่หลัก'})</p>
                <Field label="สั่งให้ใคร">
                  <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                    {buyFor.map((p) => <option key={p.id} value={p.id}>{p.isSelf ? 'ตัวเอง' : p.displayName}</option>)}
                  </select>
                </Field>
                {needsReview && !reviewId ? (
                  <Notice tone="warn" title="มียาที่ต้องให้เภสัชกรประเมิน">
                    ร้านจะยืนยันสต็อกก่อน แล้วเภสัชกรจะตรวจความเหมาะสม ระบบยังไม่เก็บเงินจนกว่าจะผ่านขั้นตอนนี้
                  </Notice>
                ) : null}
                <Button busy={busy} onClick={placeOrder} disabled={!patientId}>ส่งคำขอสั่งซื้อ</Button>
                <ErrorText>{error}</ErrorText>
              </>
            ) : <p className="muted">ยังไม่มีสินค้าในตะกร้า</p>}
          </Card>

          <h2>รีวิวจากผู้ซื้อ</h2>
          <Card>
            {ratings.length ? (
              <div className="list">
                {ratings.map((r) => (
                  <div key={r.id} className="list-item">
                    <div className="list-item-main">
                      <div>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                      <p className="small">{r.comment}</p>
                    </div>
                    {r.sample ? <MockBadge label="ตัวอย่าง" /> : null}
                  </div>
                ))}
              </div>
            ) : <p className="muted">ยังไม่มีรีวิว</p>}
            <p className="muted small" style={{ marginTop: 8 }}>รีวิวได้เฉพาะผู้ที่สั่งซื้อและได้รับยาแล้ว</p>
          </Card>
        </section>
      </div>
    </div>
  );
}
