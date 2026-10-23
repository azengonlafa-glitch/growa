import { signOut } from 'firebase/auth';
import { collection, query, where } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { useAuthUser, useHashRoute, useQueryData } from './lib/hooks.js';
import { SessionContext, useSessionData } from './lib/session.js';
import { Icon, Loading, Mascot } from './components/ui.jsx';
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

// The centre tab (symptom checker) is drawn as a raised round button on phones.
const NAV = [
  ['', 'หน้าแรก', 'home'],
  ['meds', 'ยา', 'pill'],
  ['symptom', 'เช็กอาการ', 'heart'],
  ['pharmacies', 'ร้านยา', 'store'],
  ['family', 'ครอบครัว', 'people'],
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
  const side = [
    ...NAV,
    ['orders', 'คำสั่งซื้อ', 'truck'],
    ['health', 'โปรไฟล์สุขภาพ', 'shield'],
    ['notifications', `แจ้งเตือน${unread.length ? ` (${unread.length})` : ''}`, 'bell'],
    ...(session.staffOf.length ? [['pharmacist', 'ร้านของฉัน', 'list']] : []),
  ];
  const isActive = (p, wide) => {
    if (p === '') return current === '';
    if (p === 'pharmacies') return current === 'pharmacies' || current === 'store' || (!wide && current === 'orders');
    if (p === 'family') return current === 'family' || (!wide && (current === 'health' || current === 'notifications'));
    return current === p;
  };

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="เมนูหลัก">
        <a className="brand" href="#/"><Mascot size={40} />MediLink</a>
        {side.map(([p, label, icon]) => (
          <a key={p} href={`#/${p}`} className={isActive(p, true) ? 'active' : ''} aria-current={isActive(p, true) ? 'page' : undefined}>
            <Icon name={icon} size={24} />{label}
          </a>
        ))}
        <div className="sidebar-foot stack">
          <span className="muted small truncate">{session.profile?.displayName ?? session.user.email}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => signOut(auth)}>ออกจากระบบ</button>
        </div>
      </nav>

      <main className="main">
        <Page route={route} />
      </main>

      <nav className="bottom-nav" aria-label="เมนูหลัก">
        {NAV.map(([p, label, icon]) => (
          p === 'symptom' ? (
            <a key={p} href={`#/${p}`} className="nav-center" aria-current={current === p ? 'page' : undefined}>
              <span className="nav-center-btn"><Icon name={icon} size={30} stroke={2.2} /></span>{label}
            </a>
          ) : (
            <a key={p} href={`#/${p}`} className={isActive(p) ? 'active' : ''} aria-current={isActive(p) ? 'page' : undefined} style={{ position: 'relative' }}>
              <Icon name={icon} stroke={isActive(p) ? 2.2 : 2} />{label}
              {p === 'family' && unread.length ? <span className="nav-badge" aria-label={`แจ้งเตือนใหม่ ${unread.length}`}>{unread.length}</span> : null}
            </a>
          )
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
