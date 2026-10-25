import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db, isProduction } from '../firebase.js';
import { useAction } from '../lib/hooks.js';
import { Button, ErrorText, Field, Icon, Segmented } from '../components/ui.jsx';
import PicnicLawn from './PicnicLawn.jsx';
import './Login.css';

// Demo accounts: seeded by `npm run seed` in the emulator, created on first tap on a real project.
const DEMO_PASSWORD = 'demo-medilink';
const DEMO = [
  ['mom@demo.test', 'คุณแม่', 'ผู้ป่วย มียาความดันใกล้หมด', 'heart'],
  ['daughter@demo.test', 'ลูกสาว', 'ผู้ดูแลของคุณแม่', 'people'],
  ['pharmacist@demo.test', 'เภสัชกร', 'ร้านพาร์ทเนอร์ตัวอย่าง รับออเดอร์และประเมินยา', 'pill'],
];

// Default delivery address for new demo users, a few km from the sample pharmacies so the delivery map shows a route.
const DEFAULT_ADDRESS = { label: 'บ้าน', line1: 'ย่านเพชรบุรี–มักกะสัน (ข้อมูลจำลอง)', geo: { lat: 13.7450, lng: 100.5520 } };

// The gingham lining hangs over the basket edge: a slightly wavy outline with a scoop on each side
// where the wicker handle shows through. Built once as a clip-path so it scales with any screen.
function clothOutline() {
  const n = 26;
  const wave = (i, seed) => (Math.sin(i * 1.7 + seed) * 2.2 + Math.sin(i * 3.1 + seed * 2) * 1.2).toFixed(1);
  const scoop = (t) => {
    const d = Math.abs(t - 0.5) / 0.11;
    return d >= 1 ? 0 : (1 - d * d) ** 1.5;
  };
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(`calc(${(i / n) * 100}% + 0px) calc(0% + ${wave(i, 1)}px)`);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    pts.push(`calc(100% - var(--scoop) * ${scoop(t).toFixed(3)} + ${wave(i, 2)}px) ${(t * 100).toFixed(2)}%`);
  }
  for (let i = n - 1; i >= 0; i--) pts.push(`${(i / n) * 100}% calc(100% + ${wave(i, 3)}px)`);
  for (let i = n - 1; i >= 1; i--) {
    const t = i / n;
    pts.push(`calc(0% + var(--scoop) * ${scoop(t).toFixed(3)} + ${wave(i, 4)}px) ${(t * 100).toFixed(2)}%`);
  }
  return `polygon(${pts.join(', ')})`;
}
const CLOTH = clothOutline();

const FLOWERS = [
  [9, 16, 1, 0.2], [18, 74, 0.8, 0.5], [88, 14, 0.9, 0.4], [94, 52, 0.75, 0.7], [82, 88, 1.1, 1.1], [44, 95, 0.8, 0.9],
];

function Flower({ x, y, scale, delay }) {
  return (
    <span className="daisy" style={{ left: `${x}%`, top: `${y}%`, '--s': scale, '--d': `${delay}s` }}>
      <svg viewBox="0 0 40 40" aria-hidden>
        {[0, 90, 180, 270].map((r) => (
          <ellipse key={r} cx="20" cy="10.5" rx="7.2" ry="9.5" fill="#fffdf4" transform={`rotate(${r + 45} 20 20)`} />
        ))}
        <circle cx="20" cy="20" r="4.4" fill="#f4e7a6" />
        <circle cx="20" cy="20" r="2.2" fill="#e9cf6a" />
      </svg>
    </span>
  );
}

function Butterfly({ className }) {
  return (
    <span className={`butterfly ${className}`} aria-hidden>
      <span className="wing wing-l" /><span className="wing wing-r" />
    </span>
  );
}

export default function Login() {
  const [mode, setMode] = useState('demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const { busy, error, run } = useAction();

  const signIn = (e, p) => run(() => signInWithEmailAndPassword(auth, e, p));

  // New account with its own profile. The first-time profile setup opens by itself (the user doc has no onboardedAt yet).
  const createAccount = async (accountEmail, accountPassword, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, accountEmail, accountPassword);
    await updateProfile(cred.user, { displayName });
    const uid = cred.user.uid;
    const patientId = `${uid}-self`;
    const batch = writeBatch(db);
    batch.set(doc(db, 'patients', patientId), {
      ownerUid: uid, isSelf: true, displayName, archived: false, createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', uid), {
      displayName, email: accountEmail, selfPatientId: patientId, addresses: [DEFAULT_ADDRESS], createdAt: serverTimestamp(),
    });
    await batch.commit();
    window.location.hash = '#/';
  };

  const signUp = () => run(() => createAccount(email, password, name));

  // Demo buttons: the seeded accounts only exist in the emulator, so on a real project the first tap creates the demo account
  // (public password, no real data) and every later tap signs in to it.
  const demoSignIn = (demoEmail, demoName) => run(async () => {
    try {
      await signInWithEmailAndPassword(auth, demoEmail, DEMO_PASSWORD);
    } catch (err) {
      if (!['auth/invalid-credential', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(err?.code)) throw err;
      try {
        await createAccount(demoEmail, DEMO_PASSWORD, demoName);
      } catch (createErr) {
        // The account exists with another password: report the original sign-in problem.
        throw createErr?.code === 'auth/email-already-in-use' ? err : createErr;
      }
    }
  });

  return (
    <div className="meadow">
      <div className="meadow-art" aria-hidden>
        <PicnicLawn />
        <span className="grain" />
        {FLOWERS.map(([x, y, s, d]) => <Flower key={`${x}-${y}`} x={x} y={y} scale={s} delay={d} />)}
        <Butterfly className="bf-a" />
        <Butterfly className="bf-b" />
      </div>

      <div className="basket">
        <span className="handle handle-l" aria-hidden />
        <span className="handle handle-r" aria-hidden />
        <div className="cloth" style={{ clipPath: CLOTH }} aria-hidden>
          <span className="wall wall-t" /><span className="wall wall-r" />
          <span className="wall wall-b" /><span className="wall wall-l" />
          <span className="floor" />
          <span className="inner-shade" />
          <span className="fold" />
        </div>
        <span className="toast toast-a" aria-hidden><i /></span>
        <span className="toast toast-b" aria-hidden><i /></span>

        <main className="basket-inside">
          <div className="note">
            <span className="tape tape-l" aria-hidden /><span className="tape tape-r" aria-hidden />
            <header className="note-head">
              <h1 className="note-brand">growa</h1>
              <p className="note-tagline">ร้านยาใกล้บ้าน เภสัชกรช่วยดูแล และระบบดูแลยาของครอบครัว</p>
            </header>

            <Segmented
              label="วิธีเข้าใช้งาน"
              value={mode}
              onChange={setMode}
              options={[['demo', 'บัญชีเดโม'], ['signin', 'เข้าสู่ระบบ'], ['signup', 'สมัครสมาชิก']]}
            />

            <div className="note-body" key={mode}>
              {mode === 'demo' ? (
                <>
                  <p className="note-hint">เลือกบทบาทเพื่อทดลองใช้งาน <span className="note-mock">บัญชีทดสอบ</span></p>
                  <div className="tags">
                    {DEMO.map(([e, label, desc, icon], i) => (
                      <Button key={e} variant="secondary" className="tag" style={{ '--n': i }} busy={busy} onClick={() => demoSignIn(e, label)}>
                        <span className="tag-icon" aria-hidden><Icon name={icon} size={22} /></span>
                        <span className="tag-text"><strong>{label}</strong><span>{desc}</span></span>
                        <span className="tag-go" aria-hidden>›</span>
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <form
                  className="note-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    return mode === 'signin' ? signIn(email, password) : signUp();
                  }}
                >
                  {mode === 'signup' ? (
                    <Field label="ชื่อที่แสดง">
                      <input name="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
                    </Field>
                  ) : null}
                  <Field label="อีเมล">
                    <input
                      type="email" name="email" inputMode="email" spellCheck={false} required
                      value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                    />
                  </Field>
                  <Field label="รหัสผ่าน" hint={mode === 'signup' ? 'อย่างน้อย 6 ตัวอักษร' : null}>
                    <input
                      type="password" name="password" required minLength={6}
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    />
                  </Field>
                  <Button type="submit" className="btn btn-primary btn-lg btn-block note-submit" busy={busy}>
                    {mode === 'signin' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
                  </Button>
                </form>
              )}
            </div>
            <ErrorText>{error}</ErrorText>

            <p className="note-sticker">
              <strong>ต้นแบบสำหรับ Hackathon</strong>
              {isProduction ? 'ระบบนี้เป็นต้นแบบ ข้อมูลร้านและสินค้าเป็นข้อมูลจำลอง' : 'ระบบนี้ทำงานบน Firebase Emulator ในเครื่อง'}
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
