// AI symptom chat step. The server (functions/src/triage.js) runs the red-flag check first, asks Gemini,
// and decides the final route; the AI only advises and never approves dispensing.
import { useEffect, useRef, useState } from 'react';
import { call } from '../firebase.js';
import { go, useAction } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { Button, ErrorText, Icon, Notice } from '../components/ui.jsx';
import FlowPage, { Redirect } from './FlowPage.jsx';
import { MatPage } from './Mat.jsx';
import { useFlow } from './state.jsx';
import { saveSymptomRecord } from '../lib/symptomHistory.js';

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

const clock = (at) => new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(at);

// The blue wall calendar from the menu, behind the phone: grid, a few dates, and two notes pinned beside the phone
// (hints for describing symptoms, and the emergency number). Purely decorative apart from the 1669 link.
function ChatWall({ children }) {
  const now = new Date(Date.now() + 7 * 3600e3);
  const month = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(now);
  const today = now.getUTCDate();
  const dates = [[6, 14, -1], [78, 9, 3], [14, 74, 5], [70, 80, 8], [91, 84, 12], [3, 42, -4], [55, 90, 2]];
  return (
    <div className="chat-wall-page">
      <div className="chat-wall" aria-hidden>
        <b className="chat-wall-month">{month}</b>
        {dates.map(([x, y, d]) => <span key={`${x}-${y}`} className="chat-wall-day" style={{ left: `${x}%`, top: `${y}%` }}>{String((((today - 1 + d) % 28) + 28) % 28 + 1).padStart(2, '0')}</span>)}
        <span className="chat-wall-tape" />
      </div>
      <aside className="chat-note chat-note-l" aria-label="เคล็ดลับการเล่าอาการ">
        <span className="chat-pin" aria-hidden />
        <h2>เล่าอาการให้ชัด</h2>
        <ul>
          <li>เริ่มเป็นตั้งแต่เมื่อไหร่</li>
          <li>ปวดหรือเป็นตรงไหน</li>
          <li>ยาที่กินไปแล้ว</li>
          <li>แพ้ยาอะไรหรือไม่</li>
        </ul>
        <p>ไม่ต้องพิมพ์ชื่อหรือเบอร์โทร</p>
      </aside>
      <aside className="chat-note chat-note-r" aria-label="เหตุฉุกเฉิน">
        <span className="chat-pin" aria-hidden />
        <h2>ฉุกเฉินโทร 1669</h2>
        <p>เจ็บแน่นหน้าอก หายใจไม่ออก หมดสติ ชัก หรือเลือดออกมาก อย่ารอแชต</p>
        <a href="tel:1669">โทร 1669</a>
      </aside>
      {children}
    </div>
  );
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

  if (flow.kind === 'goods') return <Redirect to="shop" />;

  const start = () => run(async () => {
    const res = await call('triageStart', { patientId: self.id, consent: true });
    setSessionId(res.sessionId);
    setMessages([{ who: 'ai', text: res.greeting, at: Date.now() }]);
  });

  const send = () => {
    const t = text.trim() || (image ? 'แนบรูปประกอบ' : '');
    if (!t || busy) return;
    const photo = image;
    setText('');
    setImage(null);
    setMessages((m) => [...m, { who: 'me', text: t, photo: photo?.preview, at: Date.now() }]);
    run(async () => {
      const res = await call('triageSendMessage', { sessionId, text: t, ...(photo ? { image: { mimeType: photo.mimeType, data: photo.data } } : {}) });
      setMessages((m) => [...m, { who: 'ai', text: res.reply, at: Date.now() }]);
      if (res.aiUnavailable) { setUnavailable(true); return; }
      if (res.route !== 'in_progress') {
        const triageRes = toResult(res.route, res.reply, res.suggestedCatalogIds, res.healthNotes, res.healthMissing, res.healthBasis);
        saveSymptomRecord(self?.id, {
          id: sessionId,
          title: triageRes.title || 'ปรึกษาอาการกับ AI',
          route: res.route === 'emergency' ? 'emergency' : res.route === 'pharmacist' ? 'pharmacist' : 'self_care',
          routeText: res.route === 'emergency' ? 'ภาวะฉุกเฉิน 1669' : res.route === 'pharmacist' ? 'ควรปรึกษาเภสัชกร' : 'ดูแลตัวเองเบื้องต้นได้',
          duration: 'จากการสนทนา',
          severity: res.route === 'emergency' ? 'ฉุกเฉิน' : 'ปานกลาง',
          symptoms: [t],
          redFlags: res.route === 'emergency' ? 'มีสัญญาณอันตราย 1669' : 'ผ่านการตรวจสัญญาณอันตรายแล้ว',
          advice: [res.reply],
          suggestedMeds: res.suggestedCatalogIds || [],
          source: 'chat',
        });
        flow.update({ triage: { sessionId, patientId: self.id, result: triageRes }, consult: null, cart: [] });
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

  const onMat = (page) => (sessionId ? <ChatWall>{page}</ChatWall> : <MatPage>{page}</MatPage>);
  return onMat(
    <FlowPage
      step={2}
      wide={Boolean(sessionId)}
      title={sessionId ? 'คุยกับผู้ช่วย AI' : 'ผู้ช่วยประเมินอาการ'}
      onBack={() => go('choose')}
      footer={!sessionId ? (
        <Button size="lg" block busy={busy} disabled={!consent || !self} onClick={start}>เริ่มคุย</Button>
      ) : null}
    >
      {!sessionId ? (
        <div className="zones">
          <section className="zone zone-warn">
            <h2>ก่อนเริ่ม</h2>
            <p>ผู้ช่วย AI ใช้ประเมินเบื้องต้นเท่านั้น ไม่ใช่การวินิจฉัยโรค และไม่อนุมัติจ่ายยา หากมีอาการฉุกเฉิน <a href="tel:1669">โทร 1669</a> ทันที</p>
          </section>
          <section className="zone zone-info">
            <h2>เรื่องข้อมูลของคุณ</h2>
            <p>ข้อความและรูปที่แนบจะถูกส่งไปประมวลผลกับ Google Gemini (บริการฟรี) ระบบไม่เก็บรูปไว้ กรุณาไม่พิมพ์ชื่อ เบอร์โทร หรือที่อยู่ และอย่าถ่ายให้เห็นใบหน้าหรือชื่อบนฉลาก ปุ่มไมค์ใช้บริการแปลงเสียงของเบราว์เซอร์</p>
          </section>
          <section className="zone zone-form">
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              ยินยอมให้ส่งข้อความอาการและข้อมูลสุขภาพที่ไม่ระบุตัวตน (อายุ แพ้ยา โรคประจำตัว ยาที่ใช้) ให้ AI ประมวลผล
            </label>
            {!consent ? <p className="hint">ติ๊กยินยอมก่อน จึงจะเริ่มคุยได้</p> : null}
            {!self ? <ErrorText>ไม่พบโปรไฟล์ของคุณ กรุณาออกจากระบบแล้วเข้าใหม่</ErrorText> : null}
          </section>
          <div className="zone zone-alt">
            <button type="button" className="btn btn-ghost" onClick={onFallback}>ไม่ใช้ AI ตอบเป็นชุดคำถามแทน</button>
          </div>
        </div>
      ) : (
        <div className="phone" role="group" aria-label="แชตกับผู้ช่วย AI">
          <span className="phone-btn phone-btn-a" aria-hidden /><span className="phone-btn phone-btn-b" aria-hidden />
          <div className="phone-screen">
            <div className="phone-status" aria-hidden>
              <b>{clock(Date.now())}</b><span className="phone-notch" />
              <span className="phone-signal"><i /><i /><i /><i /></span>
            </div>
            <header className="phone-head">
              <span className="phone-avatar" aria-hidden>AI</span>
              <div><strong>ผู้ช่วยประเมินอาการ</strong><small>{busy ? 'กำลังพิมพ์…' : 'ออนไลน์ · ไม่ใช่การวินิจฉัย'}</small></div>
              <a className="phone-sos" href="tel:1669" aria-label="โทรฉุกเฉิน 1669"><Icon name="phone" size={18} />1669</a>
            </header>

            <div className="chat" aria-live="polite">
              <p className="chat-day">วันนี้</p>
              {messages.map((m, i) => (
                <div key={i} className={`bubble${m.who === 'me' ? ' bubble-mine' : ''}`}>
                  {m.photo ? <img className="bubble-photo" src={m.photo} alt="รูปที่แนบ" /> : null}
                  <p>{m.text}</p>
                  <time>{clock(m.at ?? Date.now())}{m.who === 'me' ? ' · ส่งแล้ว' : ''}</time>
                </div>
              ))}
              {busy ? <div className="bubble bubble-typing" role="status" aria-label="ผู้ช่วย AI กำลังพิมพ์"><i /><i /><i /></div> : null}
              <ErrorText>{error}</ErrorText>
              <div ref={endRef} />
            </div>

            {unavailable ? (
              <div className="phone-bar"><Button size="lg" block onClick={onFallback}>ตอบเป็นชุดคำถามแทน</Button></div>
            ) : (
              <form className="phone-bar" onSubmit={(e) => { e.preventDefault(); send(); }}>
                {image ? (
                  <div className="chat-photo">
                    <img src={image.preview} alt="รูปที่จะส่ง" />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImage(null)}>เอารูปออก</button>
                  </div>
                ) : null}
                {mediaError ? <p className="error-text" role="alert">{mediaError}</p> : null}
                <div className="phone-row">
                  <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickPhoto} />
                  <button type="button" className="phone-tool" onClick={() => fileInput.current?.click()} aria-label="แนบรูป (แผล ผื่น หรือกล่องยา)" title="แนบรูป"><Icon name="camera" size={22} /></button>
                  <div className="phone-field">
                    <textarea
                      rows={1}
                      value={text}
                      maxLength={2000}
                      aria-label="พิมพ์อาการของคุณ"
                      placeholder="พิมพ์ข้อความ…"
                      onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`; }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    />
                    {SpeechRecognition ? (
                      <button type="button" className={`phone-tool phone-mic${listening ? ' is-listening' : ''}`} onClick={toggleVoice} aria-pressed={listening} aria-label={listening ? 'หยุดฟัง' : 'พูดแทนการพิมพ์'} title="พูด"><Icon name="mic" size={20} /></button>
                    ) : null}
                  </div>
                  <button type="submit" className="phone-send" disabled={busy || (!text.trim() && !image)} aria-label="ส่ง">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" /></svg>
                  </button>
                </div>
              </form>
            )}
            <span className="phone-home" aria-hidden />
          </div>
        </div>
      )}
    </FlowPage>
  );
}
