// Notification inbox. Only the look changed: the data, the per-type settings and the actions are the same as before.
// What a person needs to trust it: what happened and when (exact time on hover/long-press, relative time on the row),
// what is still unread, where each one leads, and an honest note that these live inside the app only.
import { useMemo, useState } from 'react';
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
    <div className="stack-lg notif">
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
    </div>
  );
}
