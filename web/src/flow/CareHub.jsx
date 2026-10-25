// Main menu (#/care) as a deck of widgets, one per mode. Scroll the mouse wheel (or swipe) and the deck snaps to the
// next card; tap a card anywhere to open that part of the app. Each card has its own layout for what it does.
// Numbers come from data the app already loads for the signed-in person (today's doses, low stock, people); the
// order, notification and health cards describe what is inside instead of inventing counts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import { useSession } from '../lib/session.js';
import { useMeds, useTodaySchedule, isLow } from '../lib/meds.js';
import { Icon } from '../components/ui.jsx';
import { DeskPage } from './Desk.jsx';
import FlowPage from './FlowPage.jsx';
import { go } from '../lib/hooks.js';
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

// Counts up to `value` once its card becomes the active one.
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

// A small round link on top of the card (the card itself is the main link).
function Round({ href, icon, label, onClick }) {
  const body = (<><span className="wd-round-btn"><Icon name={icon} size={24} /></span><span className="wd-round-label">{label}</span></>);
  return href
    ? <a className="wd-round" href={href}>{body}</a>
    : <button type="button" className="wd-round" onClick={onClick}>{body}</button>;
}

// ───────── per-mode bodies ─────────
function MedsBody({ taken, total, marks, active }) {
  const shown = useCountUp(taken, active);
  return (
    <>
      <div className="wd-big"><b>{shown}</b><small>/ {total} มื้อวันนี้</small></div>
      <div className="wd-strip">
        <span className="wd-strip-tag">{total ? `กินแล้ว ${taken}` : 'ตารางยา'}</span>
        <ol>
          {marks.map((m) => (
            <li key={m.key}>
              <span className="wd-mark-top">{m.top}</span>
              <span className="wd-mark-line"><i className={m.done ? 'done' : ''} /></span>
              <span className="wd-mark-bottom">{m.bottom}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function OrderBody({ first }) {
  return (
    <div className="wd-order">
      <div className="wd-order-art" aria-hidden>
        <span className="o-bubble o-b1"><Icon name="pill" size={30} /></span>
        <span className="o-bubble o-b2"><Icon name="bag" size={30} /></span>
        <span className="o-bubble o-b3"><Icon name="store" size={30} /></span>
      </div>
      <p className="wd-order-hi">{greeting()}</p>
      <p className="wd-order-name">{first}</p>
      <p className="wd-order-sub">เลือกร้านยาใกล้บ้าน แล้วสั่งยาหรือของใช้ได้เลย</p>
    </div>
  );
}

function NotifyBody({ active }) {
  const rows = [['bell', 'ถึงเวลากินยา', 'เตือนตามตารางที่คุณตั้ง'], ['pill', 'ยาใกล้หมด', 'เตือนก่อนหมดตามจำนวนวันที่ตั้ง'], ['truck', 'สถานะออเดอร์', 'ร้านยืนยัน จัดส่ง ถึงบ้าน']];
  return (
    <ul className="wd-notes">
      {rows.map(([icon, t, d], i) => (
        <li key={t} style={{ '--i': i }} className={active ? 'in' : ''}>
          <span className="wd-note-ico"><Icon name={icon} size={20} /></span>
          <span><b>{t}</b><small>{d}</small></span>
          <i className="wd-note-dot" />
        </li>
      ))}
    </ul>
  );
}

function OrdersBody({ active }) {
  const stages = ['ร้านตรวจสต็อก', 'เภสัชกรอนุมัติ', 'ชำระเงิน', 'จัดส่ง', 'ถึงบ้าน'];
  return (
    <div className={`wd-track${active ? ' go' : ''}`}>
      <div className="wd-track-line"><i /><span className="wd-truck"><Icon name="truck" size={26} /></span></div>
      <ol>{stages.map((s) => <li key={s}><i /><span>{s}</span></li>)}</ol>
      <p className="wd-track-note"><Icon name="shield" size={16} />ยาที่ต้องตรวจ จะเก็บเงินหลังเภสัชกรอนุมัติเท่านั้น</p>
    </div>
  );
}

function FamilyBody({ names, count, invites, house }) {
  return (
    <div className="wd-family">
      <div className="wd-avatars" aria-hidden>
        {names.slice(0, 5).map((n, i) => <span key={`${n}-${i}`} style={{ '--i': i }}>{n.slice(0, 1).toUpperCase()}</span>)}
        {count > 5 ? <span className="more">+{count - 5}</span> : null}
      </div>
      <p className="wd-family-count">{house ? <><b>{house.memberUids.length}</b> สมาชิกในบ้าน</> : <><b>{count}</b> โปรไฟล์</>}</p>
      <p className="wd-family-sub">{house ? `${house.name} · ${count} โปรไฟล์ผู้ป่วย` : invites ? `มีคำเชิญรอตอบ ${invites} รายการ` : 'สร้างบ้านหรือเข้าร่วมด้วยรหัสเชิญ 8 หลัก'}</p>
    </div>
  );
}

function HealthBody({ first, email }) {
  const chips = [['shield', 'ประวัติแพ้ยา'], ['info', 'โรคประจำตัว'], ['pill', 'ยาที่ใช้อยู่']];
  return (
    <div className="wd-health">
      <div className="wd-shield" aria-hidden><span /><span /><Icon name="shield" size={56} stroke={1.8} /></div>
      <p className="wd-account-name">{first}</p>
      <p className="wd-account-mail">{email}</p>
      <ul>{chips.map(([icon, t]) => <li key={t}><Icon name={icon} size={18} />{t}</li>)}</ul>
      <p className="wd-health-note">เห็นได้เฉพาะเจ้าของและผู้ดูแลที่ได้รับสิทธิ์ ผู้ดูแลระบบอ่านไม่ได้</p>
    </div>
  );
}

function AccountBody({ first, email, askOut, setAskOut }) {
  return (
    <div className="wd-account">
      <span className="wd-me" aria-hidden>{first.slice(0, 1).toUpperCase()}</span>
      <p className="wd-account-name">{first}</p>
      <p className="wd-account-mail">{email}</p>
      {askOut ? (
        <div className="wd-confirm" role="alertdialog" aria-label="ยืนยันออกจากระบบ">
          <span>ออกจากระบบ?</span>
          <button type="button" className="wd-yes" onClick={() => signOut(auth)}>ออกจากระบบ</button>
          <button type="button" className="wd-no" onClick={() => setAskOut(false)}>ไม่ออก</button>
        </div>
      ) : (
        <div className="wd-actions">
          <Round href="#/settings" icon="settings" label="ตั้งค่า" />
          <Round icon="logout" label="ออกจากระบบ" onClick={() => setAskOut(true)} />
        </div>
      )}
    </div>
  );
}

function Widget({ w, active, index, onPick }) {
  const [mode, setMode] = useState(w.modes?.[0]?.id);
  const cur = w.modes?.find((m) => m.id === mode) ?? w.modes?.[0];
  const href = cur?.href ?? w.href;
  return (
    <section className={`wd wd-${w.tone}${active ? ' on' : ''}`} data-index={index} aria-label={w.title}>
      <span className="wd-tab" aria-hidden><i /><i /><i /></span>
      <header className="wd-head">
        <span className="wd-ico" aria-hidden><Icon name={w.icon} size={26} /></span>
        <div>
          <h2><a className="wd-open" href={href} onClick={(e) => { if (!active) { e.preventDefault(); onPick(index); } }}>{w.title}</a></h2>
          <p>{w.desc}</p>
        </div>
      </header>
      {w.modes ? (
        <div className="wd-modes" role="group" aria-label={`โหมดของ${w.title}`}>
          {w.modes.map((m) => (
            <button key={m.id} type="button" aria-pressed={m.id === cur.id} className={m.id === cur.id ? 'on' : ''} onClick={() => setMode(m.id)}>{m.label}</button>
          ))}
        </div>
      ) : null}
      <div className="wd-body" key={cur?.id}>{(cur?.body ?? w.body)(active)}</div>
      <footer className="wd-bottom">
        <div className="wd-actions">{(w.actions ?? []).map((a) => <Round key={a.label} {...a} />)}</div>
        <span className="wd-go" aria-hidden>เปิด<Icon name="chevron" size={18} stroke={2.6} /></span>
      </footer>
    </section>
  );
}

export default function CareHub() {
  const { user, profile, staffOf, patients, invitations, house } = useSession();
  const self = patients.find((p) => p.isSelf) ?? patients[0];
  const [meds] = useMeds(self?.id);
  const [slots] = useTodaySchedule(self?.id, meds);
  const [askOut, setAskOut] = useState(false);
  const deck = useRef(null);
  const [active, setActive] = useState(0);
  const raf = useRef(0);

  const name = (profile?.displayName ?? '').trim();
  const first = name.split(/\s+/)[0] || user.email?.split('@')[0] || 'คุณ';

  const jump = useCallback((i) => {
    const s = deck.current?.querySelectorAll('.wd')[i];
    s?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, []);

  const widgets = useMemo(() => {
    const taken = slots.filter((s) => s.log?.status === 'taken').length;
    const low = meds.filter(isLow).length;
    const marks = slots.length
      ? slots.slice(0, 4).map((s) => ({ key: `${s.at}-${s.med.id}`, top: s.time, bottom: s.med.name.length > 9 ? `${s.med.name.slice(0, 8)}…` : s.med.name, done: s.log?.status === 'taken' }))
      : [{ key: 'none', top: 'วันนี้', bottom: meds.length ? 'ไม่มีมื้อยา' : 'ยังไม่มียา' }];
    const names = patients.map((p) => (p.displayName || '—').split(/\s+/)[0]);
    const list = [
      {
        id: 'order', tone: 'green', icon: 'store', title: 'สั่งยาและสินค้า', href: '#/',
        desc: 'เลือกร้านยาใกล้คุณ ประเมินอาการ หรือเลือกของใช้',
        body: () => <OrderBody first={first} />, actions: [{ href: '#/', icon: 'pill', label: 'สั่งยา' }, { href: '#/', icon: 'bag', label: 'ของใช้ทั่วไป' }],
      },
      {
        id: 'meds', tone: 'honey', icon: 'pill', title: 'สุขภาพและยา', href: '#/meds',
        desc: low ? `ยาใกล้หมด ${low} รายการ · ยา ประวัติแพ้ยา และโปรไฟล์ของคุณและครอบครัว` : `ยาทั้งหมด ${meds.length} รายการ · ประวัติแพ้ยา และโปรไฟล์ของคุณและครอบครัว`,
        modes: [
          { id: 'meds', label: 'ยา', href: '#/meds', body: (a) => <MedsBody taken={taken} total={slots.length} marks={marks} active={a} /> },
          { id: 'health', label: 'สุขภาพและโปรไฟล์', href: '#/health', body: () => <HealthBody first={first} email={user.email ?? ''} /> },
        ],
        actions: [],
      },
      {
        id: 'notifications', tone: 'blue', icon: 'bell', title: 'แจ้งเตือน', href: '#/notifications',
        desc: 'สิ่งที่ระบบจะบอกคุณ ยังไม่มีการแจ้งเตือนนอกแอป',
        body: (a) => <NotifyBody active={a} />, actions: [],
      },
      {
        id: 'orders', tone: 'green', icon: 'truck', title: 'คำสั่งซื้อ', href: '#/orders',
        desc: 'ติดตามตั้งแต่สั่งจนถึงบ้าน และดูใบเสร็จ (ข้อมูลจำลอง)',
        body: (a) => <OrdersBody active={a} />, actions: [],
      },
      {
        id: 'family', tone: 'peach', icon: 'people', title: house ? house.name : 'บ้านและครอบครัว', href: '#/family',
        desc: house ? 'สมาชิก ผู้ป่วย กิจกรรม และการเตือนของบ้าน' : 'ให้หลายคนช่วยกันดูแลผู้ป่วยคนเดียวกัน',
        body: () => <FamilyBody names={names} count={patients.length} invites={invitations.length} house={house} />, actions: [],
      },
      {
        id: 'account', tone: 'green', icon: 'user', title: 'บัญชีและตั้งค่า', href: '#/settings',
        desc: 'ธีมเช้า/กลางคืน รหัสผ่าน และการออกจากระบบ',
        body: () => <AccountBody first={first} email={user.email ?? ''} askOut={askOut} setAskOut={setAskOut} />, actions: [],
      },
    ];
    if (staffOf.length) {
      list.unshift({
        id: 'pharmacy', tone: 'green', icon: 'list', title: 'งานของร้านยา', href: '#/pharmacist',
        desc: `${staffOf[0].pharmacy?.name ?? 'ร้านยา'} · คำสั่งซื้อใหม่ คิวประเมิน การจัดส่ง`,
        body: (a) => <OrdersBody active={a} />, actions: [],
      });
    }
    return list;
  }, [slots, meds, patients, invitations, staffOf, first, user.email, askOut, house]);

  // Which card sits closest to the middle of the deck.
  const onScroll = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = deck.current;
      if (!el) return;
      const mid = el.scrollTop + el.clientHeight / 2;
      let best = 0; let bestD = Infinity;
      el.querySelectorAll('.wd').forEach((s, i) => {
        const d = Math.abs(s.offsetTop + s.offsetHeight / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      setActive(best);
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // One wheel notch = one card (like turning a dial). At the first/last card the wheel scrolls the page again.
  const activeRef = useRef(0);
  const lastWheel = useRef(0);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => {
    const el = deck.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      const n = el.querySelectorAll('.wd').length;
      const next = activeRef.current + (e.deltaY > 0 ? 1 : -1);
      if (next < 0 || next >= n) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel.current < 650) return;
      lastWheel.current = now;
      jump(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [jump]);

  const onKey = (e) => {
    if (e.target !== deck.current) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); jump(Math.min(widgets.length - 1, active + 1)); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); jump(Math.max(0, active - 1)); }
  };

  return (
    <DeskPage>
    <FlowPage wide title="เมนู" onBack={() => go('')}>
      <div className="hub paper-theme">
        <div className="hub-deck" ref={deck} onScroll={onScroll} onKeyDown={onKey} tabIndex={0} role="region" aria-label="เมนูแบบวิดเจ็ต เลื่อนขึ้นลงเพื่อเปลี่ยนการ์ด แล้วแตะการ์ดเพื่อเปิด">
          {widgets.map((w, i) => <Widget key={w.id} w={w} index={i} active={i === active} onPick={jump} />)}
        </div>
        <ol className="hub-dots" aria-label="ตำแหน่งการ์ด">
          {widgets.map((w, i) => (
            <li key={w.id}><button type="button" aria-label={w.title} aria-current={i === active ? 'true' : undefined} className={i === active ? 'on' : ''} onClick={() => jump(i)} /></li>
          ))}
        </ol>
        <p className="hub-hint-scroll" aria-hidden><i />เลื่อนเมาส์เพื่อเปลี่ยนการ์ด · คลิกการ์ดเพื่อเปิด</p>
      </div>
    </FlowPage>
    </DeskPage>
  );
}
