// Settings: how the app looks (day/night, text size, motion), the map, notifications, privacy and data, and the account.
// Display choices stay on this device (lib/prefs.js); notification and sharing choices are saved to the account.
import { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, call, db } from '../firebase.js';
import { useAction, useDocData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { usePrefs, savePrefs } from '../lib/prefs.js';
import { Badge, Button, Card, ConfirmButton, ErrorText, Field, Icon, PageHeader, Segmented } from '../components/ui.jsx';

const THEMES = [
  ['auto', 'ตามเครื่อง', 'ใช้ตามที่ตั้งไว้ในโทรศัพท์หรือคอมพิวเตอร์', 'phone'],
  ['light', 'กลางวัน', 'พื้นหลังสว่าง อ่านง่ายตอนแดดจ้า', 'sun'],
  ['dark', 'กลางคืน', 'พื้นหลังมืด สบายตาตอนกลางคืน', 'moon'],
  ['schedule', 'ตามเวลา', 'กลางวัน 06:00–18:00 กลางคืนช่วงที่เหลือ', 'clock'],
];
const NOTIFY = [
  ['doseReminders', 'เตือนกินยา', 'มื้อยาที่ถึงเวลาแล้วและที่ยังไม่ได้บันทึก'],
  ['refillAlerts', 'ยาใกล้หมด', 'เตือนก่อนยาหมดตามที่ประมาณไว้'],
  ['orderUpdates', 'สถานะคำสั่งซื้อและเภสัชกร', 'ร้านยืนยันสต็อก จัดส่ง และเภสัชกรตอบกลับ'],
  ['familyUpdates', 'ครอบครัวและผู้ดูแล', 'คำเชิญและการเปลี่ยนสิทธิ์ผู้ดูแล'],
];

function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <div className="toggle-row">
      <div className="toggle-text"><strong>{label}</strong>{hint ? <span className="muted small">{hint}</span> : null}</div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}

function Appearance() {
  const prefs = usePrefs();
  return (
    <Card className="stack-lg">
      <div><h2>หน้าตาแอป</h2><p className="muted small">ตั้งค่านี้จำไว้เฉพาะเครื่องนี้</p></div>
      <div className="field">
        <span className="field-label">โหมดสี</span>
        <div className="opt-grid" role="radiogroup" aria-label="โหมดสี">
          {THEMES.map(([id, label, hint, icon]) => (
            <button key={id} type="button" role="radio" aria-checked={prefs.theme === id} className={`opt${prefs.theme === id ? ' on' : ''}`} onClick={() => savePrefs({ theme: id })}>
              <span className={`opt-icon opt-${id}`}><Icon name={icon} size={26} /></span>
              <strong>{label}</strong>
              <span className="muted small">{hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">ขนาดตัวอักษร</span>
        <Segmented label="ขนาดตัวอักษร" value={prefs.textSize} onChange={(textSize) => savePrefs({ textSize })} options={[['normal', 'ปกติ'], ['large', 'ใหญ่'], ['xlarge', 'ใหญ่มาก']]} />
        <p className="text-sample">ตัวอย่างข้อความ: รับประทานหลังอาหารเช้า วันละ 1 เม็ด</p>
      </div>
      <Toggle label="ลดการเคลื่อนไหว" hint="ปิดแอนิเมชันและเอฟเฟกต์ เหมาะกับคนที่เวียนหัวง่ายหรืออยากประหยัดแบตเตอรี่" checked={prefs.motion === 'reduce'} onChange={(on) => savePrefs({ motion: on ? 'reduce' : 'auto' })} />
    </Card>
  );
}

function MapPrefs() {
  const prefs = usePrefs();
  return (
    <Card className="stack-lg">
      <div><h2>แผนที่</h2></div>
      <Toggle
        label="เปิดแผนที่ที่ตำแหน่งปัจจุบันของฉัน"
        hint="ถ้าปิด แผนที่จะเริ่มที่ที่อยู่ในโปรไฟล์ ถ้าเปิด ระบบจะขออนุญาตใช้ตำแหน่งทุกครั้งที่เปิด ตำแหน่งใช้คำนวณระยะทางบนเครื่องคุณและไม่ถูกเก็บ"
        checked={prefs.autoLocate}
        onChange={(autoLocate) => savePrefs({ autoLocate })}
      />
    </Card>
  );
}

function Notifications() {
  const { user, profile } = useSession();
  const saved = profile?.notificationPrefs ?? {};
  const { busy, error, run } = useAction();
  const set = (key, value) => run(() => updateDoc(doc(db, 'users', user.uid), { notificationPrefs: { ...saved, [key]: value } }));
  return (
    <Card className="stack-lg">
      <div><h2>การแจ้งเตือน</h2><p className="muted small">เลือกประเภทที่อยากเห็นในหน้า "แจ้งเตือน" ประเภทที่ปิดจะซ่อนไว้ ยังไม่มีการส่งแจ้งเตือนนอกแอป</p></div>
      {NOTIFY.map(([key, label, hint]) => (
        <Toggle key={key} label={label} hint={hint} checked={saved[key] !== false} disabled={busy} onChange={(on) => set(key, on)} />
      ))}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

const jsonReplacer = function replacer(key, value) {
  const raw = this[key];
  return raw?.toDate ? raw.toDate().toISOString() : value;
};

function Privacy() {
  const { user, profile, patients } = useSession();
  const self = patients.find((p) => p.isSelf && p.isOwner);
  const healthRef = self ? doc(db, 'patients', self.id, 'health', 'profile') : null;
  const [health, loading] = useDocData(healthRef, [self?.id]);
  const share = useAction();
  const dump = useAction();

  const setShare = (on) => share.run(async () => {
    const consent = { ...(health?.consent ?? {}), shareWithPharmacist: on, updatedAt: serverTimestamp() };
    if (health) await updateDoc(healthRef, { consent, updatedAt: serverTimestamp(), updatedBy: user.uid });
    else await setDoc(healthRef, { allergies: [], conditions: [], notes: '', consent, updatedAt: serverTimestamp(), updatedBy: user.uid });
  });

  // Everything the account owns that the app can read, as one JSON file the user keeps.
  const download = () => dump.run(async () => {
    const mine = patients.filter((p) => p.isOwner);
    const people = await Promise.all(mine.map(async (p) => {
      const [h, meds] = await Promise.all([
        getDoc(doc(db, 'patients', p.id, 'health', 'profile')),
        getDocs(collection(db, 'patients', p.id, 'medications')),
      ]);
      return { profile: { id: p.id, displayName: p.displayName, birthYear: p.birthYear ?? null, isSelf: p.isSelf }, health: h.data() ?? null, medications: meds.docs.map((d) => ({ id: d.id, ...d.data() })) };
    }));
    const orders = await getDocs(query(collection(db, 'orders'), where('placedBy', '==', user.uid)));
    const data = { exportedAt: new Date(), account: { email: user.email, ...profile }, people, orders: orders.docs.map((d) => ({ id: d.id, ...d.data() })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, jsonReplacer, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `growa-ข้อมูลของฉัน-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  return (
    <Card className="stack-lg">
      <div><h2>ความเป็นส่วนตัวและข้อมูลของฉัน</h2></div>
      <Toggle
        label="ให้เภสัชกรเห็นข้อมูลสุขภาพเมื่อฉันสั่งยา"
        hint="อายุ เพศ น้ำหนัก ประวัติแพ้ยา โรคประจำตัว และยาที่ใช้อยู่ เฉพาะร้านที่ฉันสั่งหรือขอคำปรึกษา ถ้าปิด เภสัชกรอาจต้องถามเพิ่มก่อนจ่ายยา"
        checked={health?.consent?.shareWithPharmacist !== false}
        disabled={share.busy || loading || !self}
        onChange={setShare}
      />
      <ErrorText>{share.error}</ErrorText>
      <div className="row">
        <a className="btn btn-secondary" href="#/profile"><Icon name="user" size={20} />แก้ข้อมูลส่วนตัวและสุขภาพ</a>
        <Button variant="secondary" busy={dump.busy} onClick={download}><Icon name="list" size={20} />ดาวน์โหลดข้อมูลของฉัน</Button>
      </div>
      <ErrorText>{dump.error}</ErrorText>
      <p className="muted small">ไฟล์ดาวน์โหลดมีข้อมูลบัญชี โปรไฟล์สุขภาพ ยา และคำสั่งซื้อของคุณ เก็บไว้ในที่ปลอดภัย</p>
    </Card>
  );
}

const authMessage = (e) => (/wrong-password|invalid-credential|invalid-login/.test(e?.code ?? '') ? 'รหัสผ่านปัจจุบันไม่ถูกต้อง'
  : /weak-password/.test(e?.code ?? '') ? 'รหัสผ่านใหม่ง่ายเกินไป ใช้อย่างน้อย 6 ตัวอักษร'
    : /too-many-requests/.test(e?.code ?? '') ? 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่' : e?.message);

function Password() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [done, setDone] = useState(false);
  const { busy, error, run, setError } = useAction();

  const submit = (e) => {
    e.preventDefault();
    setDone(false);
    if (next.length < 6) return setError('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
    if (next !== again) return setError('รหัสผ่านใหม่สองช่องไม่ตรงกัน');
    return run(async () => {
      try {
        await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, current));
        await updatePassword(auth.currentUser, next);
      } catch (err) { throw new Error(authMessage(err)); }
      setCurrent(''); setNext(''); setAgain(''); setOpen(false); setDone(true);
    });
  };

  if (!open) {
    return (
      <div className="row">
        <Button variant="secondary" onClick={() => { setOpen(true); setDone(false); }}><Icon name="shield" size={20} />เปลี่ยนรหัสผ่าน</Button>
        {done ? <Badge tone="good">เปลี่ยนรหัสผ่านแล้ว</Badge> : null}
      </div>
    );
  }
  return (
    <form className="stack" onSubmit={submit}>
      <Field label="รหัสผ่านปัจจุบัน"><input type="password" autoComplete="current-password" value={current} onChange={(e) => { setCurrent(e.target.value); setError(null); }} required /></Field>
      <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 6 ตัวอักษร"><input type="password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setError(null); }} required minLength={6} /></Field>
      <Field label="พิมพ์รหัสผ่านใหม่อีกครั้ง"><input type="password" autoComplete="new-password" value={again} onChange={(e) => { setAgain(e.target.value); setError(null); }} required /></Field>
      <ErrorText>{error}</ErrorText>
      <div className="row">
        <Button type="submit" busy={busy}>บันทึกรหัสผ่านใหม่</Button>
        <Button variant="ghost" onClick={() => { setOpen(false); setError(null); }} disabled={busy}>ยกเลิก</Button>
      </div>
    </form>
  );
}

function DeleteAccount() {
  const [typed, setTyped] = useState('');
  const { busy, error, run } = useAction();
  const WORD = 'ลบบัญชี';
  return (
    <details className="danger-zone">
      <summary>ลบบัญชีและข้อมูลทั้งหมด</summary>
      <div className="stack">
        <p>การลบจะเอาโปรไฟล์สุขภาพ ยา และการเชื่อมกับผู้ดูแลออกถาวร กู้คืนไม่ได้ คำสั่งซื้อเก่ายังอยู่ที่ร้านตามที่กฎหมายกำหนดแต่จะไม่มีที่อยู่ของคุณ</p>
        <Field label={`พิมพ์ "${WORD}" เพื่อยืนยัน`}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button variant="danger" busy={busy} disabled={typed.trim() !== WORD} onClick={() => run(async () => { await call('deleteAccount', { confirm: 'DELETE' }); await signOut(auth); })}>
          ลบบัญชีถาวร
        </Button>
      </div>
    </details>
  );
}

function Account() {
  const { user } = useSession();
  return (
    <Card className="stack-lg">
      <div><h2>บัญชี</h2></div>
      <div className="kv"><span className="muted">อีเมล</span><strong className="truncate">{user.email}</strong></div>
      <Password />
      <hr className="sep" />
      <ConfirmButton variant="secondary" question="ออกจากระบบ?" yes="ออกจากระบบ" onConfirm={() => signOut(auth)}>
        <Icon name="logout" size={20} />ออกจากระบบ
      </ConfirmButton>
      <DeleteAccount />
    </Card>
  );
}

function About() {
  return (
    <Card className="stack">
      <h2>ช่วยเหลือและข้อมูลระบบ</h2>
      <ul className="info-list">
        <li><Icon name="phone" size={20} /><span>เหตุฉุกเฉินทางการแพทย์ โทร <a href="tel:1669" className="num">1669</a> · สายด่วนสุขภาพจิต <a href="tel:1323" className="num">1323</a></span></li>
        <li><Icon name="shield" size={20} /><span>คำแนะนำในแอปเป็นข้อมูลประกอบ ไม่ใช่การวินิจฉัยโรค เภสัชกรเป็นผู้ตัดสินการจ่ายยาเสมอ</span></li>
        <li><Icon name="store" size={20} /><span>ร้านค้า สินค้า ราคา รีวิว การชำระเงิน และการจัดส่งที่ติดป้าย "ข้อมูลจำลอง" สร้างไว้เพื่อสาธิต</span></li>
      </ul>
      <p className="muted small">growa · ต้นแบบสำหรับการแข่งขัน ยังไม่ใช่บริการจริง</p>
    </Card>
  );
}

export default function Settings() {
  return (
    <div className="stack-lg settings-page">
      <PageHeader title="ตั้งค่า" subtitle="ปรับหน้าตา การแจ้งเตือน ความเป็นส่วนตัว และบัญชีของคุณ" />
      <Appearance />
      <MapPrefs />
      <Notifications />
      <Privacy />
      <Account />
      <About />
    </div>
  );
}
