// First sign-in: a short, friendly setup that collects who the user is and their health background, one topic per
// screen. Everything can be skipped and edited later on the profile page; skipping still saves what was typed.
import { useEffect, useRef, useState } from 'react';
import { doc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAction, useDocData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { Backdrop } from '../components/Flair.jsx';
import { Button, ErrorText, Icon, Loading } from '../components/ui.jsx';
import { SECTIONS } from './sections.jsx';
import { fromDocs, saveProfile, validate } from './model.js';

const INTRO = [
  ['shield', 'เห็นได้เฉพาะคุณ', 'ผู้ดูแลแพลตฟอร์มอ่านข้อมูลสุขภาพไม่ได้'],
  ['pill', 'สั่งยาปลอดภัยขึ้น', 'เภสัชกรเช็กการแพ้ยาและยาที่ใช้ร่วมกันให้'],
  ['clock', 'ใช้เวลา 3–4 นาที', 'ข้ามได้ทุกข้อ กลับมากรอกที่หน้าโปรไฟล์ภายหลัง'],
];

export default function Onboarding() {
  const { user, profile, patients } = useSession();
  const patient = patients.find((p) => p.isSelf && p.isOwner);
  const [health, loading] = useDocData(doc(db, 'patients', patient.id, 'health', 'profile'), [patient.id]);
  const [form, setForm] = useState(null);
  const [step, setStep] = useState(-1); // -1 = welcome screen
  const { busy, error, run, setError } = useAction();
  const heading = useRef(null);

  useEffect(() => { if (!loading && !form) setForm(fromDocs(profile, patient, health)); }, [loading, form, profile, patient, health]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }, [step]);

  if (!form) return <div className="onb"><Backdrop /><div className="onb-wrap"><Loading /></div></div>;

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(null); };
  const last = step === SECTIONS.length - 1;
  const current = SECTIONS[step];
  const Section = current?.[3];

  const save = (lenient) => run(async () => {
    await saveProfile({ uid: user.uid, user: profile, patient, form, finish: true, lenient });
    window.location.hash = '#/';
  });
  const next = () => {
    if (step === 0) { const problem = validate(form); if (problem) return setError(problem); }
    if (last) return save(false);
    setStep(step + 1);
    return undefined;
  };

  return (
    <div className="onb">
      <Backdrop />
      <div className="onb-wrap">
        <header className="onb-top">
          <span className="onb-brand">growa</span>
          {step >= 0 ? (
            <Button size="sm" variant="ghost" busy={busy} onClick={() => save(true)}>ข้ามไปก่อน</Button>
          ) : null}
        </header>

        {step >= 0 ? (
          <div className="onb-progress" role="progressbar" aria-valuemin={1} aria-valuemax={SECTIONS.length} aria-valuenow={step + 1} aria-label="ความคืบหน้า">
            {SECTIONS.map(([id], i) => <span key={id} className={i <= step ? 'on' : ''} />)}
          </div>
        ) : null}

        {step === -1 ? (
          <section className="onb-card onb-welcome">
            <div className="onb-badge" aria-hidden><Icon name="heart" size={44} /></div>
            <h1 ref={heading} tabIndex={-1}>ยินดีต้อนรับ {form.displayName ? `คุณ${form.displayName.split(' ')[0]}` : ''}</h1>
            <p className="onb-lead">เล่าให้เราฟังนิดหนึ่งว่าคุณเป็นใคร และสุขภาพเป็นอย่างไร เภสัชกรจะได้เลือกยาที่เหมาะกับคุณและเตือนเรื่องที่ควรระวัง</p>
            <ul className="onb-points">
              {INTRO.map(([icon, title, text]) => (
                <li key={title}><span className="onb-point-icon"><Icon name={icon} size={24} /></span><span><strong>{title}</strong><span className="muted">{text}</span></span></li>
              ))}
            </ul>
            <div className="onb-actions">
              <Button size="lg" block onClick={() => setStep(0)}>เริ่มกรอกข้อมูล</Button>
              <Button size="lg" block variant="ghost" busy={busy} onClick={() => save(true)}>ข้ามไปก่อน</Button>
            </div>
            <ErrorText>{error}</ErrorText>
          </section>
        ) : (
          <section className="onb-card" aria-labelledby="onb-title" key={current[0]}>
            <p className="onb-step">ขั้นที่ {step + 1} จาก {SECTIONS.length}</p>
            <h1 id="onb-title" ref={heading} tabIndex={-1}>{current[1]}</h1>
            <p className="onb-lead">{current[2]}</p>
            <Section f={form} set={set} />
            <ErrorText>{error}</ErrorText>
            <div className="onb-actions onb-row">
              <Button size="lg" variant="secondary" onClick={() => setStep(step - 1)} disabled={busy}>
                <Icon name="back" size={20} />{step === 0 ? 'กลับ' : 'ก่อนหน้า'}
              </Button>
              <Button size="lg" busy={busy} onClick={next}>{last ? 'เสร็จสิ้น เริ่มใช้งาน' : 'ถัดไป'}</Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
