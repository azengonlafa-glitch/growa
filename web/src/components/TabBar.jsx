// Tab row at the top of every care page: the four places people go all the time, one tap away. The flow screens (map, ordering) have their own bar and do not show this one.
import { collection, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useQueryData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { Icon } from './ui.jsx';
import '../tabbar.css';

const TABS = [
  ['home', '#/home', 'หน้าหลัก', 'home'],
  ['meds', '#/meds', 'รายการยา', 'pill'],
  ['notifications', '#/notifications', 'แจ้งเตือน', 'bell'],
  ['more', '#/more', 'เพิ่มเติม', 'list'],
];

// Which tab a page belongs under.
const TAB_OF = { care: 'home', home: 'home', meds: 'meds', health: 'meds', profile: 'meds', report: 'meds', notifications: 'notifications' };

export default function TabBar({ page }) {
  const { user } = useSession();
  const [unread] = useQueryData(query(collection(db, 'users', user.uid, 'notifications'), where('readAt', '==', null), limit(20)), [user.uid]);
  const current = TAB_OF[page] ?? 'more';
  return (
    <nav className="tabbar" aria-label="เมนูหลัก">
      {TABS.map(([id, href, label, icon]) => (
        <a key={id} href={href} className={id === current ? 'on' : ''} aria-current={id === current ? 'page' : undefined}>
          <span className="tabbar-ico"><Icon name={icon} size={24} stroke={id === current ? 2.6 : 2} />
            {id === 'notifications' && unread.length ? <b className="tabbar-badge" aria-label={`ยังไม่อ่าน ${unread.length}`}>{unread.length > 9 ? '9+' : unread.length}</b> : null}
          </span>
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
