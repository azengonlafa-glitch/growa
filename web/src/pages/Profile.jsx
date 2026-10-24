// My profile: everything collected in the first-time setup, editable any time, plus how complete it is.
import { useEffect, useMemo, useRef, useState } from 'react';
import { doc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAction, useDocData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { Badge, Button, Card, Empty, ErrorText, Icon, Loading, PageHeader } from '../components/ui.jsx';
import { SECTIONS } from '../profile/sections.jsx';
import { SEX, ageOf, bmiOf, completeness, fromDocs, saveProfile } from '../profile/model.js';

export default function Profile() {
  const { user, profile, patients } = useSession();
  const patient = patients.find((p) => p.isSelf && p.isOwner);
  const [health, loading] = useDocData(patient ? doc(db, 'patients', patient.id, 'health', 'profile') : null, [patient?.id]);
  const remote = useMemo(() => fromDocs(profile, patient, health), [profile, patient, health]);
  const [form, setForm] = useState(null);
  const base = useRef('');
  const [saved, setSaved] = useState(false);
  const { busy, error, run, setError } = useAction();

  // Follow the stored data until the user starts editing; never overwrite their typing.
  const dirty = form !== null && JSON.stringify(form) !== base.current;
  useEffect(() => {
    if (loading) return;
    if (form === null || !dirty) { setForm(remote); base.current = JSON.stringify(remote); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote, loading]);

  if (!patient) return <Empty icon="user" title="ยังไม่มีโปรไฟล์ของคุณ">ลองออกจากระบบแล้วเข้าสู่ระบบใหม่</Empty>;
  if (loading || !form) return <Loading />;

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); setError(null); };
  const save = () => run(async () => {
    await saveProfile({ uid: user.uid, user: profile, patient, form, finish: !profile?.onboardedAt });
    base.current = JSON.stringify(form);
    setSaved(true);
  });
  const reset = () => { setForm(remote); base.current = JSON.stringify(remote); setError(null); };

  const { percent, missing } = completeness(form);
  const age = ageOf(form);
  const bmi = bmiOf(form);
  const sex = SEX.find(([k]) => k === form.sex)?.[1];
  const initial = [...(form.displayName || user.email || '?')][0].toUpperCase();

  return (
    <div className="stack-lg profile-page">
      <PageHeader title="โปรไฟล์ของฉัน" subtitle="ข้อมูลส่วนตัวและประวัติสุขภาพ ใช้ให้เภสัชกรเลือกยาที่ปลอดภัยกับคุณ" />

      <Card className="profile-hero">
        <div className="profile-avatar" aria-hidden>{initial}</div>
        <div className="profile-who">
          <h2>{form.displayName || 'ยังไม่ได้ตั้งชื่อ'}</h2>
          <p className="muted truncate">{user.email}</p>
          <div className="profile-tags">
            {age !== null ? <Badge tone="info">อายุ {age} ปี</Badge> : null}
            {sex ? <Badge tone="neutral">{sex}</Badge> : null}
            {form.bloodType ? <Badge tone="neutral">หมู่เลือด {form.bloodType}</Badge> : null}
            {bmi ? <Badge tone="neutral">BMI {bmi.value.toFixed(1)}</Badge> : null}
            {form.allergies.length ? <Badge tone="bad">แพ้ยา {form.allergies.length} รายการ</Badge> : null}
          </div>
        </div>
        <div className="profile-meter">
          <div className="between"><strong>ข้อมูลครบ {percent}%</strong>{percent === 100 ? <Badge tone="good">ครบแล้ว</Badge> : null}</div>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="ความครบถ้วนของข้อมูล"><span style={{ width: `${percent}%` }} /></div>
          {missing.length ? <p className="muted small">ยังไม่ได้กรอก: {missing.slice(0, 4).join(' · ')}{missing.length > 4 ? ` และอีก ${missing.length - 4} ข้อ` : ''}</p> : null}
        </div>
      </Card>

      {SECTIONS.filter(([id]) => id !== 'consent').map(([id, title, desc, Section]) => (
        <Card key={id} className="stack-lg" id={`sec-${id}`}>
          <div><h2>{title}</h2><p className="muted small">{desc}</p></div>
          <Section f={form} set={set} />
        </Card>
      ))}

      <Card className="stack-lg" id="sec-consent">
        <div><h2>ความยินยอมการแชร์ข้อมูล</h2><p className="muted small">เปลี่ยนใจได้ทุกเมื่อ</p></div>
        {(() => { const Consent = SECTIONS.find(([id]) => id === 'consent')[3]; return <Consent f={form} set={set} />; })()}
      </Card>

      <p className="muted small">
        ข้อมูลสุขภาพของสมาชิกในครอบครัวที่คุณดูแล ดูและแก้ที่ <a href="#/health">โปรไฟล์สุขภาพรายคน <Icon name="back" size={14} /></a>
      </p>

      <div className={`save-bar${dirty ? ' dirty' : ''}`} role="region" aria-label="บันทึกโปรไฟล์">
        <span role="status" aria-live="polite">
          {saved && !dirty ? <Badge tone="good">บันทึกข้อมูลแล้ว</Badge> : dirty ? 'มีการแก้ไขที่ยังไม่ได้บันทึก' : <span className="muted">แก้ข้อมูลด้านบนได้เลย แล้วกดบันทึก</span>}
        </span>
        <div className="row">
          {dirty ? <Button variant="ghost" onClick={reset} disabled={busy}>ยกเลิก</Button> : null}
          <Button busy={busy} onClick={save} disabled={!dirty}><Icon name="check" size={20} stroke={2.6} />บันทึก</Button>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
