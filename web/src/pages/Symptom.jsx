import { useState } from 'react';
import { collection, doc, query, where } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { useAction, useDocData, useQueryData } from '../lib/hooks.js';
import { useSession, can } from '../lib/session.js';
import { ROUTE_INFO } from '../lib/format.js';
import { Badge, Button, Card, ErrorText, Field, Notice, PageHeader } from '../components/ui.jsx';

function Emergency({ result }) {
  const mental = result.outcomeId === 'mental_health';
  return (
    <div className="emergency" role="alert">
      <h2>{result.title}</h2>
      {result.advice.map((a) => <p key={a}>{a}</p>)}
      <a className="call" href="tel:1669">โทร 1669 (เจ็บป่วยฉุกเฉิน)</a>
      {mental ? <a className="call" href="tel:1323">โทร 1323 (สายด่วนสุขภาพจิต)</a> : null}
    </div>
  );
}

function Question({ q, busy, onAnswer, onBack }) {
  const [picked, setPicked] = useState([]);
  const toggle = (i, exclusive) => setPicked((p) => (
    exclusive ? [i] : p.includes(i) ? p.filter((x) => x !== i) : [...p.filter((x) => !q.options[x].exclusive), i]
  ));
  return (
    <Card className="stack">
      <span className="muted small">คำถามที่ {q.step}</span>
      <h2>{q.text}</h2>
      {q.help ? <p className="muted">{q.help}</p> : null}
      <div className="option-list" role={q.type === 'multi' ? 'group' : 'radiogroup'}>
        {q.options.map((o) => (
          <button
            key={o.index}
            className={`option${picked.includes(o.index) ? ' selected' : ''}`}
            disabled={busy}
            onClick={() => (q.type === 'multi' ? toggle(o.index, o.exclusive) : onAnswer(o.index))}
            aria-pressed={q.type === 'multi' ? picked.includes(o.index) : undefined}
          >
            {q.type === 'multi' ? <span className="option-box" aria-hidden>{picked.includes(o.index) ? '✓' : ''}</span> : null}
            {o.label}
          </button>
        ))}
      </div>
      <div className="row">
        {q.type === 'multi' ? <Button busy={busy} disabled={!picked.length} onClick={() => onAnswer(picked)}>ถัดไป</Button> : null}
        {q.step > 1 ? <Button variant="secondary" busy={busy} onClick={onBack}>← ย้อนกลับ</Button> : null}
      </div>
    </Card>
  );
}

function ShareWithPharmacist({ sessionId, patientId }) {
  const [partners] = useQueryData(query(collection(db, 'pharmacies'), where('verificationStatus', '==', 'approved')), []);
  const [session] = useDocData(doc(db, 'triageSessions', sessionId), [sessionId]);
  const [review] = useDocData(session?.reviewId ? doc(db, 'pharmacistReviews', session.reviewId) : null, [session?.reviewId]);
  const [pharmacyId, setPharmacyId] = useState('');
  const [consent, setConsent] = useState(false);
  const { busy, error, run } = useAction();

  if (session?.reviewId) {
    const decision = review?.decision ?? 'pending';
    if (decision === 'approved') {
      sessionStorage.setItem('approvedReview', JSON.stringify({ reviewId: session.reviewId, pharmacyId: review.pharmacyId, patientId }));
    }
    return (
      <Card className="stack">
        <h3>ส่งต่อเภสัชกรแล้ว</h3>
        {decision === 'pending' ? <p className="muted"><span className="spinner" aria-hidden /> รอเภสัชกรตรวจสอบ (หน้านี้อัปเดตเอง)</p> : null}
        {review?.notes ? <Notice tone={decision === 'approved' ? 'good' : 'warn'} title="ความเห็นเภสัชกร">{review.notes}</Notice> : null}
        {decision === 'approved' ? (
          <a className="btn btn-primary" href={`#/store/${review.pharmacyId}`}>ไปสั่งยาที่เภสัชกรอนุมัติ (ภายใน 24 ชม.)</a>
        ) : null}
        {decision === 'refer_doctor' ? <Notice tone="warn">เภสัชกรแนะนำให้พบแพทย์</Notice> : null}
        {decision === 'emergency' ? <Notice tone="bad">เภสัชกรแนะนำให้ไปโรงพยาบาลทันที โทร 1669</Notice> : null}
      </Card>
    );
  }

  return (
    <Card className="stack">
      <h3>ปรึกษาเภสัชกร</h3>
      <Field label="เลือกร้าน">
        <select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}>
          <option value="">— เลือกร้านพาร์ทเนอร์ —</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        ยินยอมส่งคำตอบ อายุ ประวัติแพ้ยา และยาที่ใช้อยู่ ให้เภสัชกรของร้านนี้
      </label>
      <Button busy={busy} disabled={!pharmacyId || !consent} onClick={() => run(() => call('triageShareWithPharmacy', { sessionId, pharmacyId, consent: true }))}>
        ส่งให้เภสัชกร
      </Button>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function Result({ result, sessionId, patientId, onRestart }) {
  const [label, tone] = ROUTE_INFO[result.route];
  if (result.route === 'emergency') {
    return <div className="stack"><Emergency result={result} /><Button variant="secondary" onClick={onRestart}>เริ่มใหม่</Button></div>;
  }
  return (
    <div className="stack">
      <Card className="stack">
        <Badge tone={tone}>{label}</Badge>
        <h2>{result.title}</h2>
        <ul>{result.advice.map((a) => <li key={a}>{a}</li>)}</ul>
        {result.notes.map((n) => <Notice key={n} tone="info">{n}</Notice>)}
        {result.warn.length ? (
          <Notice tone="warn" title="ไปพบแพทย์ทันทีถ้ามีอาการเหล่านี้">{result.warn.map((w) => <p key={w}>{w}</p>)}</Notice>
        ) : null}
        <p className="muted small">{result.disclaimer}</p>
      </Card>
      <ShareWithPharmacist sessionId={sessionId} patientId={patientId} />
      <Button variant="secondary" onClick={onRestart}>ประเมินใหม่</Button>
    </div>
  );
}

export default function Symptom() {
  const { patients } = useSession();
  const allowed = patients.filter((p) => can(p, 'viewHealth'));
  const [patientId, setPatientId] = useState(allowed[0]?.id ?? '');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState(null); // { sessionId, done, question, result }
  const { busy, error, run } = useAction();

  const start = () => run(async () => setState(await call('guidedTriageStart', { patientId, consent: true })));
  const answer = (choices) => run(async () => {
    const res = await call('guidedTriageAnswer', { sessionId: state.sessionId, nodeId: state.question.nodeId, choices });
    setState({ sessionId: state.sessionId, ...res });
  });
  const back = () => run(async () => setState({ sessionId: state.sessionId, ...(await call('guidedTriageBack', { sessionId: state.sessionId })) }));

  return (
    <div className="stack-lg">
      <PageHeader eyebrow="ตอบทีละข้อ ไม่ต้องรีบนะ" title="เช็กอาการ" mascot />

      {!state ? (
        <Card className="stack">
          <Notice tone="warn" title="ก่อนเริ่ม">
            เครื่องมือนี้ไม่ใช่การวินิจฉัยโรค และไม่สามารถอนุมัติจ่ายยาได้ หากมีอาการฉุกเฉิน <a href="tel:1669">โทร 1669</a> ทันที
          </Notice>
          {allowed.length > 1 ? (
            <Field label="ประเมินให้ใคร">
              <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                {allowed.map((p) => <option key={p.id} value={p.id}>{p.isSelf && !p.viaCaregiver ? 'ตัวเอง' : p.displayName}</option>)}
              </select>
            </Field>
          ) : null}
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            ยินยอมให้บันทึกคำตอบเพื่อใช้ประเมินอาการ
          </label>
          <Button busy={busy} disabled={!consent || !patientId} onClick={start}>เริ่มประเมิน</Button>
        </Card>
      ) : state.done ? (
        <Result result={state.result} sessionId={state.sessionId} patientId={patientId} onRestart={() => { setState(null); setConsent(false); }} />
      ) : (
        <Question key={state.question.nodeId + state.question.step} q={state.question} busy={busy} onAnswer={answer} onBack={back} />
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
