import { collection, deleteDoc, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useQueryData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { timeAgo } from '../lib/format.js';
import { Badge, Button, Card, ConfirmButton, Empty, Icon, PageHeader } from '../components/ui.jsx';

// Which notification setting controls each type (all on unless the user turned it off in Settings).
const PREF_OF = (type = '') => (type.startsWith('dose') ? 'doseReminders' : type === 'refill_due' ? 'refillAlerts'
  : type === 'order_status' || type === 'review_pending' ? 'orderUpdates' : type === 'caregiver_change' ? 'familyUpdates' : null);

const TYPE = {
  dose_unlogged: ['ยังไม่ได้บันทึก', 'warn'],
  dose_missed: ['พลาดมื้อยา', 'bad'],
  refill_due: ['ยาใกล้หมด', 'bad'],
  order_status: ['คำสั่งซื้อ', 'info'],
  review_pending: ['เภสัชกร', 'info'],
  caregiver_change: ['ครอบครัว', 'good'],
};

export default function Notifications() {
  const { user, profile } = useSession();
  const prefs = profile?.notificationPrefs ?? {};
  const [all] = useQueryData(
    query(collection(db, 'users', user.uid, 'notifications'), orderBy('createdAt', 'desc'), limit(50)), [user.uid],
  );
  const rows = all.filter((n) => prefs[PREF_OF(n.type)] !== false);
  const hidden = all.length - rows.length;
  const markRead = (n) => !n.readAt && updateDoc(n.ref, { readAt: serverTimestamp() });
  const unread = rows.filter((n) => !n.readAt);

  return (
    <div className="stack-lg">
      <PageHeader
        title="แจ้งเตือน"
        actions={unread.length ? <Button size="sm" variant="secondary" onClick={() => unread.forEach(markRead)}>อ่านทั้งหมด</Button> : null}
      />
      {rows.length ? (
        <Card>
          <div className="list">
            {rows.map((n) => {
              const [label, tone] = TYPE[n.type] ?? ['ทั่วไป', 'neutral'];
              const href = n.orderId ? `#/orders/${n.orderId}` : n.type?.startsWith('dose') || n.type === 'refill_due' ? '#/meds' : null;
              return (
                <div key={n.id} className="list-item">
                  {(() => {
                    const content = (
                      <>
                        <div className="row"><Badge tone={tone}>{label}</Badge>{!n.readAt ? <span className="dot" role="img" aria-label="ยังไม่อ่าน" /> : null}</div>
                        <strong style={n.readAt ? { fontWeight: 500 } : null}>{n.title}</strong>
                        <p className="small">{n.body}</p>
                        <span className="muted small">{timeAgo(n.createdAt)}</span>
                      </>
                    );
                    return href
                      ? <a className="list-item-main" href={href} onClick={() => markRead(n)} style={{ color: 'inherit' }}>{content}</a>
                      : <div className="list-item-main">{content}{!n.readAt ? <Button size="sm" variant="ghost" onClick={() => markRead(n)}>ทำเครื่องหมายว่าอ่านแล้ว</Button> : null}</div>;
                  })()}
                  <ConfirmButton size="sm" variant="ghost" question="ลบแจ้งเตือนนี้?" yes="ลบ" ariaLabel={`ลบแจ้งเตือน ${n.title}`} onConfirm={() => deleteDoc(n.ref)}><Icon name="close" size={20} /></ConfirmButton>
                </div>
              );
            })}
          </div>
        </Card>
      ) : <Empty icon="bell" title="ยังไม่มีการแจ้งเตือน" />}
      {hidden ? <p className="muted small">ซ่อนแจ้งเตือน {hidden} รายการตามที่ตั้งไว้ · <a href="#/settings">เปลี่ยนในตั้งค่า</a></p> : null}
    </div>
  );
}
