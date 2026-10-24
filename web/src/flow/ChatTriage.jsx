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
function toResult(route, reply, suggestedCatalogIds = [], healthNotes = [], healthMissing = false, healthBasis = []) {
  const r = ROUTE[route] ?? 'pharmacist';
  return {
    route: r,
    title: TITLE[r],
    advice: reply.split('\n').map((l) => l.trim()).filter(Boolean),
    notes: [],
    warn: [],
    suggestedCatalogIds: r === 'self_care' ? suggestedCatalogIds : [],
    disclaimer: 'ผลนี้เป็นข้อมูลเบื้องต้นจากแชต AI ไม่ใช่การวินิจฉัยโรค เภสัชกรเป็นผู้ตัดสินใจเรื่องยา ไม่ใช่ AI',
    healthNotes,
    healthMissing,
    healthBasis,
    source: 'ai',
  };
}

// Shrinks a photo so it stays small enough to send (about 1024px on the long side, JPEG).
async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('อ่านรูปไม่ได้'));
      el.src = url;
    });
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    return { mimeType: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export default function ChatTriage({ onFallback }) {
  const { patients } = useSession();
  const flow = useFlow();
  const self = patients.find((p) => p.isSelf && p.isOwner);
  const [consent, setConsent] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [image, setImage] = useState(null);
  const [listening, setListening] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const recognizer = useRef(null);
  const fileInput = useRef(null);
  const { busy, error, run } = useAction();
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);
  useEffect(() => () => recognizer.current?.abort?.(), []);

  if (!flow.pharmacy) return <Redirect to="" />;
  if (flow.kind === 'goods') return <Redirect to="shop" />;

  const start = () => run(async () => {
    const res = await call('triageStart', { patientId: self.id, consent: true });
    setSessionId(res.sessionId);
    setMessages([{ who: 'ai', text: res.greeting }]);
  });

  const send = () => {
    const t = text.trim() || (image ? 'แนบรูปประกอบ' : '');
    if (!t || busy) return;
    const photo = image;
    setText('');
    setImage(null);
    setMessages((m) => [...m, { who: 'me', text: t, photo: photo?.preview }]);
    run(async () => {
      const res = await call('triageSendMessage', { sessionId, text: t, ...(photo ? { image: { mimeType: photo.mimeType, data: photo.data } } : {}) });
      setMessages((m) => [...m, { who: 'ai', text: res.reply }]);
      if (res.aiUnavailable) { setUnavailable(true); return; }
      if (res.route !== 'in_progress') {
        flow.update({ triage: { sessionId, patientId: self.id, result: toResult(res.route, res.reply, res.suggestedCatalogIds, res.healthNotes, res.healthMissing, res.healthBasis) }, consult: null, cart: [] });
        go('result');
      }
    });
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaError('');
    try {
      setImage(await compressImage(file));
    } catch {
      setMediaError('อ่านรูปนี้ไม่ได้ ลองรูปอื่น');
    }
  };
  const toggleVoice = () => {
    if (listening) { recognizer.current?.stop(); return; }
    setMediaError('');
    const rec = new SpeechRecognition();
    rec.lang = 'th-TH';
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const said = Array.from(ev.results).map((r) => r[0].transcript).join(' ');
      setText((t) => `${t ? `${t} ` : ''}${said}`.trim());
    };
    rec.onerror = () => setMediaError('ใช้ไมค์ไม่ได้ ตรวจว่าอนุญาตไมโครโฟนแล้ว หรือพิมพ์แทน');
    rec.onend = () => setListening(false);
    recognizer.current = rec;
    setListening(true);
    rec.start();
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
          {image ? (
            <div className="chat-photo">
              <img src={image.preview} alt="รูปที่จะส่ง" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImage(null)}>เอารูปออก</button>
            </div>
          ) : null}
          {mediaError ? <p className="error-text" role="alert">{mediaError}</p> : null}
          <div className="chat-input-row">
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickPhoto} />
            <button type="button" className="round-btn" onClick={() => fileInput.current?.click()} aria-label="แนบรูป (แผล ผื่น หรือกล่องยา)" title="แนบรูป"><Icon name="camera" /></button>
            {SpeechRecognition ? (
              <button type="button" className={`round-btn${listening ? ' is-listening' : ''}`} onClick={toggleVoice} aria-pressed={listening} aria-label={listening ? 'หยุดฟัง' : 'พูดแทนการพิมพ์'} title="พูด"><Icon name="mic" /></button>
            ) : null}
            <textarea
              rows={2}
              value={text}
              maxLength={2000}
              aria-label="พิมพ์อาการของคุณ"
              placeholder="เล่าอาการ เช่น เจ็บคอ มีไข้ 2 วัน"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <Button type="submit" size="lg" busy={busy} disabled={!text.trim() && !image}>ส่ง</Button>
          </div>
        </form>
      )}
    >
      {!sessionId ? (
        <>
          <Notice tone="warn" title="ก่อนเริ่ม">
            ผู้ช่วย AI ใช้ประเมินเบื้องต้นเท่านั้น ไม่ใช่การวินิจฉัยโรค และไม่อนุมัติจ่ายยา หากมีอาการฉุกเฉิน <a href="tel:1669">โทร 1669</a> ทันที
          </Notice>
          <Notice tone="info" title="เรื่องข้อมูลของคุณ">
            ข้อความและรูปที่แนบจะถูกส่งไปประมวลผลกับ Google Gemini (บริการฟรี) ระบบไม่เก็บรูปไว้ กรุณาไม่พิมพ์ชื่อ เบอร์โทร หรือที่อยู่ และอย่าถ่ายให้เห็นใบหน้าหรือชื่อบนฉลาก ปุ่มไมค์ใช้บริการแปลงเสียงของเบราว์เซอร์
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
              {m.photo ? <img className="bubble-photo" src={m.photo} alt="รูปที่แนบ" /> : null}
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
