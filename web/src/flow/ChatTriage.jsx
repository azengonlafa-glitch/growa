// AI symptom chat step. The server (functions/src/triage.js) runs the red-flag check first, asks Gemini,
// and decides the final route; the AI only advises and never approves dispensing.
import { useEffect, useRef, useState } from 'react';
import { call } from '../firebase.js';
import { go, useAction } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { Button, ErrorText, Icon, Notice } from '../components/ui.jsx';
import FlowPage, { Redirect } from './FlowPage.jsx';
import { useFlow } from './state.jsx';

const ROUTE = { info: 'self_care', pharmacist: 'pharmacist', emergency: 'emergency' };
const TITLE = {
  self_care: 'ดูแลตัวเองเบื้องต้นได้',
  pharmacist: 'ควรปรึกษาเภสัชกร',
  emergency: 'อาการอาจเป็นภาวะฉุกเฉิน',
};

// Same shape the guided checker returns, so the result, consult and checkout steps work unchanged.
function toResult(route, reply) {
  const r = ROUTE[route] ?? 'pharmacist';
  return {
    route: r,
    title: TITLE[r],
    advice: reply.split('\n').map((l) => l.trim()).filter(Boolean),
    notes: [],
    warn: [],
    suggestedCatalogIds: [],
    disclaimer: 'ผลนี้เป็นข้อมูลเบื้องต้นจากแชต AI ไม่ใช่การวินิจฉัยโรค เภสัชกรเป็นผู้ตัดสินใจเรื่องยา ไม่ใช่ AI',
    source: 'ai',
  };
}

export default function ChatTriage({ onFallback }) {
  const { patients } = useSession();
  const flow = useFlow();
  const self = patients.find((p) => p.isSelf && p.isOwner);
  const [consent, setConsent] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const { busy, error, run } = useAction();
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  if (!flow.pharmacy) return <Redirect to="" />;
  if (flow.kind === 'goods') return <Redirect to="shop" />;

  const start = () => run(async () => {
    const res = await call('triageStart', { patientId: self.id, consent: true });
    setSessionId(res.sessionId);
    setMessages([{ who: 'ai', text: res.greeting }]);
  });

  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    setMessages((m) => [...m, { who: 'me', text: t }]);
    run(async () => {
      const res = await call('triageSendMessage', { sessionId, text: t });
      setMessages((m) => [...m, { who: 'ai', text: res.reply }]);
      if (res.aiUnavailable) { setUnavailable(true); return; }
      if (res.route !== 'in_progress') {
        flow.update({ triage: { sessionId, patientId: self.id, result: toResult(res.route, res.reply) }, consult: null, cart: [] });
        go('result');
      }
    });
  };

  return (
    <FlowPage
      step={3}
      title={sessionId ? 'คุยกับผู้ช่วย AI' : 'ผู้ช่วยประเมินอาการ'}
      onBack={() => go('choose')}
      footer={!sessionId ? (
        <Button size="lg" block busy={busy} disabled={!consent || !self} onClick={start}>เริ่มคุย</Button>
      ) : unavailable ? (
        <Button size="lg" block onClick={onFallback}>ตอบเป็นชุดคำถามแทน</Button>
      ) : (
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            rows={2}
            value={text}
            maxLength={2000}
            aria-label="พิมพ์อาการของคุณ"
            placeholder="เล่าอาการ เช่น เจ็บคอ มีไข้ 2 วัน"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <Button type="submit" size="lg" busy={busy} disabled={!text.trim()}>ส่ง</Button>
        </form>
      )}
    >
      {!sessionId ? (
        <>
          <Notice tone="warn" title="ก่อนเริ่ม">
            ผู้ช่วย AI ใช้ประเมินเบื้องต้นเท่านั้น ไม่ใช่การวินิจฉัยโรค และไม่อนุมัติจ่ายยา หากมีอาการฉุกเฉิน <a href="tel:1669">โทร 1669</a> ทันที
          </Notice>
          <Notice tone="info" title="เรื่องข้อมูลของคุณ">
            ข้อความที่พิมพ์จะถูกส่งไปประมวลผลกับ Google Gemini (บริการฟรี) กรุณาไม่พิมพ์ชื่อ เบอร์โทร หรือที่อยู่
          </Notice>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            ยินยอมให้ส่งข้อความอาการและข้อมูลสุขภาพที่ไม่ระบุตัวตน (อายุ แพ้ยา โรคประจำตัว ยาที่ใช้) ให้ AI ประมวลผล
          </label>
          {!consent ? <p className="hint">ติ๊กยินยอมก่อน จึงจะเริ่มคุยได้</p> : null}
          <button type="button" className="btn btn-ghost" onClick={onFallback}>ไม่ใช้ AI ตอบเป็นชุดคำถามแทน</button>
          {!self ? <ErrorText>ไม่พบโปรไฟล์ของคุณ กรุณาออกจากระบบแล้วเข้าใหม่</ErrorText> : null}
        </>
      ) : (
        <div className="chat" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`bubble${m.who === 'me' ? ' bubble-mine' : ''}`}>
              <span className="bubble-who">{m.who === 'me' ? 'คุณ' : 'ผู้ช่วย AI'}</span>
              <p style={{ whiteSpace: 'pre-wrap' }}>{m.text}</p>
            </div>
          ))}
          {busy ? <p className="hint chat-wait"><Icon name="clock" size={16} /> กำลังพิมพ์…</p> : null}
          <ErrorText>{error}</ErrorText>
          <div ref={endRef} />
        </div>
      )}
    </FlowPage>
  );
}
