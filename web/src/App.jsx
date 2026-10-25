import { useEffect, useRef, useState } from 'react';
import { useAuthUser, useHashRoute } from './lib/hooks.js';
import { call } from './firebase.js';
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
import MyCare from './pages/MyCare.jsx';
import Home from './pages/Home.jsx';
import More from './pages/More.jsx';
import TabBar from './components/TabBar.jsx';
import House from './pages/House.jsx';
import Report from './pages/Report.jsx';
import Pharmacist from './pages/Pharmacist.jsx';
import Notifications from './pages/Notifications.jsx';
import Settings from './pages/Settings.jsx';
import Onboarding from './profile/Onboarding.jsx';

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
  care: ['โฮมแคร์และหน้ารวมโหมด', CareHub],
};

// Existing pages that are not part of the flow yet; they open from the care hub.
const CARE_TITLES = {
  home: 'หน้าหลัก', care: 'หน้ารวมโหมด', more: 'เพิ่มเติม',
  profile: 'สุขภาพและยา', settings: 'ตั้งค่า', orders: 'คำสั่งซื้อ', meds: 'สุขภาพและยา', family: 'บ้านและครอบครัว', house: 'บ้านและครอบครัว', report: 'รายงานการใช้ยา', health: 'สุขภาพและยา',
  notifications: 'แจ้งเตือน', pharmacist: 'ร้านของฉัน',
};

function CarePage({ route }) {
  const [page, a] = route;
  switch (page) {
    case 'home': return <Home />;
    case 'care': return <CareHub />;
    case 'more': return <More />;
    case 'orders': return a ? <OrderDetail orderId={a} /> : <Orders />;
    case 'meds': return <MyCare tab="meds" />;
    case 'family': case 'house': return <House />;
    case 'report': return <Report />;
    case 'health': return <MyCare tab="health" />;
    case 'profile': return <MyCare tab="health" />;
    case 'settings': return <Settings />;
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
          <nav className="care-bar" aria-label="แถบนำทาง">
            <a className="btn btn-secondary btn-sm" href="#/care">‹ หน้ารวมโหมด (โฮมแคร์)</a>
            <a className="btn btn-ghost btn-sm" href="#/">สั่งซื้อยา</a>
          </nav>
          <TabBar page={page} />
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
  // First sign-in: collect the profile before showing the app (skippable; the user doc gets onboardedAt either way).
  const [setupDismissed, setSetupDismissed] = useState(() => { try { return sessionStorage.getItem('growaSetupSkipped') === '1'; } catch { return false; } });
  const needsSetup = ready && !setupDismissed && Boolean(session.profile) && !session.profile.onboardedAt && session.patients.some((p) => p.isSelf && p.isOwner);
  const dismissSetup = () => { try { sessionStorage.setItem('growaSetupSkipped', '1'); } catch { /* ignore */ } setSetupDismissed(true); };
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

  // Doses nobody has logged tell the whole house after the time the owner set. There is no server scheduler on the free plan,
  // so while someone has the app open it asks the server to check (idempotent; each reminder is sent once per round).
  const houseId = session.house?.id ?? null;
  useEffect(() => {
    if (!ready || !houseId) return undefined;
    const ping = () => call('checkOverdueDoses', {}).catch(() => {});
    ping();
    const t = setInterval(ping, 5 * 60e3);
    return () => clearInterval(t);
  }, [ready, houseId]);

  if (user === undefined) return <Launch phase="loading" />;
  if (!user) return <Login />;
  return (
    <>
      {ready ? (
        <SessionContext.Provider value={session}>
          {needsSetup ? <Onboarding onLeave={dismissSetup} /> : (
            <FlowProvider>
              <Shell route={route} />
            </FlowProvider>
          )}
        </SessionContext.Provider>
      ) : null}
      {phase !== 'done' ? <Launch phase={ready ? phase : 'loading'} /> : null}
    </>
  );
}
