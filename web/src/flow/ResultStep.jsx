import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { go, useQueryData } from '../lib/hooks.js';
import { useMeds, daysLeft } from '../lib/meds.js';
import { baht, DRUG_CLASS, timeAgo } from '../lib/format.js';
import ProductArt from '../components/ProductArt.jsx';
import { Badge, Button, Card, Icon, Loading, MockBadge, Notice } from '../components/ui.jsx';
import FlowPage, { Redirect } from './FlowPage.jsx';
import { Clipboard, DeskPage } from './Desk.jsx';
import { useFlow } from './state.jsx';

// The three outcomes the customer sees: 1 household medicines, 2 talk to the pharmacist, 3 see a doctor.
export const outcomeOf = (route) => (route === 'self_care' ? 1 : route === 'pharmacist' ? 2 : 3);

export function useFocus() {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return ref;
}

// Stock is an estimate, so always say when it was updated and where it came from (not real-time).
export function StockLine({ product, compact = false }) {
  const manual = product.stockSource === 'manual';
  return (
    <span className="muted small">
      {compact
        ? `สต็อกประมาณ · อัปเดต ${timeAgo(product.stockUpdatedAt)}${manual ? ' · ร้านกรอกเอง' : ''}`
        : `ประมาณการสต็อก อัปเดต ${timeAgo(product.stockUpdatedAt)}${manual ? ' · ร้านกรอกเอง ไม่ใช่เรียลไทม์' : ''}`}
    </span>
  );
}

// Turns a product doc into the line kept in the cart (the server re-reads price and class from the database).
export const toLine = (p, qty) => ({
  productId: p.id, catalogId: p.catalogId, name: p.name, packSize: p.packSize ?? null, price: p.price, qty,
  requiresPharmacistReview: p.requiresPharmacistReview === true, drugClass: p.drugClass ?? 'unknown',
});

function SuggestedDrugs({ result, pharmacyId, patientId, cart, onOrder }) {
  const [homeMeds] = useMeds(patientId);
  const [products, loading] = useQueryData(
    query(collection(db, 'pharmacies', pharmacyId, 'products'), where('active', '==', true)), [pharmacyId],
  );
  const wanted = result.suggestedCatalogIds ?? [];
  const items = useMemo(
    () => products.filter((p) => wanted.includes(p.catalogId) && p.deliverable !== false && p.stockStatus !== 'out_of_stock'),
    [products, wanted],
  );
  const inCart = (p) => cart.find((l) => l.productId === p.id);
  const atHome = (p) => homeMeds.find((m) => m.catalogId && m.catalogId === p.catalogId);
  const [qty, setQty] = useState(() => Object.fromEntries(cart.map((l) => [l.productId, l.qty])));
  const lines = items.filter((p) => qty[p.id]).map((p) => toLine(p, qty[p.id]));
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

  if (loading) return <Loading />;
  return (
    <>
      <div className="between"><h2>ยาที่ร้านนี้มีและเข้ากับอาการ</h2><MockBadge /></div>
      {items.length ? (
        <Card>
          <div className="list">
            {items.map((p) => (
              <div key={p.id} className="list-item">
                <span className="mini-art"><ProductArt catalogId={p.catalogId || p.id} label={p.name} /></span>
                <div className="list-item-main stack" style={{ gap: 2 }}>
                  <strong>{p.name}</strong>
                  <span className="muted small">{p.packSize} · {baht(p.price)}</span>
                  <Badge tone="neutral">{DRUG_CLASS[p.drugClass] ?? DRUG_CLASS.unknown}</Badge>
                  <StockLine product={p} />
                  {inCart(p) ? <Badge tone="warn">มีในตะกร้า {inCart(p).qty} ชิ้นแล้ว</Badge> : null}
                  {atHome(p) ? <Badge tone="warn">มียานี้ใน Home Care แล้ว เหลือประมาณ {atHome(p).estimatedRemaining ?? atHome(p).stockOnHand} {atHome(p).unit ?? 'หน่วย'}{daysLeft(atHome(p)) !== null ? ` (ราว ${daysLeft(atHome(p))} วัน)` : ''}</Badge> : null}
                </div>
                {qty[p.id] ? (
                  <div className="qty" role="group" aria-label={`จำนวน ${p.name}`}>
                    <button type="button" onClick={() => setQty({ ...qty, [p.id]: Math.max(0, qty[p.id] - 1) })} aria-label={`ลด ${p.name}`}>−</button>
                    <span aria-live="polite">{qty[p.id]}</span>
                    <button type="button" onClick={() => setQty({ ...qty, [p.id]: Math.min(10, qty[p.id] + 1) })} aria-label={`เพิ่ม ${p.name}`}>+</button>
                  </div>
                ) : <Button size="sm" variant="secondary" onClick={() => setQty({ ...qty, [p.id]: 1 })} aria-label={`เลือก ${p.name}`}>เลือก</Button>}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Notice tone="info" title="ร้านนี้ยังไม่มียาที่ตรงกับอาการในรายการ">
          ปรึกษาเภสัชกรของร้านเพื่อให้ช่วยเลือกสินค้าที่เหมาะสมได้
        </Notice>
      )}
      <p className="muted small">
        เป็นตัวอย่างสินค้าที่เข้ากับอาการ ไม่ใช่ใบสั่งยา ไม่ได้ระบุขนาดยา ให้อ่านฉลากและถามเภสัชกรเมื่อไม่แน่ใจ
        สินค้าและราคาเป็นข้อมูลจำลอง
      </p>
      {items.length ? (
        <Button size="lg" block disabled={!lines.length} onClick={() => onOrder(lines)}>
          {lines.length ? `สั่งยา · ${baht(total)}` : 'เลือกยาก่อนสั่ง'}
        </Button>
      ) : null}
    </>
  );
}

// Direct line to the shop's pharmacist, shown whenever the result sends the customer to them or to a doctor.
function CallPharmacist({ pharmacy }) {
  if (!pharmacy.phone) return null;
  return (
    <a className="btn btn-secondary btn-block" href={`tel:${pharmacy.phone.replace(/[^d+]/g, '')}`}>
      <Icon name="phone" size={20} />โทรหาเภสัชกรโดยตรง · {pharmacy.phone}
    </a>
  );
}

function Emergency({ result, headingRef }) {
  const mental = result.outcomeId === 'mental_health';
  return (
    <div className="emergency" role="alert">
      <h2 ref={headingRef} tabIndex={-1} style={{ outline: 'none' }}>{result.title}</h2>
      {result.advice.map((a) => <p key={a}>{a}</p>)}
      <a className="call" href="tel:1669">โทร 1669 (เจ็บป่วยฉุกเฉิน)</a>
      {mental ? <a className="call" href="tel:1323">โทร 1323 (สายด่วนสุขภาพจิต)</a> : null}
    </div>
  );
}

export default function ResultStep() {
  const flow = useFlow();
  const headingRef = useFocus();
  const { pharmacy, triage } = flow;
  if (!triage?.result) return <Redirect to="choose" />;

  const { result } = triage;
  const outcome = outcomeOf(result.route);
  const emergency = result.route === 'emergency';
  const order = (lines) => { flow.update({ cart: lines }); go('checkout'); };
  const again = () => { flow.restart(); go('choose'); };

  const onDesk = (page) => (emergency ? page : <DeskPage>{page}</DeskPage>);
  const stamp = outcome === 1 ? 'ดูแลตัวเองได้' : outcome === 2 ? 'ปรึกษาเภสัชกร' : 'ควรพบแพทย์';
  const today = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'Asia/Bangkok' }).format(new Date());
  return onDesk(
    <FlowPage
      step={3}
      title={emergency ? 'ต้องการความช่วยเหลือทันที' : 'ผลการประเมิน'}
      onBack={again}
      footer={outcome === 2 ? (
        <Button size="lg" block onClick={() => go(pharmacy ? 'consult' : 'pharmacies')}><Icon name="people" />{pharmacy ? 'คุยกับเภสัชกรของร้าน' : 'เลือกสาขาเพื่อคุยกับเภสัชกร'}</Button>
      ) : null}
    >
      {emergency ? <Emergency result={result} headingRef={headingRef} /> : (
        <Clipboard className="cb-report">
          <header className="rp-head">
            <div>
              <span className="rp-kicker">รายงานผลประเมินเบื้องต้น</span>
              <span>{pharmacy?.name ?? 'สาขาที่คุณเลือก'}</span>
              <span>วันที่ {today}</span>
            </div>
            <span className={`rp-stamp rp-stamp-${outcome}`} aria-hidden>{stamp}</span>
          </header>
          <div className="result-head">
            <Badge tone={outcome === 1 ? 'good' : outcome === 2 ? 'info' : 'warn'}>
              {outcome === 1 ? 'ยาทั่วไป · ดูแลตัวเองเบื้องต้นได้' : outcome === 2 ? 'ต้องให้เภสัชกรช่วยเลือกยา' : result.route === 'urgent' ? 'ควรพบแพทย์ภายในวันนี้' : 'ควรพบแพทย์'}
            </Badge>
            <h2 ref={headingRef} tabIndex={-1} style={{ outline: 'none' }}>{result.title}</h2>
          </div>
          <ul className="advice">{result.advice.map((a) => <li key={a}>{a}</li>)}</ul>
          {result.notes.map((n) => <Notice key={n} tone="info">{n}</Notice>)}
          {result.healthNotes?.length ? (
            <Notice tone="warn" title="เชื่อมกับข้อมูลสุขภาพที่คุณกรอกไว้">
              <ul className="advice">{result.healthNotes.map((n) => <li key={n}>{n}</li>)}</ul>
              {result.healthBasis?.length ? (
                <p className="small">ดูจากข้อมูลที่บันทึกไว้: {result.healthBasis.join(', ')} · <a href="#/profile">แก้ไขข้อมูล</a></p>
              ) : null}
              <p className="small">เป็นข้อสังเกตเบื้องต้น ไม่ใช่การวินิจฉัย เภสัชกรหรือแพทย์เป็นผู้ประเมิน</p>
            </Notice>
          ) : null}
          {result.healthMissing ? (
            <Notice tone="info" title="ยังไม่มีข้อมูลแพ้ยาและโรคประจำตัว">
              กรอกไว้เพื่อให้ระบบช่วยเตือนเรื่องยาและอาการที่เกี่ยวข้องได้ <a href="#/profile">กรอกข้อมูลสุขภาพ</a>
            </Notice>
          ) : null}
          {result.warn.length ? (
            <Notice tone="warn" title="ไปพบแพทย์ทันทีถ้ามีอาการเหล่านี้">{result.warn.map((w) => <p key={w}>{w}</p>)}</Notice>
          ) : null}

          {outcome === 1 && pharmacy ? <SuggestedDrugs result={result} pharmacyId={pharmacy.id} patientId={triage.patientId} cart={flow.cart ?? []} onOrder={order} /> : null}
          {outcome === 1 && !pharmacy ? (
            <Notice tone="info" title="เลือกสาขาร้านยาเพื่อดูยาและสั่ง">
              ยาที่มี ราคา และสต็อกขึ้นกับสาขา เลือกสาขาก่อนแล้วระบบจะพากลับมาหน้านี้
              <div style={{ marginTop: 10 }}><Button size="sm" onClick={() => go('pharmacies')}><Icon name="store" size={18} />เลือกสาขา</Button></div>
            </Notice>
          ) : null}
          {outcome === 2 ? (
            <Notice tone="info" title="ขั้นต่อไป">
              ผลนี้ต้องให้เภสัชกรของ{pharmacy ? ` ${pharmacy.name}` : 'สาขาที่คุณเลือก'} ช่วยเลือกยา คุณจะแชตหรือโทรคุยกับร้านได้ในหน้าถัดไป
              และสั่งยาที่เภสัชกรอนุมัติได้จากที่นั่น ระบบประเมินอาการไม่ได้อนุมัติการจ่ายยา
            </Notice>
          ) : null}
          {outcome !== 1 && pharmacy ? <CallPharmacist pharmacy={pharmacy} /> : null}
          {outcome === 3 ? (
            <Notice tone="warn" title="ยังไม่ควรสั่งยาเอง">
              อาการนี้ควรได้รับการตรวจจากแพทย์ ระหว่างนี้ปรึกษาเภสัชกรเรื่องการบรรเทาอาการเบื้องต้นได้
              {result.route === 'doctor' ? (
                <div style={{ marginTop: 10 }}><Button size="sm" variant="secondary" onClick={() => go(pharmacy ? 'consult' : 'pharmacies')}>ปรึกษาเภสัชกรระหว่างนี้</Button></div>
              ) : null}
            </Notice>
          ) : null}
          <p className="muted small">{result.disclaimer}</p>
          <p className="rp-sign">ผู้ประเมิน: ระบบประเมินเบื้องต้นของ growa <span>ไม่ใช่แพทย์ ไม่ใช่การวินิจฉัย</span></p>
          <Button variant="secondary" block onClick={again}>ประเมินใหม่</Button>
        </Clipboard>
      )}
      {emergency ? (
        <>
          <p className="muted small">{result.disclaimer}</p>
          <Button variant="secondary" block onClick={again}>ประเมินใหม่</Button>
        </>
      ) : null}
    </FlowPage>
  );
}
