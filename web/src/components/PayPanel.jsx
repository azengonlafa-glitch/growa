// Simulated payment screen: a QR that looks like a PromptPay code (but encodes plain demo text, never a real account),
// a countdown, a scanning line and a "waiting for payment" status. Cards and banking show a mock panel; no real card
// data is ever collected. Nothing here moves money: the real state change is the server's payOrder call.
import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Button, Icon } from './ui.jsx';
import '../paypanel.css';

const EXPIRES_S = 600;
const baht = (n) => `฿${Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function QrSvg({ text }) {
  const { n, d } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const count = q.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r += 1) for (let c = 0; c < count; c += 1) if (q.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    return { n: count, d: path };
  }, [text]);
  return (
    <svg className="pp-qr" viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label="คิวอาร์โค้ดจำลองสำหรับพร้อมเพย์ ไม่ใช่บัญชีจริง" shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="#0e2a47" />
    </svg>
  );
}

function useCountdown(resetKey) {
  const [left, setLeft] = useState(EXPIRES_S);
  useEffect(() => {
    setLeft(EXPIRES_S);
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resetKey]);
  return left;
}

const BANKS = [['ธนาคาร ก', '#1f7a4d'], ['ธนาคาร ข', '#6a3fa0'], ['ธนาคาร ค', '#1c6fd1']];

export default function PayPanel({ order, method, busy, onPay }) {
  const [round, setRound] = useState(0);
  const [bank, setBank] = useState(0);
  const left = useCountdown(round);
  const expired = left === 0;
  const payload = `GROWA-DEMO|ORDER:${order.id}|AMOUNT:${order.total}|NOT-A-REAL-PAYMENT`;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  if (method === 'card') {
    return (
      <div className="pp pp-card">
        <div className="pp-cardface" aria-hidden>
          <span className="pp-chip" />
          <b>•••• •••• •••• 4242</b>
          <span>บัตรตัวอย่าง · ไม่ใช่บัตรจริง</span>
        </div>
        <p className="pp-note"><Icon name="shield" size={16} />ไม่ต้องกรอกเลขบัตร ระบบนี้ไม่เก็บข้อมูลบัตรใดๆ</p>
        <Button size="lg" block busy={busy} onClick={onPay}>ชำระด้วยบัตร (จำลอง) · {baht(order.total)}</Button>
      </div>
    );
  }

  if (method === 'banking') {
    return (
      <div className="pp pp-bank">
        <div className="pp-banks" role="group" aria-label="เลือกแอปธนาคารจำลอง">
          {BANKS.map(([name, color], i) => (
            <button key={name} type="button" aria-pressed={bank === i} className={bank === i ? 'on' : ''} style={{ '--c': color }} onClick={() => setBank(i)}>
              <i aria-hidden>{name.slice(-1)}</i>{name}
            </button>
          ))}
        </div>
        <p className="pp-note"><Icon name="shield" size={16} />ระบบจะเปิดแอปธนาคารให้ยืนยัน (ตอนนี้เป็นการจำลอง ไม่มีการเปิดแอปจริง)</p>
        <Button size="lg" block busy={busy} onClick={onPay}>ยืนยันในแอปธนาคาร (จำลอง) · {baht(order.total)}</Button>
      </div>
    );
  }

  return (
    <div className="pp">
      <div className="pp-head"><Icon name="phone" size={18} />พร้อมเพย์ · สแกนเพื่อจ่าย<span>ข้อมูลจำลอง</span></div>
      <div className="pp-body">
        <div className={`pp-qrbox${expired ? ' off' : ''}`}>
          <QrSvg text={payload} />
          <i className="pp-c pp-tl" /><i className="pp-c pp-tr" /><i className="pp-c pp-bl" /><i className="pp-c pp-br" />
          {expired ? null : <span className="pp-scan" aria-hidden />}
          {expired ? <span className="pp-expired">QR หมดอายุ</span> : null}
        </div>
        <p className="pp-amount">{baht(order.total)}</p>
        <p className="pp-payee">ผู้รับ growa (ข้อมูลจำลอง)</p>
        <p className="pp-timer">{expired ? 'กรุณาขอ QR ใหม่' : <>QR หมดอายุใน <b className="num">{mm}:{ss}</b></>}</p>
        {expired ? null : <p className="pp-wait" role="status">รอการชำระเงิน<span aria-hidden>…</span></p>}
      </div>
      {expired ? (
        <Button size="lg" block variant="secondary" onClick={() => setRound((r) => r + 1)}>ขอ QR ใหม่</Button>
      ) : (
        <Button size="lg" block busy={busy} onClick={onPay}>ฉันสแกนจ่ายแล้ว (จำลอง)</Button>
      )}
      <p className="pp-note"><Icon name="shield" size={16} />QR นี้เป็นข้อความตัวอย่าง สแกนด้วยแอปธนาคารจะไม่ตัดเงินและไม่มีบัญชีผู้รับ</p>
    </div>
  );
}
