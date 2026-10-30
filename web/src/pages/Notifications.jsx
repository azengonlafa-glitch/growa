// Notification inbox, shown as a letter: on arrival a green envelope opens and the letter slides out (skippable, and
// skipped under reduced motion), then the inbox is that letter. Only the look changed: the data, the per-type settings
// and the actions are the same as before.
// What a person needs to trust it: what happened and when (exact time on hover/long-press, relative time on the row),
// what is still unread, where each one leads, and an honest note that these live inside the app only.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { call, db } from '../firebase.js';
import { go, useAction, useQueryData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { timeAgo } from '../lib/format.js';
import { bangkokDayStart, DAY_MS } from '../../../functions/src/schedule.js';
import { Button, ConfirmButton, Empty, Icon, PageHeader, Segmented } from '../components/ui.jsx';
import './notifications.css';

// Which notification setting controls each type (all on unless the user turned it off in Settings).
const PREF_OF = (type = '') => (type.startsWith('dose') ? 'doseReminders' : type === 'refill_due' ? 'refillAlerts'
  : type === 'order_status' || type === 'review_pending' ? 'orderUpdates' : type === 'caregiver_change' || type === 'house_change' || type === 'house_invite' ? 'familyUpdates' : null);

// [label, tone, icon, group]
const TYPE = {
  dose_unlogged: ['ยังไม่ได้บันทึก', 'warn', 'clock', 'meds'],
  dose_missed: ['พลาดมื้อยา', 'bad', 'pill', 'meds'],
  refill_due: ['ยาใกล้หมด', 'bad', 'pill', 'meds'],
  order_status: ['คำสั่งซื้อ', 'info', 'truck', 'orders'],
  review_pending: ['เภสัชกร', 'info', 'shield', 'orders'],
  caregiver_change: ['ครอบครัว', 'good', 'people', 'family'],
  dose_overdue: ['เลยเวลากินยา', 'bad', 'clock', 'meds'],
  house_change: ['บ้าน', 'good', 'people', 'family'],
  house_invite: ['ชวนเข้าบ้าน', 'info', 'people', 'family'],
};
const FALLBACK = ['ทั่วไป', 'neutral', 'bell', 'other'];

const FILTERS = [['all', 'ทั้งหมด'], ['unread', 'ยังไม่อ่าน'], ['meds', 'ยา'], ['orders', 'คำสั่งซื้อ'], ['family', 'ครอบครัว']];

const clock = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
const full = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' });

// small drawings for the envelope and the letter
const Flower = ({ petals = '#f6c945', heart = '#e8892f', size = 48, className = '' }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
    {[0, 60, 120, 180, 240, 300].map((a) => <ellipse key={a} cx="50" cy="26" rx="15" ry="22" fill={petals} transform={`rotate(${a} 50 50)`} />)}
    <circle cx="50" cy="50" r="15" fill={heart} />
  </svg>
);
const Smile = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden fill="none" stroke="#f0a020" strokeWidth="9" strokeLinecap="round">
    <path d="M36 22 v20 M64 22 v20 M18 58 q32 34 64 0" />
  </svg>
);
const Gift = () => (
  <svg width="64" height="64" viewBox="0 0 100 100" aria-hidden>
    <rect x="12" y="34" width="76" height="56" rx="6" fill="#ee7b45" />
    <rect x="8" y="26" width="84" height="16" rx="4" fill="#f08a57" />
    <path d="M50 26 V90 M12 60 H88" stroke="#fde7d6" strokeWidth="8" />
    <path d="M50 26 c-14 -20 -32 -6 -16 0 Z M50 26 c14 -20 32 -6 16 0 Z" fill="#fde7d6" />
  </svg>
);

const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37) % 100, top: (i * 53 + 11) % 100, size: 8 + ((i * 7) % 12),
  color: ['#f6c945', '#ee7b45', '#7cc7ee', '#f6c945', '#1aa64f'][i % 5], delay: (i % 7) * 0.12,
}));

// The party table behind the letter: confetti, streamers, a marker pen and a gift box. Purely decorative.
const PARTY_COLORS = ['#f0473c', '#f6c945', '#38b6c9', '#2f7de1', '#f08a3c', '#1aa64f'];
const DOTS = Array.from({ length: 46 }, (_, i) => {
  const x = (i * 61 + 7) % 100;
  return { x, y: (i * 37 + (i % 5) * 9) % 100, r: 0.5 + ((i * 13) % 9) / 10, c: PARTY_COLORS[i % PARTY_COLORS.length], sq: i % 4 === 0 };
}).filter((d) => d.x < 30 || d.x > 70 || d.y < 8);
const SQUIGGLES = [
  [6, 70, 20, '#f6c945'], [88, 12, -30, '#f0473c'], [92, 58, 15, '#38b6c9'], [12, 22, 40, '#f08a3c'], [80, 88, -10, '#f6c945'], [22, 92, 60, '#2f7de1'],
];
function PartyBg() {
  return (
    <div className="nt-party" aria-hidden>
      <svg className="nt-party-bits" viewBox="0 0 100 100" preserveAspectRatio="none">
        {DOTS.map((d, i) => (d.sq
          ? <rect key={i} x={d.x} y={d.y} width={d.r * 1.3} height={d.r * 0.7} rx="0.2" fill={d.c} transform={`rotate(${i * 23} ${d.x} ${d.y})`} />
          : <ellipse key={i} cx={d.x} cy={d.y} rx={d.r * 0.55} ry={d.r} fill={d.c} />))}
      </svg>
      {SQUIGGLES.map(([x, y, turn, c]) => (
        <svg key={`${x}-${y}`} className="nt-squiggle" style={{ left: `${x}%`, top: `${y}%`, rotate: `${turn}deg` }} viewBox="0 0 60 120" width="34" height="68">
          <path d="M30 4 c18 10 -18 20 0 30 s-18 20 0 30 s-18 20 0 30 s-18 16 0 22" fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" />
        </svg>
      ))}
      <svg className="nt-pen" viewBox="0 0 300 60">
        <rect x="40" y="10" width="210" height="40" rx="12" fill="#3f4a78" />
        <rect x="200" y="10" width="26" height="40" fill="#8fd3e3" />
        <rect x="226" y="10" width="44" height="40" rx="10" fill="#2c3560" />
        <path d="M40 18 L8 30 L40 42 Z" fill="#c9cfe0" /><path d="M8 30 l9 -4 v8 z" fill="#2c3560" />
      </svg>
      <svg className="nt-gift" viewBox="0 0 160 170">
        <rect x="10" y="50" width="140" height="112" rx="10" fill="#f08a3c" />
        <rect x="4" y="34" width="152" height="30" rx="8" fill="#f6a35a" />
        <path d="M80 34 V162" stroke="#2f7de1" strokeWidth="18" />
        <path d="M80 34 c-30 -40 -64 -12 -30 0 Z M80 34 c30 -40 64 -12 30 0 Z" fill="#2f7de1" />
        <text x="118" y="140" fontSize="20" fontFamily="Mitr, sans-serif" fontWeight="700" fill="#fff" transform="rotate(-90 118 140)">ของขวัญ</text>
      </svg>
    </div>
  );
}

// The envelope opening: flap lifts, the letter rises, the scene fades into the page. Click anywhere (or the button) to skip.
function EnvelopeIntro({ count, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3100);
    const key = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') onDone(); };
    window.addEventListener('keydown', key);
    return () => { clearTimeout(t); window.removeEventListener('keydown', key); };
  }, [onDone]);
  return (
    <div className="env-scene" onClick={onDone}>
      <span className="env-confetti" aria-hidden>
        {CONFETTI.map((c, i) => <i key={i} style={{ left: `${c.left}%`, top: `${c.top}%`, width: c.size, height: c.size, background: c.color, animationDelay: `${c.delay}s` }} />)}
      </span>
      <div className="env" aria-hidden>
        <span className="env-back" />
        <div className="env-letter">
          <Flower size={30} petals="#1aa64f" heart="#1aa64f" className="env-l-f1" />
          <p>{count ? <>มีเรื่องใหม่<br /><b>{count} เรื่อง</b></> : <>จดหมาย<br /><b>ถึงคุณ</b></>}</p>
          <Smile />
        </div>
        <span className="env-pocket">
          <span className="env-sticker env-s1"><Gift /></span>
          <span className="env-sticker env-s2"><Flower size={66} petals="#f6c945" heart="#e8892f" /></span>
          <span className="env-sticker env-s3"><Flower size={54} petals="#2f7de1" heart="#f6c945" /></span>
        </span>
        <span className="env-flap" />
      </div>
      <p className="env-say" role="status">กำลังเปิดจดหมายแจ้งเตือน…</p>
      <button type="button" className="env-skip" onClick={onDone}>ข้าม</button>
    </div>
  );
}

function whereTo(n) {
  if (n.orderId) return ['#/orders/' + n.orderId, 'ดูคำสั่งซื้อ'];
  if (n.type?.startsWith('dose') || n.type === 'refill_due') return ['#/meds', n.type === 'refill_due' ? 'ดูยาและขอเติมยา' : 'บันทึกการกินยา'];
  return [null, null];
}

function Row({ n }) {
  const accept = useAction();
  const [label, tone, icon] = TYPE[n.type] ?? FALLBACK;
  const [href, cta] = whereTo(n);
  const ms = n.createdAt?.toMillis?.() ?? null;
  const read = Boolean(n.readAt);
  // A reminder about someone else's medicine opens that person's page.
  const markRead = () => {
    if (n.patientId) { try { sessionStorage.setItem('medsPatient', n.patientId); } catch { /* storage may be blocked */ } }
    if (!read) updateDoc(n.ref, { readAt: serverTimestamp() });
  };
  const body = (
    <>
      <span className={`nt-ico nt-${tone}`} aria-hidden><Icon name={icon} size={22} /></span>
      <span className="nt-main">
        <span className="nt-top">
          <span className={`nt-tag nt-${tone}`}>{label}</span>
          {!read ? <span className="nt-new" role="img" aria-label="ยังไม่อ่าน">ใหม่</span> : null}
          <time className="nt-time" dateTime={ms ? new Date(ms).toISOString() : undefined} title={ms ? full.format(ms) : undefined}>
            {timeAgo(n.createdAt)}{ms ? ` · ${clock.format(ms)} น.` : ''}
          </time>
        </span>
        <strong className="nt-title">{n.title}</strong>
        {n.body ? <span className="nt-body">{n.body}</span> : null}
        {href ? <span className="nt-cta">{cta}<Icon name="chevron" size={16} stroke={2.6} /></span> : null}
        {n.type === 'house_invite' && n.houseCode ? (
          <span className="nt-accept">
            <Button size="sm" busy={accept.busy} onClick={() => accept.run(async () => { await call('joinHouse', { code: n.houseCode }); await updateDoc(n.ref, { readAt: serverTimestamp() }); go('family'); })}>เข้าร่วมบ้าน</Button>
            {accept.error ? <span className="error-text">{accept.error}</span> : null}
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <li className={`nt${read ? '' : ' unread'}`}>
      {href
        ? <a className="nt-card" href={href} onClick={markRead}>{body}</a>
        : <div className="nt-card">{body}{!read ? <button type="button" className="nt-mark" onClick={markRead}>ทำเครื่องหมายว่าอ่านแล้ว</button> : null}</div>}
      <ConfirmButton size="sm" variant="ghost" question="ลบแจ้งเตือนนี้?" yes="ลบ" no="ไม่ลบ" ariaLabel={`ลบแจ้งเตือน ${n.title}`} onConfirm={() => deleteDoc(n.ref)}>
        <Icon name="close" size={20} />
      </ConfirmButton>
    </li>
  );
}

// "วันนี้" / "เมื่อวาน" / "ก่อนหน้านี้" by Bangkok calendar day
function groupOf(n, today) {
  const ms = n.createdAt?.toMillis?.();
  if (ms == null || ms >= today) return 'วันนี้';
  return ms >= today - DAY_MS ? 'เมื่อวาน' : 'ก่อนหน้านี้';
}

export default function Notifications() {
  const { user, profile } = useSession();
  const prefs = profile?.notificationPrefs ?? {};
  const [filter, setFilter] = useState('all');
  const [intro, setIntro] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const closeIntro = useCallback(() => setIntro(false), []);
  const first = (profile?.displayName ?? '').trim().split(/\s+/)[0] || 'คุณ';
  const [all, loading] = useQueryData(
    query(collection(db, 'users', user.uid, 'notifications'), orderBy('createdAt', 'desc'), limit(50)), [user.uid],
  );
  const rows = all.filter((n) => prefs[PREF_OF(n.type)] !== false);
  const hidden = all.length - rows.length;
  const unread = rows.filter((n) => !n.readAt);
  const markAll = () => unread.forEach((n) => updateDoc(n.ref, { readAt: serverTimestamp() }));

  const shown = rows.filter((n) => filter === 'all' ? true : filter === 'unread' ? !n.readAt : (TYPE[n.type] ?? FALLBACK)[3] === filter);
  const today = bangkokDayStart(Date.now());
  const groups = useMemo(() => {
    const g = new Map();
    for (const n of shown) { const k = groupOf(n, today); g.set(k, [...(g.get(k) ?? []), n]); }
    return ['วันนี้', 'เมื่อวาน', 'ก่อนหน้านี้'].filter((k) => g.has(k)).map((k) => [k, g.get(k)]);
  }, [shown, today]);
  const count = (key) => (key === 'all' ? rows.length : key === 'unread' ? unread.length : rows.filter((n) => (TYPE[n.type] ?? FALLBACK)[3] === key).length);

  return (
    <div className={`notif nt-envelope${intro ? ' is-opening' : ''}`}>
      <PartyBg />
      {intro ? <EnvelopeIntro count={unread.length} onDone={closeIntro} /> : null}
      <span className="nt-flap" aria-hidden />
      <article className="nt-letter stack-lg">
      <Flower size={58} className="nt-fl nt-fl-1" />
      <Flower size={40} petals="#2f7de1" heart="#f6c945" className="nt-fl nt-fl-2" />
      <Flower size={34} petals="#1aa64f" heart="#1aa64f" className="nt-fl nt-fl-3" />
      <span className="nt-stamp" aria-hidden><Flower size={38} petals="#ee7b45" heart="#f6c945" /><b>growa</b></span>
      <p className="nt-dear">ถึง {first}</p>
      <PageHeader
        eyebrow={unread.length ? `ยังไม่ได้อ่าน ${unread.length} รายการ` : 'อ่านครบแล้ว'}
        title="แจ้งเตือน"
        actions={unread.length ? <Button size="sm" variant="secondary" onClick={markAll}><Icon name="check" size={18} stroke={2.6} />อ่านทั้งหมด</Button> : null}
      />

      {rows.length ? (
        <>
          <Segmented label="กรองแจ้งเตือน" value={filter} onChange={setFilter} options={FILTERS.map(([k, l]) => [k, `${l} ${count(k)}`])} />
          {groups.length ? groups.map(([day, list]) => (
            <section key={day} className="nt-group" aria-label={day}>
              <h2 className="nt-day">{day}</h2>
              <ul className="nt-list">{list.map((n) => <Row key={n.id} n={n} />)}</ul>
            </section>
          )) : <Empty icon="check" title="ไม่มีรายการในหมวดนี้" />}
        </>
      ) : loading ? null : (
        <Empty icon="bell" title="ยังไม่มีการแจ้งเตือน">
          เมื่อถึงเวลากินยา ยาใกล้หมด สถานะคำสั่งซื้อเปลี่ยน หรือมีการเปลี่ยนแปลงเรื่องครอบครัว จะแสดงที่นี่
        </Empty>
      )}

      <p className="nt-note"><Icon name="info" size={16} />แจ้งเตือนแสดงในแอปนี้เท่านั้น ยังไม่มีการส่งเข้ามือถือหรืออีเมล เปิดแอปเพื่อดูเวลากินยา ปรับว่าจะรับเรื่องใดได้ใน <a href="#/settings">ตั้งค่า</a></p>
      {hidden ? <p className="muted small">ซ่อนแจ้งเตือน {hidden} รายการตามที่ตั้งไว้ · <a href="#/settings">เปลี่ยนในตั้งค่า</a></p> : null}
      <p className="nt-sign">ด้วยความห่วงใย<br /><b>growa</b> <Smile size={30} /></p>
      </article>
    </div>
  );
}
