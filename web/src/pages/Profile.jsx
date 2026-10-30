// My profile: personal info, health analysis with benchmark comparison graphs, and symptom consultation history.
import { useEffect, useMemo, useRef, useState } from 'react';
import { doc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAction, useDocData } from '../lib/hooks.js';
import { useSession } from '../lib/session.js';
import { Badge, Button, Card, Empty, ErrorText, Icon, Loading, PageHeader } from '../components/ui.jsx';
import { SECTIONS } from '../profile/sections.jsx';
import { SEX, ageOf, bmiOf, completeness, fromDocs, saveProfile } from '../profile/model.js';
import { analyzeHealth } from '../lib/healthAnalysis.js';
import HealthAnalysisView from '../components/HealthAnalysisView.jsx';
import SymptomHistoryView from '../components/SymptomHistoryView.jsx';

export default function Profile({ embedded = false, patient: propPatient, initialView = 'health' }) {
  const { user, profile, patients } = useSession();
  const targetPatient = propPatient || patients.find((p) => p.isSelf && p.isOwner) || patients[0];
  const [health, loading] = useDocData(targetPatient ? doc(db, 'patients', targetPatient.id, 'health', 'profile') : null, [targetPatient?.id]);
  const remote = useMemo(() => fromDocs(profile, targetPatient, health), [profile, targetPatient, health]);
  const [form, setForm] = useState(null);
  const base = useRef('');
  const [saved, setSaved] = useState(false);
  const { busy, error, run, setError } = useAction();

  // Active view: 'health' (Profile form) | 'analysis' (Graphs & Benchmarks) | 'symptoms' (History)
  const [view, setView] = useState(() => {
    if (initialView === 'analysis') return 'analysis';
    if (initialView === 'symptoms') return 'symptoms';
    return 'health';
  });

  useEffect(() => {
    if (initialView === 'analysis' || initialView === 'symptoms' || initialView === 'health') {
      setView(initialView);
    }
  }, [initialView]);

  // Follow stored data until user edits
  const dirty = form !== null && JSON.stringify(form) !== base.current;
  useEffect(() => {
    if (loading) return;
    if (form === null || !dirty) { setForm(remote); base.current = JSON.stringify(remote); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote, loading]);

  if (!targetPatient) return <Empty icon="user" title="ยังไม่มีโปรไฟล์ของคุณ">ลองออกจากระบบแล้วเข้าสู่ระบบใหม่</Empty>;
  if (loading || !form) return <Loading />;

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); setError(null); };
  const save = () => run(async () => {
    await saveProfile({ uid: user.uid, user: profile, patient: targetPatient, form, finish: !profile?.onboardedAt });
    base.current = JSON.stringify(form);
    setSaved(true);
  });
  const reset = () => { setForm(remote); base.current = JSON.stringify(remote); setError(null); };

  const { percent, missing } = completeness(form);
  const age = ageOf(form);
  const bmi = bmiOf(form);
  const sex = SEX.find(([k]) => k === form.sex)?.[1];
  const initial = [...(form.displayName || user.email || '?')][0].toUpperCase();
  const analysis = analyzeHealth(form);

  return (
    <div className="stack-lg profile-page">
      {embedded ? null : (
        <PageHeader
          title="ข้อมูลและวิเคราะห์สุขภาพ"
          subtitle="ข้อมูลส่วนตัว ระบบวิเคราะห์สุขภาพพร้อมกราฟเปรียบเทียบ และประวัติการประเมินอาการ"
        />
      )}

      {/* ── โหมดของข้อมูลสุขภาพ ── */}
      <nav className="care-subnav-pills" aria-label="โหมดข้อมูลสุขภาพ">
        <button
          type="button"
          className={`care-subnav-btn ${view === 'health' ? 'active' : ''}`}
          onClick={() => setView('health')}
        >
          <Icon name="user" size={18} /> ข้อมูลส่วนตัวและสุขภาพ
        </button>
        <button
          type="button"
          className={`care-subnav-btn ${view === 'analysis' ? 'active' : ''}`}
          onClick={() => setView('analysis')}
        >
          <Icon name="heart" size={18} /> วิเคราะห์สุขภาพ & กราฟเทียบ
        </button>
        <button
          type="button"
          className={`care-subnav-btn ${view === 'symptoms' ? 'active' : ''}`}
          onClick={() => setView('symptoms')}
        >
          <Icon name="list" size={18} /> ประวัติอาการที่เคยถาม
        </button>
      </nav>

      {/* ── RESPONSIVE DESKTOP TWO-COLUMN DASHBOARD GRID ── */}
      <div className="mycare-desktop-grid">
        {/* ── LEFT SIDEBAR (STICKY SUMMARY) ── */}
        <aside className="mycare-sticky-sidebar">
          {/* User Profile Hero Card */}
          <Card className="profile-hero">
            <div className="profile-avatar" aria-hidden>{initial}</div>
            <div className="profile-who">
              <h2>{form.displayName || 'ยังไม่ได้ตั้งชื่อ'}</h2>
              <p className="muted truncate" style={{ fontSize: '0.85rem' }}>{user.email}</p>
              <div className="profile-tags">
                {age !== null ? <Badge tone="info">อายุ {age} ปี</Badge> : null}
                {sex ? <Badge tone="neutral">{sex}</Badge> : null}
                {form.bloodType ? <Badge tone="neutral">หมู่เลือด {form.bloodType}</Badge> : null}
                {bmi ? <Badge tone="neutral">BMI {bmi.value.toFixed(1)}</Badge> : null}
                {form.allergies?.length ? <Badge tone="bad">แพ้ยา {form.allergies.length} รายการ</Badge> : null}
              </div>
            </div>
            <div className="profile-meter">
              <div className="between">
                <strong>ข้อมูลครบ {percent}%</strong>
                {percent === 100 ? <Badge tone="good">ครบแล้ว</Badge> : null}
              </div>
              <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="ความครบถ้วนของข้อมูล">
                <span style={{ width: `${percent}%` }} />
              </div>
              {missing.length ? (
                <p className="muted small">
                  ยังไม่ได้กรอก: {missing.slice(0, 3).join(' · ')}
                  {missing.length > 3 ? ` และอีก ${missing.length - 3} ข้อ` : ''}
                </p>
              ) : null}
            </div>
          </Card>

          {/* Quick Health Score Gauge Widget */}
          {analysis ? (
            <Card className="stack" style={{ padding: '18px 20px', background: 'var(--surface-2)' }}>
              <div className="between" style={{ alignItems: 'center' }}>
                <strong style={{ fontSize: '0.95rem' }}>คะแนนสุขภาพของคุณ</strong>
                <span
                  className="badge"
                  style={{
                    background: analysis.tierColor,
                    color: '#102018',
                    fontWeight: 700,
                    padding: '3px 10px',
                  }}
                >
                  {analysis.tier === 'good' ? 'สุขภาพดี' : analysis.tier === 'moderate' ? 'ปานกลาง' : 'ต้องระวัง'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '4px 0' }}>
                <span style={{ fontSize: '2.4rem', fontWeight: 800, color: analysis.tierText, lineHeight: 1 }}>
                  {analysis.totalScore}
                </span>
                <span className="muted" style={{ fontWeight: 600 }}>/ 100 คะแนน</span>
              </div>

              {/* Mini Spectrum Bar */}
              <div style={{ height: 10, borderRadius: 5, display: 'flex', overflow: 'hidden', margin: '4px 0' }}>
                <div style={{ flex: 60, background: '#ef4444' }} title="ไม่ดี" />
                <div style={{ flex: 20, background: '#f59e0b' }} title="ปานกลาง" />
                <div style={{ flex: 20, background: '#10b981' }} title="สุขภาพดี" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--muted)' }}>
                <span>0 ไม่ดี</span>
                <span>60 ปานกลาง</span>
                <span>80 ดีเยี่ยม</span>
              </div>

              <p className="muted small" style={{ margin: '6px 0 0', lineHeight: 1.45 }}>
                {analysis.tierDesc}
              </p>

              <Button
                variant={view === 'analysis' ? 'primary' : 'secondary'}
                size="sm"
                block
                style={{ marginTop: 8 }}
                onClick={() => setView('analysis')}
              >
                <Icon name="heart" size={16} /> ดูกราฟเปรียบเทียบละเอียด
              </Button>
            </Card>
          ) : null}

        </aside>

        {/* ── RIGHT MAIN CONTENT AREA ── */}
        <main className="mycare-main-area stack-lg">
          {/* VIEW 1: HEALTH ANALYSIS & COMPARISON GRAPH */}
          {view === 'analysis' ? (
            <HealthAnalysisView
              form={form}
              onEditProfile={() => setView('health')}
              onGoSymptoms={() => setView('symptoms')}
            />
          ) : null}

          {/* VIEW 2: SYMPTOM HISTORY LOG */}
          {view === 'symptoms' ? (
            <SymptomHistoryView
              patientId={targetPatient.id}
              patientName={form.displayName || targetPatient.displayName || 'คุณ'}
            />
          ) : null}

          {/* VIEW 3: PROFILE FORM SECTIONS */}
          {view === 'health' ? (
            <div className="profile-form-grid">
              {SECTIONS.filter(([id]) => id !== 'consent').map(([id, title, desc, Section]) => (
                <Card key={id} className="stack-lg" id={`sec-${id}`}>
                  <div>
                    <h3>{title}</h3>
                    <p className="muted small">{desc}</p>
                  </div>
                  <Section f={form} set={set} />
                </Card>
              ))}

              <Card className="stack-lg full-col" id="sec-consent">
                <div>
                  <h3>ความยินยอมการแชร์ข้อมูล</h3>
                  <p className="muted small">เปลี่ยนใจได้ทุกเมื่อ</p>
                </div>
                {(() => {
                  const Consent = SECTIONS.find(([id]) => id === 'consent')[3];
                  return <Consent f={form} set={set} />;
                })()}
              </Card>
            </div>
          ) : null}
        </main>
      </div>

      {/* Floating Save Bar for Profile Form */}
      {view === 'health' ? (
        <div className={`save-bar${dirty ? ' dirty' : ''}`} role="region" aria-label="บันทึกโปรไฟล์">
          <span role="status" aria-live="polite">
            {saved && !dirty ? (
              <Badge tone="good">บันทึกข้อมูลแล้ว</Badge>
            ) : dirty ? (
              'มีการแก้ไขที่ยังไม่ได้บันทึก'
            ) : (
              <span className="muted">แก้ข้อมูลด้านบนได้เลย แล้วกดบันทึก</span>
            )}
          </span>
          <div className="row">
            {dirty ? (
              <Button variant="ghost" onClick={reset} disabled={busy}>
                ยกเลิก
              </Button>
            ) : null}
            <Button busy={busy} onClick={save} disabled={!dirty}>
              <Icon name="check" size={20} stroke={2.6} /> บันทึก
            </Button>
          </div>
        </div>
      ) : null}

      <ErrorText>{error}</ErrorText>
    </div>
  );
}
