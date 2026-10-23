import { signOut } from 'firebase/auth';
import { collection, query, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { useAuthUser, useHashRoute, useQueryData } from './lib/hooks.js';
import { SessionContext, useSessionData } from './lib/session.js';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Pharmacies from './pages/Pharmacies.jsx';
import Store from './pages/Store.jsx';
import Orders, { OrderDetail } from './pages/Orders.jsx';
import Meds from './pages/Meds.jsx';
import Family from './pages/Family.jsx';
import Symptom from './pages/Symptom.jsx';
import Pharmacist from './pages/Pharmacist.jsx';
import Notifications from './pages/Notifications.jsx';
import Health from './pages/Health.jsx';

const NAV = [
  ['', 'หน้าแรก', '⌂'],
  ['pharmacies', 'ร้านยา', '✚'],
  ['symptom', 'ประเมินอาการ', '♡'],
  ['meds', 'ยาของฉัน', '◷'],
  ['orders', 'คำสั่งซื้อ', '▤'],
];

function Page({ route }) {
  const [page, a] = route;
  switch (page ?? '') {
    case '': return <Home />;
    case 'pharmacies': return <Pharmacies />;
    case 'store': return <Store pharmacyId={a} />;
    case 'orders': return a ? <OrderDetail orderId={a} /> : <Orders />;
    case 'meds': return <Meds />;
    case 'family': return <Family />;
    case 'symptom': return <Symptom />;
    case 'pharmacist': return <Pharmacist />;
    case 'notifications': return <Notifications />;
    case 'health': return <Health />;
    default: return <Home />;
  }
}

function Shell({ session, route }) {
  const current = route[0] ?? '';
  const [unread] = useQueryData(
    query(collection(db, 'users', session.user.uid, 'notifications'), where('readAt', '==', null)),
    [session.user.uid],
  );
  const extra = [
    ['health', 'โปรไฟล์สุขภาพ', '✎'],
    ['family', 'ครอบครัว', '☺'],
    ['notifications', `แจ้งเตือน${unread.length ? ` (${unread.length})` : ''}`, '♪'],
    ...(session.staffOf.length ? [['pharmacist', 'ร้านของฉัน', '⚕']] : []),
  ];
  const isActive = (p) => (p === '' ? current === '' : current === p || (p === 'pharmacies' && current === 'store'));

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="เมนูหลัก">
        <a className="brand" href="#/"><span className="brand-mark">M</span>MediLink</a>
        {[...NAV, ...extra].map(([p, label, icon]) => (
          <a key={p} href={`#/${p}`} className={isActive(p) ? 'active' : ''}>
            <span className="nav-icon" aria-hidden>{icon}</span>{label}
          </a>
        ))}
        <div className="sidebar-foot stack">
          <span className="muted small truncate">{session.profile?.displayName ?? session.user.email}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => signOut(auth)}>ออกจากระบบ</button>
        </div>
      </nav>

      <div>
        <header className="topbar">
          <a className="brand" href="#/"><span className="brand-mark">M</span>MediLink</a>
          <div className="row">
            <a className="btn btn-ghost btn-sm" href="#/health" aria-label="โปรไฟล์สุขภาพ">✎</a>
            <a className="btn btn-ghost btn-sm" href="#/family" aria-label="ครอบครัว">☺</a>
            {session.staffOf.length ? <a className="btn btn-ghost btn-sm" href="#/pharmacist">⚕ ร้าน</a> : null}
            <a className="btn btn-ghost btn-sm" href="#/notifications" aria-label="แจ้งเตือน">
              ♪{unread.length ? <span className="dot" aria-label={`${unread.length} รายการใหม่`} /> : null}
            </a>
            <button className="btn btn-ghost btn-sm" onClick={() => signOut(auth)}>ออก</button>
          </div>
        </header>
        <main className="main">
          <Page route={route} />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="เมนูหลัก">
        {NAV.map(([p, label, icon]) => (
          <a key={p} href={`#/${p}`} className={isActive(p) ? 'active' : ''}>
            <span className="nav-icon" aria-hidden>{icon}</span>{label}
          </a>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const user = useAuthUser();
  const route = useHashRoute();
  const session = useSessionData(user);

  if (user === undefined) return <div className="login-wrap"><Loading /></div>;
  if (!user) return <Login />;
  if (session.loading) return <div className="login-wrap"><Loading /></div>;
  return (
    <SessionContext.Provider value={session}>
      <Shell session={session} route={route} />
    </SessionContext.Provider>
  );
}
