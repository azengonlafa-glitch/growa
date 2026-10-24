import { useEffect, useRef, useState } from 'react';
import { call } from '../firebase.js';
import { go, useAction } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { Button, ErrorText, Icon, Notice } from '../components/ui.jsx';
import FlowPage, { Redirect } from './FlowPage.jsx';
import { useFlow } from './state.jsx';
import ChatTriage from './ChatTriage.jsx';

function Question({ q, busy, onAnswer, picked, setPicked }) {
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);
  const toggle = (i, exclusive) => setPicked((p) => (
    exclusive ? [i] : p.includes(i) ? p.filter((x) => x !== i) : [...p.filter((x) => !q.options[x].exclusive), i]
  ));
  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <span className="muted small">คำถามที่ {q.step}</span>
        <h2 ref={headingRef} tabIndex={-1} style={{ outline: 'none', scrollMarginTop: 72 }}>{q.text}</h2>
        {q.help ? <p className="muted">{q.help}</p> : null}
      </div>
      <div className="option-list" role="group" aria-label={q.type === 'multi' ? 'เลือกได้หลายข้อ' : 'เลือก 1 ข้อ'}>
        {q.options.map((o) => (
          <button
            key={o.index}
            type="button"
            className={`option${picked.includes(o.index) ? ' selected' : ''}`}
            disabled={busy}
            aria-pressed={q.type === 'multi' ? picked.includes(o.index) : undefined}
            onClick={() => (q.type === 'multi' ? toggle(o.index, o.exclusive) : onAnswer(o.index))}
          >
            {q.type === 'multi' ? <span className="option-box" aria-hidden>{picked.includes(o.index) ? '✓' : ''}</span> : null}
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}

function GuidedTriage() {
  const { patients } = useSession();
  const flow = useFlow();
  const self = patients.find((p) => p.isSelf && p.isOwner);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState(null); // { sessionId, done, question, result }
  const [picked, setPicked] = useState([]);
  const { busy, error, run } = useAction();

  if (!flow.pharmacy) return <Redirect to="" />;
  if (flow.kind === 'goods') return <Redirect to="shop" />;

  const start = () => run(async () => {
    setState(await call('guidedTriageStart', { patientId: self.id, consent: true }));
    setPicked([]);
  });
  const finish = (res) => {
    flow.update({ triage: { sessionId: res.sessionId, patientId: self.id, result: res.result }, consult: null, cart: [] });
    go('result');
  };
  const answer = (choices) => run(async () => {
    const res = await call('guidedTriageAnswer', { sessionId: state.sessionId, nodeId: state.question.nodeId, choices });
    const next = { sessionId: state.sessionId, ...res };
    setPicked([]);
    if (res.done) finish(next); else setState(next);
  });
  const back = () => {
    if (!state || state.question.step <= 1) return go('choose');
    run(async () => {
      setState({ sessionId: state.sessionId, ...(await call('guidedTriageBack', { sessionId: state.sessionId })) });
      setPicked([]);
    });
  };

  const q = state && !state.done ? state.question : null;
  return (
    <FlowPage
      step={3}
      title="ตอบคำถามอาการ"
      onBack={state ? back : () => go('choose')}
      footer={!state ? (
        <Button size="lg" block busy={busy} disabled={!consent || !self} onClick={start}>เริ่มตอบคำถาม</Button>
      ) : q?.type === 'multi' ? (
        <Button size="lg" block busy={busy} disabled={!picked.length} onClick={() => answer(picked)}>ถัดไป</Button>
      ) : null}
    >
      {!state ? (
        <>
          <Notice tone="warn" title="ก่อนเริ่ม">
            ใช้ประเมินเบื้องต้นเท่านั้น ไม่ใช่การวินิจฉัยโรค และไม่ใช่การอนุมัติจ่ายยา หากมีอาการฉุกเฉิน <a href="tel:1669">โทร 1669</a> ทันที
          </Notice>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            ยินยอมให้บันทึกคำตอบเพื่อใช้ประเมินอาการ
          </label>
          {!consent ? <p className="hint">ติ๊กยินยอมก่อน จึงจะเริ่มตอบคำถามได้</p> : null}
          {!self ? <ErrorText>ไม่พบโปรไฟล์ของคุณ กรุณาออกจากระบบแล้วเข้าใหม่</ErrorText> : null}
        </>
      ) : q ? (
        <Question key={q.nodeId + q.step} q={q} busy={busy} onAnswer={answer} picked={picked} setPicked={setPicked} />
      ) : null}
      <ErrorText>{error}</ErrorText>
      {state && busy ? <p className="hint"><Icon name="clock" size={16} /> กำลังโหลดคำถามถัดไป…</p> : null}
    </FlowPage>
  );
}

// AI chat is the default; the guided questions remain as the no-AI fallback.
export default function TriageStep() {
  const [mode, setMode] = useState('chat');
  return mode === 'chat' ? <ChatTriage onFallback={() => setMode('guided')} /> : <GuidedTriage />;
}
