// Main menu (#/care) as a blue wall calendar of this month, with one sheet of notebook paper per mode pinned here and
// there across it, far apart. Each sheet is written by hand: a title, a few lines, ink boxes to tick, no app icons.
// The wheel, a swipe, the arrow keys or the arrow buttons move the camera to the next sheet (it pulls back and dives in
// on the way); a click anywhere on a sheet's spot zooms into it and opens that part of the app.
// Numbers come from data the app already loads for the signed-in person (today's doses, people); the order,
// notification and health sheets describe what is inside instead of inventing counts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../lib/session.js';
import { useMeds, useTodaySchedule, isLow } from '../lib/meds.js';
import { Icon } from '../components/ui.jsx';
import FlowPage from './FlowPage.jsx';
import '../carehub.css';

// Bangkok hour, so the greeting is right wherever the phone's clock is set.
function greeting() {
  const h = (new Date().getUTCHours() + 7) % 24;
  if (h < 5) return 'ดึกแล้วนะ';
  if (h < 12) return 'อรุณสวัสดิ์';
  if (h < 17) return 'สวัสดีตอนบ่าย';
  if (h < 20) return 'สวัสดีตอนเย็น';
  return 'สวัสดีตอนค่ำ';
}

// Counts up to `value` once its sheet becomes the active one.
function useCountUp(value, active) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(value); return undefined; }
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 700);
      setN(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, active]);
  return active ? n : 0;
}

// ───────── this month as a wall calendar (Bangkok date), always 6 weeks from the Sunday before the 1st ─────────
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function monthOfToday() {
  const now = new Date(Date.now() + 7 * 3600e3);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const lead = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const days = Array.from({ length: 42 }, (_, k) => {
    const d = new Date(Date.UTC(y, m, 1 - lead + k));
    return { x: k % 7, y: Math.floor(k / 7), day: d.getUTCDate(), month: d.getUTCMonth(), out: d.getUTCMonth() !== m, today: d.getUTCMonth() === m && d.getUTCDate() === now.getUTCDate() };
  });
  return { title: `${MONTHS[m]} ${y + 543}`, days };
}

// ───────── what is written on each sheet ─────────
// An ink box drawn on the paper; ticked in red when done. An empty box means "not logged yet", never "missed".
const Box = ({ done }) => <i className={`nb-box${done ? ' done' : ''}`} aria-hidden />;

// Old-fashioned die-cut stickers, one per sheet, in muted print colours with an ink outline (the white cut edge and the
// shadow come from CSS).
const O = { stroke: '#3b2a1a', strokeWidth: 2.6, strokeLinejoin: 'round', strokeLinecap: 'round' };
const STICKERS = {
  basket: (
    <>
      <circle cx="37" cy="37" r="9" fill="#c0503a" {...O} />
      <path d="M37 28 q4 -6 9 -5" fill="none" {...O} />
      <ellipse cx="60" cy="38" rx="14" ry="8" fill="#e3b56a" {...O} />
      <path d="M53 35 l3 5 M60 34 l3 5 M67 35 l2 4" fill="none" stroke="#a8742f" strokeWidth="2" strokeLinecap="round" />
      <path d="M26 46 C26 14 74 14 74 46" fill="none" stroke="#3b2a1a" strokeWidth="8" strokeLinecap="round" />
      <path d="M26 46 C26 14 74 14 74 46" fill="none" stroke="#a8742f" strokeWidth="4" strokeLinecap="round" />
      <path d="M15 48 H85 L77 88 H23 Z" fill="#d9a441" {...O} />
      <path d="M31 52 L33 87 M43 52 L44 87 M56 52 L55 87 M69 52 L67 87 M18 64 H82 M20 76 H80" fill="none" stroke="#9a6a2a" strokeWidth="2" />
      <rect x="10" y="42" width="80" height="10" rx="4" fill="#b97a35" {...O} />
    </>
  ),
  bell: (
    <>
      <path d="M10 38 q-5 9 0 18 M90 38 q5 9 0 18 M4 33 q-6 14 0 28 M96 33 q6 14 0 28" fill="none" {...O} strokeWidth="2.2" />
      <circle cx="50" cy="13" r="5" fill="#b98a2e" {...O} />
      <path d="M50 17 C32 17 27 34 27 52 C27 63 21 69 16 74 H84 C79 69 73 63 73 52 C73 34 68 17 50 17 Z" fill="#d9a441" {...O} />
      <path d="M39 29 C34 37 33 46 33 57" fill="none" stroke="#f6dc94" strokeWidth="4" strokeLinecap="round" />
      <path d="M30 60 H70" fill="none" stroke="#b5543c" strokeWidth="4" />
      <circle cx="50" cy="85" r="6" fill="#b98a2e" {...O} />
      <rect x="13" y="72" width="74" height="8" rx="4" fill="#b98a2e" {...O} />
    </>
  ),
  bottle: (
    <>
      <rect x="31" y="9" width="38" height="14" rx="3" fill="#f3e6c4" {...O} />
      <path d="M38 12 v8 M45 12 v8 M52 12 v8 M59 12 v8" fill="none" stroke="#b9a77c" strokeWidth="2" />
      <rect x="36" y="22" width="28" height="11" fill="#a8642c" {...O} />
      <rect x="24" y="32" width="52" height="58" rx="9" fill="#a8642c" {...O} />
      <path d="M31 39 V82" fill="none" stroke="#d9925a" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="34" y="48" width="36" height="28" rx="2" fill="#f3e6c4" {...O} />
      <path d="M52 54 v14 M45 61 h14" fill="none" stroke="#b5543c" strokeWidth="4.5" strokeLinecap="round" />
      <g transform="rotate(-32 84 84)"><rect x="73" y="79" width="22" height="10" rx="5" fill="#f3e6c4" {...O} /><path d="M84 79 v10" {...O} /><path d="M78 79 h6 v10 h-6 a5 5 0 0 1 0 -10 Z" fill="#b5543c" {...O} /></g>
    </>
  ),
  parcel: (
    <>
      <path d="M12 40 L27 28 H88 L73 40 Z" fill="#ddb67a" {...O} />
      <path d="M73 40 L88 28 V76 L73 88 Z" fill="#a97b42" {...O} />
      <rect x="12" y="40" width="61" height="48" fill="#c99a5b" {...O} />
      <path d="M44 40 V88 M12 64 H73 M44 40 L59 28 M73 64 L88 52" fill="none" stroke="#f1e4c3" strokeWidth="3.5" />
      <path d="M51 34 c-10 -10 -18 -2 -8 2 Z M51 34 c10 -10 18 -2 8 2 Z" fill="#f1e4c3" {...O} strokeWidth="2" />
      <rect x="18" y="46" width="17" height="19" fill="#f3e6c4" {...O} strokeWidth="2" strokeDasharray="2 2" />
      <rect x="21" y="49" width="11" height="13" fill="#3f7f7a" />
      <path d="M50 76 h16 M50 81 h10" fill="none" stroke="#7a5528" strokeWidth="2" />
    </>
  ),
  house: (
    <>
      <rect x="63" y="20" width="10" height="20" fill="#8c4a33" {...O} />
      <path d="M66 14 q4 -4 0 -8 M71 13 q4 -4 0 -8" fill="none" stroke="#9c958a" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="21" y="47" width="58" height="41" fill="#f3e6c4" {...O} />
      <path d="M12 51 L50 18 L88 51 Z" fill="#b5543c" {...O} />
      <path d="M50 44 c-6 -6 -11 -1 -6 4 l6 5 l6 -5 c5 -5 0 -10 -6 -4 Z" fill="#f3e6c4" />
      <rect x="27" y="56" width="14" height="14" fill="#f2cf6b" {...O} />
      <path d="M34 56 v14 M27 63 h14" fill="none" {...O} strokeWidth="2" />
      <rect x="51" y="61" width="16" height="27" rx="2" fill="#3f7f7a" {...O} />
      <circle cx="63" cy="75" r="1.8" fill="#f2cf6b" />
      <path d="M8 88 H92" fill="none" {...O} />
      <path d="M14 88 q3 -9 7 0 M80 88 q3 -9 7 0" fill="#6b7d3a" {...O} strokeWidth="2" />
    </>
  ),
  key: (
    <>
      <path d="M22 30 q-10 -14 -2 -20" fill="none" stroke="#b5543c" strokeWidth="2.5" />
      <circle cx="28" cy="50" r="17" fill="#d9a441" {...O} />
      <circle cx="28" cy="50" r="7" fill="#f8f2e2" {...O} />
      <path d="M44 45 H90 V55 H44 Z" fill="#d9a441" {...O} />
      <path d="M72 55 v15 h6 v-8 h5 v8 h5 v-15" fill="#d9a441" {...O} />
      <path d="M50 49 H86" fill="none" stroke="#f6dc94" strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  mortar: (
    <>
      <path d="M48 50 L80 14" fill="none" stroke="#3b2a1a" strokeWidth="14" strokeLinecap="round" />
      <path d="M48 50 L80 14" fill="none" stroke="#c99a5b" strokeWidth="8.5" strokeLinecap="round" />
      <path d="M24 46 c-8 -10 -2 -18 6 -14 c4 6 0 12 -6 14 Z" fill="#6b7d3a" {...O} strokeWidth="2" />
      <path d="M17 52 H83 C83 73 69 85 50 85 C31 85 17 73 17 52 Z" fill="#f3e6c4" {...O} />
      <path d="M22 64 C34 71 66 71 78 64" fill="none" stroke="#3f7f7a" strokeWidth="3.5" />
      <ellipse cx="50" cy="52" rx="33" ry="6" fill="#e3d3a8" {...O} />
      <rect x="36" y="84" width="28" height="7" rx="2" fill="#e3d3a8" {...O} />
    </>
  ),
  awning: (
    <>
      <rect x="16" y="40" width="68" height="48" fill="#f3e6c4" {...O} />
      <rect x="25" y="54" width="20" height="34" fill="#3f7f7a" {...O} />
      <rect x="53" y="54" width="23" height="18" fill="#cfe6f0" {...O} />
      <path d="M53 63 h23 M64.5 54 v18" fill="none" {...O} strokeWidth="2" />
      <path d="M10 20 H90 V38 q-8 10 -16 0 q-8 10 -16 0 q-8 10 -16 0 q-8 10 -16 0 q-8 10 -16 0 Z" fill="#c0503a" {...O} />
      <path d="M26 21 V39 M42 21 V39 M58 21 V39 M74 21 V39" fill="none" stroke="#f3e6c4" strokeWidth="5" />
      <path d="M10 20 H90" fill="none" {...O} />
    </>
  ),
  capsule: (
    <>
      <rect x="16" y="38" width="68" height="25" rx="12.5" fill="#f3e6c4" {...O} />
      <path d="M50 38 H28.5 a12.5 12.5 0 0 0 0 25 H50 Z" fill="#b5543c" {...O} />
      <path d="M27 45 h13" fill="none" stroke="#e8907f" strokeWidth="3.5" strokeLinecap="round" />
    </>
  ),
  heart: (
    <>
      <path d="M50 86 C20 66 10 46 21 31 C31 19 46 23 50 36 C54 23 69 19 79 31 C90 46 80 66 50 86 Z" fill="#c0503a" {...O} />
      <path d="M28 36 q4 -7 11 -5" fill="none" stroke="#ec9c8a" strokeWidth="4.5" strokeLinecap="round" />
    </>
  ),
  clock: (
    <>
      <path d="M30 86 l-7 9 M70 86 l7 9" fill="none" {...O} strokeWidth="4" />
      <path d="M17 30 a13 13 0 0 1 22 -12 Z" fill="#b98a2e" {...O} />
      <path d="M83 30 a13 13 0 0 0 -22 -12 Z" fill="#b98a2e" {...O} />
      <circle cx="50" cy="56" r="32" fill="#c0503a" {...O} />
      <circle cx="50" cy="56" r="24" fill="#f3e6c4" {...O} />
      <path d="M50 37 v4 M50 71 v4 M31 56 h4 M65 56 h4" fill="none" {...O} strokeWidth="2.2" />
      <path d="M50 56 V42 M50 56 L61 62" fill="none" {...O} strokeWidth="3.4" />
      <circle cx="50" cy="56" r="2.6" fill="#3b2a1a" />
    </>
  ),
  star: <path d="M50 8 L61 36 L91 37 L67 56 L76 86 L50 69 L24 86 L33 56 L9 37 L39 36 Z" fill="#e8b84a" {...O} />,
  truck: (
    <>
      <rect x="6" y="30" width="58" height="40" rx="3" fill="#3f7f7a" {...O} />
      <path d="M14 42 H54 M14 51 H40" fill="none" stroke="#f3e6c4" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M64 42 H81 L94 57 V70 H64 Z" fill="#c0503a" {...O} />
      <path d="M69 47 H79 L87 57 H69 Z" fill="#cfe6f0" {...O} strokeWidth="2" />
      <circle cx="26" cy="72" r="10" fill="#3b2a1a" /><circle cx="26" cy="72" r="4" fill="#f3e6c4" />
      <circle cx="78" cy="72" r="10" fill="#3b2a1a" /><circle cx="78" cy="72" r="4" fill="#f3e6c4" />
    </>
  ),
  stamp: (
    <>
      <rect x="16" y="10" width="68" height="80" fill="#f3e6c4" {...O} strokeDasharray="4.5 3" />
      <rect x="24" y="18" width="52" height="52" fill="#9db7c9" />
      <circle cx="62" cy="34" r="9" fill="#f2cf6b" />
      <path d="M24 70 L40 48 L52 60 L76 38 V70 Z" fill="#6b7d3a" />
      <path d="M26 80 h26" fill="none" stroke="#3b2a1a" strokeWidth="3" />
      <text x="72" y="84" fontSize="12" fontFamily="Fredoka, sans-serif" fontWeight="700" fill="#b5543c" textAnchor="end">3฿</text>
    </>
  ),
  flower: (
    <>
      <path d="M50 58 V96 M50 82 q14 -12 22 -4 q-10 10 -22 4" fill="#6b7d3a" stroke="#3b2a1a" strokeWidth="2.6" strokeLinejoin="round" />
      {[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={50 + 19 * Math.sin((a * Math.PI) / 180)} cy={40 - 19 * Math.cos((a * Math.PI) / 180)} r="14" fill="#f2cf6b" {...O} />)}
      <circle cx="50" cy="40" r="10" fill="#c0503a" {...O} />
    </>
  ),
  lock: (
    <>
      <path d="M32 48 V34 a18 18 0 0 1 36 0 V48" fill="none" stroke="#3b2a1a" strokeWidth="11" />
      <path d="M32 48 V34 a18 18 0 0 1 36 0 V48" fill="none" stroke="#a9a294" strokeWidth="5.5" />
      <rect x="20" y="46" width="60" height="44" rx="6" fill="#d9a441" {...O} />
      <circle cx="50" cy="63" r="5.5" fill="#3b2a1a" />
      <path d="M50 65 v12" fill="none" stroke="#3b2a1a" strokeWidth="4.5" strokeLinecap="round" />
    </>
  ),
  pencil: (
    <g transform="rotate(-35 50 50)">
      <rect x="16" y="40" width="56" height="20" fill="#f2cf6b" {...O} />
      <path d="M16 47 H72 M16 53 H72" fill="none" stroke="#c99a2e" strokeWidth="2" />
      <rect x="4" y="40" width="13" height="20" rx="4" fill="#e8907f" {...O} />
      <path d="M72 40 L94 50 L72 60 Z" fill="#f3d9b0" {...O} />
      <path d="M87 47 L94 50 L87 53 Z" fill="#3b2a1a" />
    </g>
  ),
  leaf: (
    <>
      <path d="M16 84 C16 42 48 18 86 14 C84 52 60 82 16 84 Z" fill="#6b7d3a" {...O} />
      <path d="M16 84 C38 62 56 44 76 26 M44 60 L42 44 M58 46 L60 32 M46 58 L60 60" fill="none" stroke="#a9bb6a" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
};
// pen doodles drawn straight on the paper (no sticker edge)
const DOODLES = {
  sparkle: <path d="M50 8 V38 M50 62 V92 M8 50 H38 M62 50 H92 M27 27 l9 9 M64 64 l9 9 M73 27 l-9 9 M36 64 l-9 9" />,
  swirl: <path d="M14 70 c4 -26 36 -28 34 -6 c-2 16 -22 14 -20 0 c4 -24 46 -30 58 -6 c8 16 -2 30 -16 32" />,
  heart: <path d="M50 84 C22 64 14 46 24 33 C33 22 46 26 50 37 C54 26 67 22 76 33 C86 46 78 64 50 84 Z" />,
  arrow: <path d="M10 70 C30 30 60 24 86 36 M86 36 L72 26 M86 36 L74 50" />,
};
const Sticker = ({ kind }) => (STICKERS[kind] ? <span className="nb-sticker" aria-hidden><svg viewBox="0 0 100 100">{STICKERS[kind]}</svg></span> : null);
// Extra stickers and doodles in the free space between a sheet's writing and its links, so they never cover text:
// [kind, left %, top %, size in em, turn in deg]. A short space shrinks them (cqh) and keeps them inside it.
function Decor({ items = [] }) {
  return items.map(([kind, x, y, size, turn]) => {
    const pen = kind.startsWith('pen-');
    const art = pen ? DOODLES[kind.slice(4)] : STICKERS[kind];
    if (!art) return null;
    return (
      <span key={`${kind}-${x}-${y}`} className={pen ? 'nb-doodle' : 'nb-deco'} aria-hidden style={{ '--s': `min(${size}em, ${size * 11}cqh)`, left: `min(${x}%, calc(100% - var(--s)))`, top: `min(${y}%, calc(100% - var(--s)))`, rotate: `${turn}deg` }}>
        <svg viewBox="0 0 100 100">{art}</svg>
      </span>
    );
  });
}

function MedsBody({ taken, total, rows, active }) {
  const shown = useCountUp(taken, active);
  return (
    <>
      <p className="nb-big"><b>{shown}</b> / {total} มื้อวันนี้</p>
      <ul className="nb-list">
        {rows.map((r, i) => (
          <li key={r.key} style={{ '--i': i }}>{r.time ? <><Box done={r.done} /><span className="nb-time">{r.time}</span></> : null}<span className="nb-cut">{r.name}</span>{r.done ? <em className="nb-red">กินแล้ว</em> : null}</li>
        ))}
      </ul>
      {total ? <p className="nb-pencil">ช่องว่าง = ยังไม่ได้บันทึก</p> : null}
    </>
  );
}

function OrderBody({ first }) {
  return (
    <>
      <p className="nb-pencil nb-gap">{greeting()}</p>
      <p className="nb-name">{first}</p>
      <p>เลือกยาหรือของใช้ก่อน แล้วเลือกสาขาใกล้บ้านตอนจะสั่ง</p>
    </>
  );
}

function NotifyBody() {
  const rows = [['ถึงเวลากินยา', 'เตือนตามตารางที่คุณตั้ง'], ['ยาใกล้หมด', 'เตือนก่อนหมดตามจำนวนวันที่ตั้ง'], ['สถานะออเดอร์', 'ร้านยืนยัน จัดส่ง ถึงบ้าน']];
  return (
    <ul className="nb-list nb-dash">
      {rows.map(([t, d], i) => <li key={t} style={{ '--i': i }}><b>{t}</b><span className="nb-pencil"> — {d}</span></li>)}
    </ul>
  );
}

function OrdersBody() {
  const stages = ['ร้านตรวจสต็อก', 'เภสัชกรอนุมัติ', 'ชำระเงิน', 'จัดส่ง', 'ถึงบ้าน'];
  return (
    <>
      <ol className="nb-list nb-steps">{stages.map((s, i) => <li key={s} style={{ '--i': i }}>{s}</li>)}</ol>
      <p className="nb-red">* ยาที่ต้องตรวจ จะเก็บเงินหลังเภสัชกรอนุมัติเท่านั้น</p>
    </>
  );
}

function FamilyBody({ names, count, invites, house }) {
  return (
    <>
      <p className="nb-big">{house ? <><b>{house.memberUids.length}</b> สมาชิกในบ้าน</> : <><b>{count}</b> โปรไฟล์</>}</p>
      <ul className="nb-list nb-dash">
        {names.slice(0, 3).map((n, i) => <li key={`${n}-${i}`} style={{ '--i': i }}>{n}</li>)}
        {count > 3 ? <li style={{ '--i': 3 }} className="nb-pencil">และอีก {count - 3} คน</li> : null}
      </ul>
      <p className="nb-pencil">{house ? `${house.name} · ${count} โปรไฟล์ผู้ป่วย` : invites ? `มีคำเชิญรอตอบ ${invites} รายการ` : 'สร้างบ้านหรือเข้าร่วมด้วยรหัสเชิญ 8 หลัก'}</p>
    </>
  );
}

function HealthBody({ first, email }) {
  return (
    <>
      <p className="nb-name">{first}</p>
      <p className="nb-pencil nb-cut">{email}</p>
      <ul className="nb-list nb-dash">{['ประวัติแพ้ยา', 'โรคประจำตัว', 'ยาที่ใช้อยู่'].map((t, i) => <li key={t} style={{ '--i': i }}>{t}</li>)}</ul>
      <p className="nb-pencil">เห็นได้เฉพาะเจ้าของและผู้ดูแลที่ได้รับสิทธิ์ ผู้ดูแลระบบอ่านไม่ได้</p>
    </>
  );
}

// Log out lives at the bottom of Settings, so this sheet has one way in.
function AccountBody({ first, email }) {
  return (
    <>
      <p className="nb-name">{first}</p>
      <p className="nb-pencil nb-cut">{email}</p>
    </>
  );
}

// Where each sheet lies on the month, in cells (x from Sunday, y = week), scattered on purpose; the tilt of each sheet.
const SPOTS = [[0.15, 0.25], [2.6, 1.5], [0.9, 3.25], [4.4, 0.15], [3.5, 3.7], [5.75, 2.25], [1.9, 4.75], [5.2, 4.55]];
const TILT = [-3.5, 4.5, -2, 5.5, -4.5, 3, -6, 2.5];
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// One sheet: an invisible link over its whole spot, and the paper on top that lets clicks through except on its own
// buttons and links.
function Sheet({ w, index, active, onEnter, onFocusCell }) {
  const [mode, setMode] = useState(w.modes?.[0]?.id);
  const cur = w.modes?.find((m) => m.id === mode) ?? w.modes?.[0];
  const href = cur?.href ?? w.href;
  return (
    <section
      className={`cal-cell${active ? ' on' : ''}`} aria-label={w.title}
      style={{ '--x': SPOTS[index % SPOTS.length][0], '--y': SPOTS[index % SPOTS.length][1], '--tilt': `${TILT[index % TILT.length]}deg` }}
    >
      <a className="cal-open" href={href} aria-label={`เปิด${w.title}`} onFocus={() => onFocusCell(index)} onClick={(e) => { e.preventDefault(); onEnter(index, href); }} />
      <div className={`wd wd-${w.tone}${active ? ' on' : ''}`}>
        <span className="wd-lift" aria-hidden><i /><i /></span>
        <span className="cal-pin" aria-hidden />
        <Sticker kind={w.sticker} />
        <p className="nb-kicker">{w.kicker}</p>
        <h2 className="nb-title"><span>{w.title}</span></h2>
        <p className="nb-pencil nb-desc">{w.desc}</p>
        {w.modes ? (
          <div className="nb-tabs" role="group" aria-label={`โหมดของ${w.title}`}>
            {w.modes.map((m) => (
              <button key={m.id} type="button" aria-pressed={m.id === cur.id} className={m.id === cur.id ? 'on' : ''} onClick={() => setMode(m.id)}>{m.label}</button>
            ))}
          </div>
        ) : null}
        <div className="wd-body" key={cur?.id}>{(cur?.body ?? w.body)(active)}</div>
        <div className="nb-deco-area" aria-hidden><Decor items={w.deco} /></div>
        <footer className="wd-bottom">
          <span />
          <span className="wd-go" aria-hidden>เปิด</span>
        </footer>
      </div>
    </section>
  );
}

export default function CareHub() {
  const { user, profile, staffOf, patients, invitations, house } = useSession();
  const self = patients.find((p) => p.isSelf) ?? patients[0];
  const [meds] = useMeds(self?.id);
  const [slots] = useTodaySchedule(self?.id, meds);
  const deck = useRef(null);
  const dip = useRef(null);
  const [pick, setPick] = useState(0);
  const [entering, setEntering] = useState(null);
  const month = useMemo(monthOfToday, []);

  const name = (profile?.displayName ?? '').trim();
  const first = name.split(/\s+/)[0] || user.email?.split('@')[0] || 'คุณ';

  const widgets = useMemo(() => {
    const taken = slots.filter((s) => s.log?.status === 'taken').length;
    const low = meds.filter(isLow).length;
    const rows = slots.length
      ? slots.slice(0, 4).map((s) => ({ key: `${s.at}-${s.med.id}`, time: s.time, name: s.med.name, done: s.log?.status === 'taken' }))
      : [{ key: 'none', name: meds.length ? 'วันนี้ไม่มีมื้อยา' : 'ยังไม่มียา' }];
    const names = patients.map((p) => (p.displayName || '—').split(/\s+/)[0]);
    const list = [
      {
        id: 'order', tone: 'green', kicker: 'ไปช้อปกัน', sticker: 'basket', deco: [['awning', 52, 9, 7, -5], ['capsule', 12, 31, 4.4, -24], ['leaf', 34, 48, 3.6, 18], ['pen-sparkle', 84, 2, 2.2, 0], ['pen-arrow', 30, 18, 3.4, 8]], title: 'สั่งยาและสินค้า', href: '#/choose',
        desc: 'ประเมินอาการ หรือเลือกของใช้ แล้วค่อยเลือกสาขาตอนสั่ง',
        body: () => <OrderBody first={first} />,
      },
      {
        id: 'meds', tone: 'honey', kicker: 'ดูแลตัวเองนะ', sticker: 'bottle', deco: [['capsule', 64, 57, 4.4, 28], ['heart', 14, 62, 3.8, -12], ['pen-sparkle', 46, 68, 2, 0], ['pen-heart', 84, 40, 2.2, 14]], title: 'สุขภาพและยา', href: '#/meds',
        desc: low ? `ยาใกล้หมด ${low} รายการ · ประวัติแพ้ยา และโปรไฟล์ครอบครัว` : `ยาทั้งหมด ${meds.length} รายการ · ประวัติแพ้ยา และโปรไฟล์ครอบครัว`,
        modes: [
          { id: 'meds', label: 'ยา', href: '#/meds', body: (a) => <MedsBody taken={taken} total={slots.length} rows={rows} active={a} /> },
          { id: 'health', label: 'สุขภาพและโปรไฟล์', href: '#/health', body: () => <HealthBody first={first} email={user.email ?? ''} /> },
        ],
      },
      {
        id: 'notifications', tone: 'blue', kicker: 'อย่าลืมนะ', sticker: 'bell', deco: [['clock', 52, 0, 7, 8], ['star', 16, 18, 4, -14], ['pen-sparkle', 84, 0, 2.4, 0], ['pen-swirl', 14, 57, 4, 0], ['star', 40, 53, 2.6, 18]], title: 'แจ้งเตือน', href: '#/notifications',
        desc: 'สิ่งที่ระบบจะบอกคุณ ยังไม่มีการแจ้งเตือนนอกแอป',
        body: () => <NotifyBody />,
      },
      {
        id: 'orders', tone: 'teal', kicker: 'ของกำลังมา', sticker: 'parcel', deco: [['truck', 46, 31, 7.4, -4], ['stamp', 12, 37, 4.6, 9], ['pen-arrow', 70, 18, 3, -8], ['pen-sparkle', 30, 70, 2, 0]], title: 'คำสั่งซื้อ', href: '#/orders',
        desc: 'ติดตามตั้งแต่สั่งจนถึงบ้าน และดูใบเสร็จ (ข้อมูลจำลอง)',
        body: () => <OrdersBody />,
      },
      {
        id: 'family', tone: 'peach', kicker: 'ครอบครัวเรา', sticker: 'house', deco: [['flower', 14, 9, 5.4, -10], ['heart', 56, 4, 4.8, 12], ['flower', 70, 40, 4, 16], ['pen-heart', 40, 48, 2.6, -8], ['pen-sparkle', 26, 66, 2, 0]], title: house ? house.name : 'บ้านและครอบครัว', href: '#/family',
        desc: house ? 'สมาชิก ผู้ป่วย กิจกรรม และการเตือนของบ้าน' : 'ให้หลายคนช่วยกันดูแลผู้ป่วยคนเดียวกัน',
        body: () => <FamilyBody names={names} count={patients.length} invites={invitations.length} house={house} />,
      },
      {
        id: 'account', tone: 'lilac', kicker: 'ของฉัน', sticker: 'key', deco: [['lock', 56, 4, 5.8, 8], ['pencil', 14, 22, 5.4, 0], ['star', 74, 48, 3.2, 20], ['pen-swirl', 34, 53, 3.6, 0]], title: 'บัญชีและตั้งค่า', href: '#/settings',
        desc: 'ธีมเช้า/กลางคืน รหัสผ่าน และออกจากระบบ (ล่างสุดของหน้าตั้งค่า)',
        body: () => <AccountBody first={first} email={user.email ?? ''} />,
      },
    ];
    if (staffOf.length) {
      list.unshift({
        id: 'pharmacy', tone: 'rose', kicker: 'ร้านของเรา', sticker: 'mortar', deco: [['leaf', 56, 18, 4.6, -10], ['bottle', 14, 26, 5, 8], ['capsule', 66, 57, 3.8, 30], ['pen-sparkle', 40, 66, 2, 0]], title: 'งานของร้านยา', href: '#/pharmacist',
        desc: `${staffOf[0].pharmacy?.name ?? 'ร้านยา'} · คำสั่งซื้อใหม่ คิวประเมิน การจัดส่ง`,
        body: () => <OrdersBody />,
      });
    }
    return list;
  }, [slots, meds, patients, invitations, staffOf, first, user.email, house]);

  const n = widgets.length;
  const active = Math.min(pick, n - 1);
  const step = useCallback((d) => setPick((a) => (Math.min(a, n - 1) + d + n) % n), [n]);

  // On the way to another cell the camera pulls back a little and dives in again.
  const opened = useRef(true);
  useEffect(() => {
    if (opened.current) { opened.current = false; return; }
    if (calm() || !dip.current?.animate) return;
    dip.current.animate([{ transform: 'scale(1)' }, { transform: 'scale(.62)', offset: 0.45 }, { transform: 'scale(1)' }], { duration: 1050, easing: 'ease-in-out' });
  }, [active]);

  // Clicking a cell centres it, zooms into it, then opens it.
  const enter = useCallback((i, href) => {
    if (entering !== null) return;
    if (calm()) { window.location.hash = href; return; }
    setPick(i);
    setEntering(i);
    setTimeout(() => { window.location.hash = href; }, 720);
  }, [entering]);

  // One wheel notch (up/down or sideways) = one cell.
  const lastWheel = useRef(0);
  useEffect(() => {
    const el = deck.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(d) < 4) return;
      const now = performance.now();
      if (now - lastWheel.current < 700) return;
      lastWheel.current = now;
      step(d > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [step]);

  // A swipe or drag in any direction moves one cell; a drag never counts as a click on a cell.
  const drag = useRef(null);
  const dragged = useRef(false);
  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }; dragged.current = false; };
  const onPointerMove = (e) => {
    const g = drag.current;
    if (g && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 12) dragged.current = true;
  };
  const onPointerUp = (e) => {
    const g = drag.current;
    drag.current = null;
    if (!g || !dragged.current) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    if (Math.abs(d) > 40) step(d < 0 ? 1 : -1);
  };
  const onClickCapture = (e) => {
    if (dragged.current) { e.preventDefault(); e.stopPropagation(); dragged.current = false; }
  };

  const onKey = (e) => {
    if (e.target !== deck.current) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    if (e.key === 'Enter') { const a = deck.current.querySelector('.cal-cell.on .cal-open'); if (a) a.click(); }
  };

  return (
    <div className="cal-page">
      <div
        className={`cal-stage hub paper-theme${entering !== null ? ' entering' : ''}`} ref={deck} tabIndex={0} role="region"
        aria-label="ปฏิทินเมนู เลื่อนเมาส์หรือปัดเพื่อไปช่องถัดไป แล้วคลิกในช่องเพื่อเปิด"
        onKeyDown={onKey} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }} onClickCapture={onClickCapture}
        style={{ '--ax': SPOTS[active % SPOTS.length][0], '--ay': SPOTS[active % SPOTS.length][1] }}
      >
        <div className="cal-zoom">
          <div className="cal-dip" ref={dip}>
            <div className="cal-world">
              <p className="cal-month" aria-hidden>{month.title}</p>
              {WEEKDAYS.map((d, x) => <span key={d} className="cal-week" aria-hidden style={{ '--x': x }}>{d}</span>)}
              {month.days.map((d) => (
                <span key={`${d.x},${d.y}`} className={`cal-day${d.out ? ' out' : ''}${d.today ? ' today' : ''}`} aria-hidden style={{ '--x': d.x, '--y': d.y }}>
                  <b>{String(d.day).padStart(2, '0')}</b><small>{MONTHS_SHORT[d.month]}</small>
                </span>
              ))}
              {widgets.map((w, i) => <Sheet key={w.id} w={w} index={i} active={i === active} onEnter={enter} onFocusCell={setPick} />)}
            </div>
          </div>
        </div>
        <span className="cal-curtain" aria-hidden />
        <button type="button" className="hub-arrow hub-arrow-l" aria-label="ช่องก่อนหน้า" onClick={() => step(-1)}><Icon name="back" size={26} stroke={2.6} /></button>
        <button type="button" className="hub-arrow hub-arrow-r" aria-label="ช่องถัดไป" onClick={() => step(1)}><Icon name="chevron" size={26} stroke={2.6} /></button>
        <div className="cal-ui">
          <ol className="hub-dots" aria-label="ตำแหน่งในปฏิทิน">
            {widgets.map((w, i) => (
              <li key={w.id}>
                <button type="button" title={w.title} aria-label={w.title} aria-current={i === active ? 'true' : undefined} className={`wd-${w.tone}${i === active ? ' on' : ''}`} onClick={() => setPick(i)}>
                  <svg viewBox="0 0 100 100" aria-hidden>{STICKERS[w.sticker]}</svg>
                  {i === active ? <span>{w.title}</span> : null}
                </button>
              </li>
            ))}
          </ol>
          <p className="hub-hint-scroll" aria-hidden><i />เลื่อนเมาส์เพื่อไปช่องถัดไป · คลิกในช่องเพื่อเข้าโหมดนั้น</p>
        </div>
      </div>
      <FlowPage wide title="เมนู">{null}</FlowPage>
    </div>
  );
}
