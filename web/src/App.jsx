import { useEffect, useRef, useState } from 'react';
import { useAuthUser, useHashRoute } from './lib/hooks.js';
import { SessionContext, useSessionData } from './lib/session.js';
import { Backdrop } from './components/Flair.jsx';
import Launch from './components/Launch.jsx';
import { FlowProvider } from './flow/state.jsx';
import MapStep from './flow/MapStep.jsx';
import ChooseStep from './flow/ChooseStep.jsx';
import ShopStep from './flow/ShopStep.jsx';
import TriageStep from './flow/TriageStep.jsx';
import ResultStep from './flow/ResultStep.jsx';
import ConsultStep from './flow/ConsultStep.jsx';
import CheckoutStep from './flow/CheckoutStep.jsx';
import OrderStep from './flow/OrderStep.jsx';
import CareHub from './flow/CareHub.jsx';
import Login from './pages/Login.jsx';
import Orders, { OrderDetail } from './pages/Orders.jsx';
import Meds from './pages/Meds.jsx';
import Family from './pages/Family.jsx';
import Pharmacist from './pages/Pharmacist.jsx';
import Notifications from './pages/Notifications.jsx';
import Health from './pages/Health.jsx';

// How long the green launch screen stays up once the app is ready, before the circle opens.
const LAUNCH_HOLD_MS = 4000;

// Ordering flow, one decision per screen: map → choose → questions → result → (consult) → checkout → track (stock, pay, courier map).
const FLOW = {
  '': ['เลือกร้านยา', MapStep],
  pharmacies: ['เลือกร้านยา', MapStep],
  choose: ['เลือกประเภท', ChooseStep],
  shop: ['ของทั่วไปในร้านยา', ShopStep],
  triage: ['ตอบคำถามอาการ', TriageStep],
  result: ['ผลการประเมิน', ResultStep],
  consult: ['คุยกับเภสัชกร', ConsultStep],
  checkout: ['ตรวจรายการสั่งซื้อ', CheckoutStep],
  track: ['ติดตามคำสั่งซื้อ', OrderStep],
  care: ['โฮมแคร์และเมนู', CareHub],
};

// Existing pages that are not part of the flow yet; they open from the care hub.
const CARE_TITLES = {
  orders: 'คำสั่งซื้อ', meds: 'ยาของฉัน', family: 'ครอบครัว', health: 'โปรไฟล์สุขภาพ',
  notifications: 'แจ้งเตือน', pharmacist: 'ร้านของฉัน',
};

function CarePage({ route }) {
  const [page, a] = route;
  switch (page) {
    case 'orders': return a ? <OrderDetail orderId={a} /> : <Orders />;
    case 'meds': return <Meds />;
    case 'family': return <Family />;
    case 'health': return <Health />;
    case 'notifications': return <Notifications />;
    case 'pharmacist': return <Pharmacist />;
    default: return null;
  }
}

function Shell({ route }) {
  const page = route[0] ?? '';
  const mainRef = useRef(null);
  const firstRender = useRef(true);
  const routeKey = route.join('/');
  const flow = FLOW[page] ?? (CARE_TITLES[page] ? null : FLOW['']);
  const Step = flow?.[1];
  const title = flow?.[0] ?? CARE_TITLES[page] ?? '';

  // Hash navigation does not reload the page, so announce the new page ourselves.
  useEffect(() => {
    document.title = `${title} · growa`;
    if (firstRender.current) { firstRender.current = false; return; }
    mainRef.current?.focus({ preventScroll: true });
  }, [routeKey, title]);

  return (
    <div className="shell">
      <Backdrop />
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>ข้ามไปยังเนื้อหาหลัก</button>
      {Step ? (
        <main className="flow-main" id="main" ref={mainRef} tabIndex={-1}><Step /></main>
      ) : (
        <main className="main care-main" id="main" ref={mainRef} tabIndex={-1}>
          <nav className="care-bar" aria-label="กลับ">
            <a className="btn btn-secondary btn-sm" href="#/care">‹ โฮมแคร์และเมนู</a>
            <a className="btn btn-ghost btn-sm" href="#/">สั่งซื้อยา</a>
          </nav>
          <CarePage route={route} />
        </main>
      )}
    </div>
  );
}

export default function App() {
  const user = useAuthUser();
  const route = useHashRoute();
  const session = useSessionData(user);
  const ready = Boolean(user) && !session.loading;
  // loading → (app ready, brand shown long enough) reveal → done; signing out starts it over.
  const [phase, setPhase] = useState('loading');

  useEffect(() => {
    if (!user) { setPhase('loading'); return undefined; }
    if (!ready || phase === 'done') return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = phase === 'loading'
      ? setTimeout(() => setPhase('reveal'), reduced ? 0 : LAUNCH_HOLD_MS)
      : setTimeout(() => setPhase('done'), reduced ? 0 : 1100);
    return () => clearTimeout(t);
  }, [user, ready, phase]);

  if (user === undefined) return <Launch phase="loading" />;
  if (!user) return <Login />;
  return (
    <>
      {ready ? (
        <SessionContext.Provider value={session}>
          <FlowProvider>
            <Shell route={route} />
          </FlowProvider>
        </SessionContext.Provider>
      ) : null}
      {phase !== 'done' ? <Launch phase={ready ? phase : 'loading'} /> : null}
    </>
  );
}
