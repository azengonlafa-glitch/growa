import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { useAction } from '../lib/hooks.js';
import { Button, Card, ErrorText, Field, MockBadge, Notice, Segmented } from '../components/ui.jsx';

// Emulator-only demo accounts created by `npm run seed`.
const DEMO_PASSWORD = 'demo-medilink';
const DEMO = [
  ['mom@demo.test', 'คุณแม่', 'ผู้ป่วย มียาความดันใกล้หมด'],
  ['daughter@demo.test', 'ลูกสาว', 'ผู้ดูแลของคุณแม่'],
  ['pharmacist@demo.test', 'เภสัชกร', 'ร้านพาร์ทเนอร์ demoRx1'],
];

// Victory Monument area, used as the default delivery address for new demo users.
const DEFAULT_ADDRESS = { label: 'บ้าน', line1: 'ย่านอนุสาวรีย์ชัยฯ (ข้อมูลจำลอง)', geo: { lat: 13.7639, lng: 100.5375 } };

export default function Login() {
  const [mode, setMode] = useState('demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const { busy, error, run } = useAction();

  const signIn = (e, p) => run(() => signInWithEmailAndPassword(auth, e, p));

  const signUp = () => run(async () => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    const uid = cred.user.uid;
    const patientId = `${uid}-self`;
    const batch = writeBatch(db);
    batch.set(doc(db, 'patients', patientId), {
      ownerUid: uid, isSelf: true, displayName: name, archived: false, createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', uid), {
      displayName: name, email, selfPatientId: patientId, addresses: [DEFAULT_ADDRESS], createdAt: serverTimestamp(),
    });
    await batch.commit();
  });

  return (
    <div className="login-wrap">
      <div className="login-card stack-lg">
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="brand-mark" style={{ width: 52, height: 52, fontSize: '1.5rem', borderRadius: 14 }}>M</span>
          <h1>MediLink</h1>
          <p className="muted">ร้านยาใกล้บ้าน เภสัชกรช่วยดูแล และระบบดูแลยาของครอบครัว</p>
        </div>

        <Card className="stack">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[['demo', 'บัญชีเดโม'], ['signin', 'เข้าสู่ระบบ'], ['signup', 'สมัครสมาชิก']]}
          />

          {mode === 'demo' ? (
            <div className="stack">
              <p className="muted">เลือกบทบาทเพื่อทดลองใช้งาน <MockBadge label="บัญชีทดสอบ" /></p>
              <div className="demo-accounts">
                {DEMO.map(([e, label, desc]) => (
                  <Button key={e} variant="secondary" className="btn btn-secondary demo-account" busy={busy} onClick={() => signIn(e, DEMO_PASSWORD)}>
                    <span className="stack" style={{ gap: 0 }}>
                      <strong>{label}</strong>
                      <span className="muted small">{desc}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); return mode === 'signin' ? signIn(email, password) : signUp(); }}>
              {mode === 'signup' ? (
                <Field label="ชื่อที่แสดง"><input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
              ) : null}
              <Field label="อีเมล"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
              <Field label="รหัสผ่าน" hint={mode === 'signup' ? 'อย่างน้อย 6 ตัวอักษร' : null}>
                <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
              </Field>
              <Button type="submit" busy={busy}>{mode === 'signin' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</Button>
            </form>
          )}
          <ErrorText>{error}</ErrorText>
        </Card>

        <Notice tone="warn" title="ต้นแบบสำหรับ Hackathon">
          ระบบนี้ทำงานบน Firebase Emulator ในเครื่อง ร้านพาร์ทเนอร์ สินค้า ราคา การชำระเงิน และการจัดส่งเป็นข้อมูลจำลอง
          ไม่ใช่บริการทางการแพทย์จริง หากมีอาการฉุกเฉินโทร 1669
        </Notice>
      </div>
    </div>
  );
}
