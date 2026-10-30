// Comprehensive Health Analysis & Visual Benchmark Comparison Graph Component
import { useState } from 'react';
import { Card, Badge, Icon, Button } from './ui.jsx';
import { analyzeHealth } from '../lib/healthAnalysis.js';
import VisualHealthGraph from './VisualHealthGraph.jsx';

export default function HealthAnalysisView({ form, meds = [], onEditProfile, onGoSymptoms }) {
  const analysis = analyzeHealth(form, meds);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'comparison' | 'advice'

  if (!analysis) return null;

  const {
    totalScore,
    tier,
    tierLabel,
    tierDesc,
    tierColor,
    bmi,
    bmiText,
    bmiTone,
    idealWeightMin,
    idealWeightMax,
    lifestyleScore,
    conditionScore,
    readinessScore,
    recommendations,
    benchmarks,
  } = analysis;

  // Determine percentage along 0-100 spectrum
  const pointerPercent = Math.min(98, Math.max(2, totalScore));

  return (
    <div className="health-analysis-wrap stack-lg">
      {/* ── TOP HERO SCORE & GAUGE CARD ── */}
      <Card className="analysis-hero-card">
        <div className="analysis-header-row">
          <div>
            <span className="badge badge-mock" style={{ marginBottom: 6 }}>ระบบวิเคราะห์สุขภาพอัจฉริยะ</span>
            <h2 className="analysis-title">ผลการวิเคราะห์ระดับสุขภาพของคุณ</h2>
            <p className="muted" style={{ margin: 0, fontSize: '0.95rem' }}>
              ประเมินจากข้อมูลส่วนตัว ดัชนีมวลกาย โรคประจำตัว พฤติกรรมการใช้ชีวิต และประวัติการใช้ยา
            </p>
          </div>
          <div className="score-badge-circle" style={{ borderColor: tierColor }}>
            <span className="score-num" style={{ color: tierColor }}>{totalScore}</span>
            <span className="score-total">/100</span>
            <span className="score-caption" style={{ background: tierColor, color: '#102018' }}>
              {tier === 'good' ? 'สุขภาพดี' : tier === 'moderate' ? 'ปานกลาง' : 'ต้องดูแล'}
            </span>
          </div>
        </div>

        {/* ── MASTER HEALTH SPECTRUM GAUGE ── */}
        <div className="spectrum-container">
          <div className="spectrum-label-row">
            <span className="spec-tag spec-bad">
              <span className="dot dot-bad" /> เกณฑ์เฝ้าระวัง (0–59)
            </span>
            <span className="spec-tag spec-mod">
              <span className="dot dot-mod" /> ปานกลาง (60–79)
            </span>
            <span className="spec-tag spec-good">
              <span className="dot dot-good" /> สุขภาพดีเยี่ยม (80–100)
            </span>
          </div>

          {/* Master Spectrum Bar with Needle */}
          <div className="spectrum-bar-wrap">
            <div
              className="spectrum-bar"
              role="meter"
              aria-label="คะแนนระดับสุขภาพของคุณ"
              aria-valuenow={totalScore}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="spec-segment seg-bad" title="โซนเฝ้าระวัง: 0-59" />
              <div className="spec-segment seg-mod" title="โซนปานกลาง: 60-79" />
              <div className="spec-segment seg-good" title="โซนสุขภาพดี: 80-100" />
            </div>

            {/* Current user pointer / needle */}
            <div
              className="spectrum-pointer"
              style={{ left: `${pointerPercent}%` }}
              aria-hidden="true"
            >
              <div className="pointer-bubble" style={{ borderColor: tierColor }}>
                <span className="pointer-title">ระดับของคุณ</span>
                <strong className="pointer-val num" style={{ color: tierColor }}>{totalScore} คะแนน</strong>
              </div>
              <div className="pointer-pin" style={{ backgroundColor: tierColor }} />
            </div>
          </div>

          <div className="spectrum-markers num">
            <span>0</span>
            <span style={{ left: '60%' }}>60</span>
            <span style={{ left: '80%' }}>80</span>
            <span>100</span>
          </div>
        </div>

        {/* Tier status note */}
        <div className="analysis-tier-note" style={{ borderLeftColor: tierColor }}>
          <strong style={{ color: tierColor, fontSize: '1.05rem' }}>{tierLabel}</strong>
          <p style={{ margin: '4px 0 0', color: 'var(--text)', fontSize: '0.92rem', lineHeight: 1.5 }}>
            {tierDesc}
          </p>
        </div>

        {/* Sub-scores overview grid */}
        <div className="subscores-grid">
          <div className="subscore-item">
            <span className="sub-label">ดัชนีมวลกาย (BMI)</span>
            <span className="sub-val">{bmi ? bmi.value.toFixed(1) : '—'}</span>
            <span className={`badge badge-${bmiTone} small`}>{bmiText}</span>
          </div>
          <div className="subscore-item">
            <span className="sub-label">วิถีชีวิต & พฤติกรรม</span>
            <span className="sub-val">{lifestyleScore} <small>/25</small></span>
            <span className={`badge badge-${lifestyleScore >= 18 ? 'good' : 'warn'} small`}>
              {lifestyleScore >= 18 ? 'พฤติกรรมดี' : 'ควรปรับปรุง'}
            </span>
          </div>
          <div className="subscore-item">
            <span className="sub-label">ภาระโรค & ความปลอดภัยยา</span>
            <span className="sub-val">{conditionScore} <small>/30</small></span>
            <span className={`badge badge-${conditionScore >= 24 ? 'good' : 'warn'} small`}>
              {form.conditions?.length ? `มี ${form.conditions.length} โรค` : 'ไม่มีโรคประจำตัว'}
            </span>
          </div>
          <div className="subscore-item">
            <span className="sub-label">ความพร้อมข้อมูลสุขภาพ</span>
            <span className="sub-val">{readinessScore} <small>/20</small></span>
            <span className="badge badge-info small">บันทึกครบถ้วน</span>
          </div>
        </div>
      </Card>

      {/* ── COMPARATIVE VISUAL GRAPH (กราฟภาพเรดาร์และกราฟแท่งเปรียบเทียบ) ── */}
      <Card className="benchmark-card stack">
        <div>
          <h3>กราฟเปรียบเทียบมิติสุขภาพกับเกณฑ์มาตรฐาน (Visual Health Graph)</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>
            แสดงผลเป็นกราฟภาพเรดาร์ใยแมงมุมและกราฟแท่งเปรียบเทียบ 4 มิติ ระหว่างระดับของคุณกับเกณฑ์มาตรฐานสุขภาพดี
          </p>
        </div>

        <VisualHealthGraph benchmarks={benchmarks} />
      </Card>

      {/* ── SIDE-BY-SIDE MATRIX (ตารางเทียบแบบชัดเจน สุขภาพดี vs ตัวคุณ vs สุขภาพไม่ดี) ── */}
      <Card className="matrix-card stack">
        <div className="between" style={{ alignItems: 'baseline' }}>
          <h3>สรุปการเปรียบเทียบสุขภาพ 3 ระดับ</h3>
          <span className="matrix-scroll-hint small muted">← เลื่อนตารางแนวนอนเพื่อดูข้อมูลครบถ้วน →</span>
        </div>
        <div className="matrix-table-wrap">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>มิติสุขภาพ</th>
                <th className="col-bad">⚠️ เกณฑ์เฝ้าระวัง / เสี่ยงสูง</th>
                <th className="col-you">⭐ ระดับของคุณในปัจจุบัน</th>
                <th className="col-good">✅ สุขภาพดี (เกณฑ์เหมาะสม)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>1. ดัชนีมวลกาย (BMI)</strong></td>
                <td className="col-bad">อ้วน (BMI ≥ 25) หรือ ผอมเกิน (&lt; 18.5) เสี่ยงโรคเรื้อรัง</td>
                <td className="col-you">
                  <Badge tone={bmiTone}><span className="num">{bmi ? `BMI ${bmi.value.toFixed(1)}` : 'ไม่ได้ระบุ'}</span> ({bmiText})</Badge>
                </td>
                <td className="col-good">สมส่วน 18.5 – 22.9 กก./ม.² {idealWeightMin ? `(น้ำหนักเป้าหมาย ${idealWeightMin}-${idealWeightMax} กก.)` : ''}</td>
              </tr>
              <tr>
                <td><strong>2. การออกกำลังกาย</strong></td>
                <td className="col-bad">ไม่ออกกำลังกายเลย หรือนั่งติดที่ตลอดวัน</td>
                <td className="col-you">
                  <strong>{form.exercise || 'ไม่ได้ระบุ'}</strong>
                </td>
                <td className="col-good">สม่ำเสมอ 150 นาที/สัปดาห์ (3–5 วัน)</td>
              </tr>
              <tr>
                <td><strong>3. บุหรี่และเครื่องดื่ม</strong></td>
                <td className="col-bad">สูบบุหรี่ประจำ, ดื่มสุราหนักหรือบ่อย</td>
                <td className="col-you">
                  <span>{form.smoking === 'never' ? 'ไม่สูบ' : form.smoking || 'ไม่ระบุ'} / {form.alcohol === 'never' ? 'ไม่ดื่ม' : form.alcohol || 'ไม่ระบุ'}</span>
                </td>
                <td className="col-good">ไม่สูบบุหรี่, ไม่ดื่มหรือดื่มเฉพาะสังคมเบาบาง</td>
              </tr>
              <tr>
                <td><strong>4. การจัดการโรค & การใช้ยา</strong></td>
                <td className="col-bad">ขาดยาประจำ, ปล่อยความดัน/น้ำตาลสูง, ซื้อยากินเองไม่ระวังแพ้</td>
                <td className="col-you">
                  <span>มีโรค {form.conditions?.length ?? 0} โรค · แพ้ยา {form.allergies?.length ?? 0} รายการ</span>
                </td>
                <td className="col-good">ควบคุมค่าเลือดได้ตามเป้า กินยาตรงเวลา เภสัชกรตรวจเช็กยาเสมอ</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── ACTIONABLE ADVICE & RECOMMENDATIONS ── */}
      <div className="stack">
        <h3>คำแนะนำเฉพาะบุคคลสำหรับคุณ</h3>
        <div className="recommendations-grid">
          {recommendations.map((rec, i) => (
            <Card key={i} className={`rec-card rec-${rec.tone}`}>
              <div className="rec-icon-wrap" aria-hidden>
                <Icon name={rec.icon} size={24} />
              </div>
              <div className="rec-content">
                <strong>{rec.title}</strong>
                <p className="muted small" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>
                  {rec.desc}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* ── BOTTOM ACTIONS ── */}
      <div className="analysis-actions-row">
        {onEditProfile ? (
          <Button variant="secondary" onClick={onEditProfile}>
            <Icon name="settings" size={18} /> แก้ไขข้อมูลโปรไฟล์สุขภาพ
          </Button>
        ) : null}
        {onGoSymptoms ? (
          <Button variant="primary" onClick={onGoSymptoms}>
            <Icon name="heart" size={18} /> ดูประวัติอาการที่เคยเป็น / ปรึกษาอาการ
          </Button>
        ) : null}
      </div>
    </div>
  );
}
