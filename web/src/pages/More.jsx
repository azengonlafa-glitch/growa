// Everything that is not a daily task: ordering medicines, orders, the house, the report, settings. The demo time
// simulator lives here too (only where the demo simulators are allowed).
import { call, isProduction } from '../firebase.js';
import { useAction, useFlash } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { Button, Card, Flash, Icon, Notice, PageHeader } from '../components/ui.jsx';
import './home.css';

const DEMO = !isProduction || import.meta.env.VITE_DEMO_SIMULATION === 'true';

const LINKS = [
  ['#/', 'search', 'สั่งซื้อยา', 'หาร้านยาที่ได้รับอนุญาตใกล้คุณ'],
  ['#/orders', 'truck', 'คำสั่งซื้อ', 'ติดตามการจัดส่งและบิล'],
  ['#/house', 'people', 'บ้านและครอบครัว', 'สมาชิก รหัสเชิญ โปรไฟล์ผู้ป่วย'],
  ['#/report', 'list', 'รายงานการใช้ยา', 'ความสม่ำเสมอ 7 / 30 วัน พิมพ์ให้หมอ'],
  ['#/health', 'heart', 'สุขภาพของฉัน', 'โรคประจำตัว ผลวิเคราะห์ ประวัติอาการ'],
  ['#/settings', 'settings', 'ตั้งค่า', 'บัญชีและการแสดงผล'],
];

// Pretend it is later, so the "forgot to log" reminders can be shown without waiting for a real dose to pass.
function TimeSimulator({ inHouse }) {
  const sim = useAction();
  const [flash, setFlash] = useFlash(6000);
  const run = (minutes) => sim.run(async () => {
    const res = await call('checkOverdueDoses', { simulateNowMs: Date.now() + minutes * 60e3 });
    setFlash(res?.sent ? `ส่งแจ้งเตือนแล้ว ${res.sent} รายการ (ดูที่แท็บแจ้งเตือน)` : 'ไม่มีมื้อที่เลยเวลาในช่วงนั้น หรือเคยแจ้งไปแล้ว');
  });
  return (
    <section className="stack" aria-label="จำลองเวลา">
      <h2>จำลองเวลา (สำหรับสาธิต)</h2>
      <Card className="mr-sim">
        <p className="muted">ทดลองให้ระบบทำเหมือนเวลาผ่านไป เพื่อดูการแจ้งเตือนมื้อยาที่ยังไม่บันทึก ไม่ได้เปลี่ยนข้อมูลจริงของใคร นอกจากส่งแจ้งเตือน</p>
        {!inHouse ? <Notice tone="info" title="ต้องอยู่ในบ้านก่อน">สร้างหรือเข้าร่วมบ้านที่หน้าบ้านและครอบครัว แล้วจึงจำลองการแจ้งเตือนได้</Notice> : null}
        <div className="mr-sim-row">
          {[[45, 'อีก 45 นาที'], [90, 'อีก 1.5 ชั่วโมง'], [180, 'อีก 3 ชั่วโมง'], [480, 'อีก 8 ชั่วโมง']].map(([m, label]) => (
            <Button key={m} size="sm" variant="secondary" busy={sim.busy} disabled={!inHouse} onClick={() => run(m)}><Icon name="clock" size={18} />{label}</Button>
          ))}
        </div>
        {sim.error ? <Notice tone="bad" title="จำลองไม่สำเร็จ">{sim.error}</Notice> : null}
        {flash ? <Flash>{flash}</Flash> : null}
      </Card>
    </section>
  );
}

export default function More() {
  const { house, staffOf } = useSession();
  return (
    <div className="stack-lg">
      <PageHeader title="เพิ่มเติม" subtitle="ทุกอย่างในระบบอยู่ตรงนี้ ส่วนที่ใช้ทุกวันอยู่ที่แท็บด้านล่าง" />
      <nav className="mr-grid" aria-label="เมนูทั้งหมด">
        {[...LINKS, ...(staffOf?.length ? [['#/pharmacist', 'store', 'ร้านของฉัน', 'จัดการคำสั่งซื้อของร้าน']] : [])].map(([href, icon, title, hint]) => (
          <a key={href} href={href}>
            <span className="mr-ico"><Icon name={icon} size={24} /></span>
            <span><strong>{title}</strong><span className="muted small">{hint}</span></span>
          </a>
        ))}
      </nav>
      {DEMO ? <TimeSimulator inHouse={Boolean(house)} /> : null}
    </div>
  );
}
