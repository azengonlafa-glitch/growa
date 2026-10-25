import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, query, where } from 'firebase/firestore';
import { call, db, isProduction } from '../firebase.js';
import { go, useAction, useDocData, useQueryData } from '../lib/hooks.js';
import { baht, DRUG_CLASS } from '../lib/format.js';
import ProductArt from '../components/ProductArt.jsx';
import { Badge, Button, Card, ErrorText, Icon, Loading, MockBadge, Notice } from '../components/ui.jsx';
import { Clipboard, DeskPage } from './Desk.jsx';
import FlowPage, { Redirect } from './FlowPage.jsx';
import { StockLine, toLine } from './ResultStep.jsx';
import { useFlow } from './state.jsx';

// The "simulate the pharmacy" button exists only for demos; the server enforces the same limits.
const DEMO_BUTTON = !isProduction || import.meta.env.VITE_DEMO_SIMULATION === 'true';

function Bubble({ who, children, mine }) {
  return (
    <div className={`bubble${mine ? ' bubble-mine' : ''}`}>
      <span className="bubble-who">{who}</span>
      <p>{children}</p>
    </div>
  );
}

function ApprovedDrugs({ review, pharmacyId, onOrder }) {
  const [products, loading] = useQueryData(
    query(collection(db, 'pharmacies', pharmacyId, 'products'), where('active', '==', true)), [pharmacyId],
  );
  const ids = review.approvedCatalogIds ?? [];
  const items = useMemo(() => products.filter((p) => ids.includes(p.catalogId)), [products, ids]);
  const [qty, setQty] = useState({});
  const lines = items.filter((p) => qty[p.id]).map((p) => toLine(p, qty[p.id]));
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  if (loading) return <Loading />;
  return (
    <>
      <div className="between"><h2>ยาที่เภสัชกรอนุมัติให้สั่ง</h2><MockBadge /></div>
      <Card>
        <div className="list">
          {items.map((p) => (
            <div key={p.id} className="list-item">
              <span className="mini-art"><ProductArt catalogId={p.catalogId || p.id} label={p.name} /></span>
              <div className="list-item-main stack" style={{ gap: 2 }}>
                <strong>{p.name}</strong>
                <span className="muted small">{p.packSize} · {baht(p.price)}</span>
                <Badge tone="warn">{DRUG_CLASS[p.drugClass] ?? DRUG_CLASS.unknown}</Badge>
                <StockLine product={p} />
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
      <p className="muted small">อนุมัติให้ใช้สั่งซื้อได้ภายใน 24 ชั่วโมง ระบบยังไม่เก็บเงินจนกว่าร้านจะยืนยันสต็อก</p>
      <Button size="lg" block disabled={!lines.length} onClick={() => onOrder(lines)}>
        {lines.length ? `สั่งยา · ${baht(total)}` : 'เลือกยาก่อนสั่ง'}
      </Button>
    </>
  );
}

export default function ConsultStep() {
  const flow = useFlow();
  const { pharmacy, triage } = flow;
  const [consent, setConsent] = useState(false);
  const [answer, setAnswer] = useState('');
  const share = useAction();
  const send = useAction();
  const demo = useAction();
  const quick = useAction();
  const endRef = useRef(null);

  const [session, sessionLoading] = useDocData(triage ? doc(db, 'triageSessions', triage.sessionId) : null, [triage?.sessionId]);
  const reviewId = session?.reviewId ?? null;
  const [review] = useDocData(reviewId ? doc(db, 'pharmacistReviews', reviewId) : null, [reviewId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [review?.thread?.length, review?.decision]);

  if (!pharmacy) return <Redirect to="" />;
  if (!triage?.result) return <Redirect to="choose" />;
  if (triage.result.route === 'emergency') return <Redirect to="result" />;

  const decision = review?.decision ?? 'pending';
  const order = (lines) => { flow.update({ cart: lines, consult: { reviewId } }); go('checkout'); };
  const callShop = pharmacy.phone ? (
    <a className="btn btn-secondary btn-sm" href={`tel:${pharmacy.phone.replace(/[^0-9+]/g, '')}`}><Icon name="phone" size={18} />โทรหาร้าน {pharmacy.phone}</a>
  ) : null;

  return (
    <DeskPage>
    <FlowPage step={4} title="คุยกับเภสัชกร" onBack={() => go('result')}>
      <Clipboard className="paper-theme">
      <div className="stack">
      <Card className="stack" style={{ gap: 4 }}>
        <strong>{pharmacy.name}</strong>
        <span className="muted small">เภสัชกรของร้านที่คุณเลือกในขั้นแรก</span>
        <div className="row">{callShop}{pharmacy.sample ? <MockBadge /> : null}</div>
      </Card>

      {sessionLoading ? <Loading /> : !reviewId ? (
        <>
          <Notice tone="info" title="สิ่งที่จะส่งให้เภสัชกร">
            คำตอบของคุณ ผลประเมิน ประวัติแพ้ยา โรคประจำตัว และยาที่ใช้อยู่ (ตามที่คุณอนุญาตไว้ในโปรไฟล์สุขภาพ)
            ผู้ดูแลแพลตฟอร์มไม่เห็นข้อมูลนี้
          </Notice>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            ยินยอมส่งข้อมูลให้เภสัชกรของร้านนี้
          </label>
          <Button size="lg" block busy={share.busy} disabled={!consent} onClick={() => share.run(() => call('triageShareWithPharmacy', { sessionId: triage.sessionId, pharmacyId: pharmacy.id, consent: true }))}>
            เริ่มคุยกับเภสัชกร
          </Button>
          {!consent ? <p className="hint">ติ๊กยินยอมก่อน จึงจะส่งข้อมูลได้</p> : null}
          <ErrorText>{share.error}</ErrorText>
        </>
      ) : (
        <>
          <div className="chat" aria-live="polite">
            <Bubble who="คุณ" mine>ส่งผลประเมินให้เภสัชกรแล้ว: {triage.result.title}</Bubble>
            {(review?.thread ?? []).map((m, i) => (
              <Bubble key={i} who={m.role === 'pharmacist' ? 'เภสัชกร' : 'คุณ'} mine={m.role !== 'pharmacist'}>{m.text}</Bubble>
            ))}
            {['approved', 'refer_doctor', 'rejected', 'emergency'].includes(decision) && review?.notes
              && !(review.thread ?? []).some((m) => m.text === review.notes) ? (
                <Bubble who="เภสัชกร">{review.notes}</Bubble>
              ) : null}
            {decision === 'pending' ? <p className="hint chat-wait"><span className="spinner" aria-hidden /> รอเภสัชกรตอบ (หน้านี้อัปเดตเอง)</p> : null}
            <div ref={endRef} />
          </div>

          {decision === 'need_more_info' ? (
            <form
              className="stack"
              onSubmit={(e) => { e.preventDefault(); send.run(() => call('answerPharmacistQuestion', { reviewId, answer }).then(() => setAnswer(''))); }}
            >
              <label className="field">
                <span className="field-label">ตอบเภสัชกร</span>
                <textarea rows={3} required value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="พิมพ์คำตอบ…" />
              </label>
              <Button type="submit" busy={send.busy}>ส่งคำตอบ</Button>
              <ErrorText>{send.error}</ErrorText>
            </form>
          ) : null}

          {decision === 'pending' && DEMO_BUTTON && pharmacy.sample ? (
            <div className="demo-box">
              <p className="small"><MockBadge label="เฉพาะเดโม" /> ร้านนี้เป็นร้านตัวอย่าง ไม่มีเภสัชกรจริง กดเพื่อจำลองว่าเภสัชกรตอบกลับ</p>
              <div className="row">
                <Button size="sm" variant="secondary" busy={demo.busy} onClick={() => demo.run(() => call('demoPharmacyReview', { reviewId }))}>จำลองร้านตอบ</Button>
                <Button size="sm" busy={quick.busy} onClick={() => quick.run(async () => {
                  // The pretend pharmacist asks one question, a canned answer is sent, then the approval comes.
                  const first = await call('demoPharmacyReview', { reviewId });
                  if (first.decision === 'need_more_info') {
                    await call('answerPharmacistQuestion', { reviewId, answer: 'ไม่มีประวัติแพ้ยา และไม่มียาประจำตัว (ข้อความจำลอง)' });
                    await call('demoPharmacyReview', { reviewId });
                  }
                })}>จำลองเภสัชกรอนุมัติเลย</Button>
              </div>
              <ErrorText>{demo.error || quick.error}</ErrorText>
            </div>
          ) : null}

          {decision === 'approved' ? <ApprovedDrugs review={review} pharmacyId={pharmacy.id} onOrder={order} /> : null}
          {decision === 'refer_doctor' ? <Notice tone="warn" title="เภสัชกรแนะนำให้พบแพทย์">ยังไม่ควรสั่งยาเอง กรุณาไปพบแพทย์</Notice> : null}
          {decision === 'emergency' ? <Notice tone="bad" title="ไปโรงพยาบาลทันที">โทร <a href="tel:1669">1669</a> หรือไปห้องฉุกเฉินที่ใกล้ที่สุด</Notice> : null}
          {decision === 'rejected' ? <Notice tone="bad" title="เภสัชกรไม่อนุมัติการจ่ายยา">ไม่มีการเก็บเงิน ปรึกษาเภสัชกรหรือแพทย์เพิ่มเติม</Notice> : null}
        </>
      )}
      </div>
      </Clipboard>
    </FlowPage>
    </DeskPage>
  );
}
