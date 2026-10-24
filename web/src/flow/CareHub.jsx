// Temporary home for everything that is not the ordering flow. These features
// will be folded into the main flow later; for now they sit behind one button.
import { signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import { useSession } from '../lib/session.js';
import { ConfirmButton, Icon } from '../components/ui.jsx';
import FlowPage from './FlowPage.jsx';
import { go } from '../lib/hooks.js';

const ITEMS = [
  ['profile', 'โปรไฟล์ของฉัน', 'user', 'peach'],
  ['orders', 'คำสั่งซื้อของฉัน', 'truck', 'sage'],
  ['meds', 'ยาของฉัน', 'pill', 'honey'],
  ['family', 'ครอบครัวและผู้ดูแล', 'people', 'peach'],
  ['health', 'สุขภาพรายคน', 'shield', 'rose'],
  ['notifications', 'แจ้งเตือน', 'bell', 'honey'],
  ['settings', 'ตั้งค่า', 'settings', 'sage'],
];

export default function CareHub() {
  const { user, staffOf } = useSession();
  return (
    <FlowPage title="โฮมแคร์และเมนู" onBack={() => go('')}>
      <div className="tile-grid">
        {ITEMS.map(([path, label, icon, tone]) => (
          <a key={path} className={`tile tile-${tone}`} href={`#/${path}`}>
            <span className="tile-icon"><Icon name={icon} /></span><span className="tile-label">{label}</span>
          </a>
        ))}
        {staffOf.length ? (
          <a className="tile tile-sage" href="#/pharmacist"><span className="tile-icon"><Icon name="list" /></span><span className="tile-label">งานของร้านยา</span></a>
        ) : null}
      </div>
      <p className="muted small">เมนูเพิ่มเติมของ growa: ดูคำสั่งซื้อ จัดการยา ครอบครัว โปรไฟล์ และตั้งค่า</p>
      <hr className="sep" />
      <div className="between">
        <span className="muted small truncate">{user.email}</span>
        <ConfirmButton variant="secondary" size="sm" question="ออกจากระบบ?" yes="ออกจากระบบ" onConfirm={() => signOut(auth)}>
          <Icon name="logout" size={18} />ออกจากระบบ
        </ConfirmButton>
      </div>
    </FlowPage>
  );
}
