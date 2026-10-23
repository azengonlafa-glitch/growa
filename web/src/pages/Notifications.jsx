import { collection, deleteDoc, limit, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useQueryData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { timeAgo } from '../lib/format.js';
import { Badge, Button, Card, Empty, PageHeader } from '../components/ui.jsx';

const TYPE = {
  dose_unlogged: ['ยังไม่ได้บันทึก', 'warn'],
  dose_missed: ['พลาดมื้อยา', 'bad'],
  refill_due: ['ยาใกล้หมด', 'bad'],
  order_status: ['คำสั่งซื้อ', 'info'],
  review_pending: ['เภสัชกร', 'info'],
  caregiver_change: ['ครอบครัว', 'good'],
};

export default function Notifications() {
  const { user } = useSession();
  const [rows] = useQueryData(
    query(collection(db, 'users', user.uid, 'notifications'), orderBy('createdAt', 'desc'), limit(50)), [user.uid],
  );
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
                <div key={n.id} className="list-item" style={n.readAt ? { opacity: 0.65 } : null}>
                  <a className="list-item-main" href={href ?? undefined} onClick={() => markRead(n)} style={{ color: 'inherit' }}>
                    <div className="row"><Badge tone={tone}>{label}</Badge>{!n.readAt ? <span className="dot" aria-label="ยังไม่อ่าน" /> : null}</div>
                    <strong>{n.title}</strong>
                    <p className="small">{n.body}</p>
                    <span className="muted small">{timeAgo(n.createdAt)}</span>
                  </a>
                  <Button size="sm" variant="ghost" onClick={() => deleteDoc(n.ref)} aria-label="ลบการแจ้งเตือน">✕</Button>
                </div>
              );
            })}
          </div>
        </Card>
      ) : <Empty icon="♪" title="ยังไม่มีการแจ้งเตือน" />}
    </div>
  );
}
