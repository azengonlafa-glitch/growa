// Visual Graphic Chart (Radar Spider Chart and Comparative Bar Chart) for Health Dimensions
import { useState } from 'react';
import { Badge, Icon } from './ui.jsx';

export default function VisualHealthGraph({ benchmarks }) {
  const [chartType, setChartType] = useState('radar'); // 'radar' | 'bar'
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!benchmarks || benchmarks.length < 4) return null;

  // Normalized values [0..1]
  const bmData = benchmarks.map((b) => ({
    ...b,
    ratio: Math.min(1, Math.max(0.15, b.userScore / b.maxScore)),
    percent: Math.round((b.userScore / b.maxScore) * 100),
  }));

  // Radar geometry
  const cx = 280;
  const cy = 205;
  const R = 135;

  // 4 axes:
  // 0: Top (BMI)
  // 1: Right (Lifestyle)
  // 2: Bottom (Readiness)
  // 3: Left (Chronic Conditions & Meds)
  const getPoint = (axisIndex, ratio) => {
    const dist = ratio * R;
    switch (axisIndex) {
      case 0: return { x: cx, y: cy - dist };
      case 1: return { x: cx + dist, y: cy };
      case 2: return { x: cx, y: cy + dist };
      case 3: return { x: cx - dist, y: cy };
      default: return { x: cx, y: cy };
    }
  };

  const toPolygonPoints = (ratio) => {
    const pts = [0, 1, 2, 3].map((i) => getPoint(i, ratio));
    return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  };

  const userPolygonPoints = bmData
    .map((b, i) => {
      const p = getPoint(i, b.ratio);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  const goodPolygonPoints = toPolygonPoints(0.85); // 85% benchmark
  const riskPolygonPoints = toPolygonPoints(0.55); // 55% threshold

  return (
    <div className="visual-graph-container stack">
      {/* Chart Type Selector Header */}
      <div className="visual-graph-header">
        <div className="chart-type-pills" role="group" aria-label="เลือกรูปแบบกราฟภาพ">
          <button
            type="button"
            className={`chart-type-btn ${chartType === 'radar' ? 'active' : ''}`}
            onClick={() => setChartType('radar')}
          >
            🕸️ กราฟเรดาร์ใยแมงมุม (Radar Chart)
          </button>
          <button
            type="button"
            className={`chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}
            onClick={() => setChartType('bar')}
          >
            📊 กราฟแท่งเปรียบเทียบภาพ (Visual Bar Chart)
          </button>
        </div>

        <div className="visual-chart-legend">
          <span className="v-leg v-leg-good">
            <span className="v-box v-box-good" /> เกณฑ์สุขภาพดี (85-100%)
          </span>
          <span className="v-leg v-leg-user">
            <span className="v-box v-box-user" /> สุขภาพของคุณ
          </span>
          <span className="v-leg v-leg-bad">
            <span className="v-box v-box-bad" /> เกณฑ์เฝ้าระวัง (&lt;60%)
          </span>
        </div>
      </div>

      {/* ── TYPE 1: RADAR / SPIDER WEB CHART ── */}
      {chartType === 'radar' ? (
        <div className="radar-chart-wrap">
          <svg
            className="radar-svg"
            viewBox="0 0 560 410"
            role="img"
            aria-label="กราฟเรดาร์ใยแมงมุมเปรียบเทียบมิติสุขภาพของคุณกับเกณฑ์มาตรฐาน"
          >
            <defs>
              {/* User Polygon Gradient */}
              <linearGradient id="userRadarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.65" />
              </linearGradient>

              {/* Good Zone Gradient */}
              <radialGradient id="goodZoneGrad" cx="50%" cy="50%" r="50%">
                <stop offset="60%" stopColor="#10b981" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.22" />
              </radialGradient>

              {/* Glow Filter */}
              <filter id="radarGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Background Concentric Web Polygons */}
            {[0.25, 0.5, 0.75, 1.0].map((step) => (
              <polygon
                key={step}
                points={toPolygonPoints(step)}
                fill="none"
                stroke="var(--border)"
                strokeWidth={step === 1.0 ? '1.5' : '1'}
                strokeDasharray={step === 1.0 ? 'none' : '4 3'}
              />
            ))}

            {/* Percentage Marks along the top axis */}
            {[25, 50, 75, 100].map((pct) => (
              <text
                key={pct}
                x={cx + 5}
                y={cy - (pct / 100) * R + 4}
                fill="var(--muted)"
                fontSize="10"
                fontFamily="inherit"
                className="num"
              >
                {pct}%
              </text>
            ))}

            {/* 4 Axis Cross Lines */}
            <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="var(--border-strong)" strokeWidth="1.5" />
            <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="var(--border-strong)" strokeWidth="1.5" />

            {/* Optimal Standard Zone Polygon (Green Area) */}
            <polygon
              points={goodPolygonPoints}
              fill="url(#goodZoneGrad)"
              stroke="#10b981"
              strokeWidth="1.8"
              strokeDasharray="5 3"
            />

            {/* Caution / Risk Zone Polygon (Red Area) */}
            <polygon
              points={riskPolygonPoints}
              fill="#ef4444"
              fillOpacity="0.06"
              stroke="#ef4444"
              strokeWidth="1.2"
              strokeOpacity="0.5"
            />

            {/* ── USER HEALTH DATA SHAPE (FILLED POLYGON) ── */}
            <polygon
              points={userPolygonPoints}
              fill="url(#userRadarGrad)"
              stroke="#2563eb"
              strokeWidth="2.5"
              filter="url(#radarGlow)"
              className="user-radar-shape"
            />

            {/* Data Points (Dots on apexes) */}
            {bmData.map((b, i) => {
              const pt = getPoint(i, b.ratio);
              const isHovered = hoveredIndex === i;
              return (
                <g
                  key={b.id}
                  className="radar-point-group"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 9 : 6.5}
                    fill="#fff"
                    stroke={b.userStatus === 'good' ? '#10b981' : b.userStatus === 'warn' ? '#f59e0b' : '#ef4444'}
                    strokeWidth="3.5"
                    style={{ transition: 'all 0.2s ease', cursor: 'pointer' }}
                  />
                  {/* Point percentage label */}
                  <text
                    x={pt.x}
                    y={pt.y - 12}
                    textAnchor="middle"
                    fill="var(--text)"
                    fontSize="11"
                    fontWeight="700"
                    className="num"
                  >
                    {b.percent}%
                  </text>
                </g>
              );
            })}

            {/* Center Origin Dot */}
            <circle cx={cx} cy={cy} r="3" fill="var(--muted)" />

            {/* ── 4 AXIS CARDS / ANNOTATION BADGES ── */}
            {/* Top: BMI */}
            <g transform={`translate(${cx}, 24)`}>
              <text textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--text)">
                ดัชนีมวลกาย (BMI)
              </text>
              <text textAnchor="middle" y="16" fontSize="11" fill="var(--muted)">
                {bmData[0].userValue}
              </text>
            </g>

            {/* Right: Lifestyle */}
            <g transform={`translate(${cx + R + 18}, ${cy - 8})`}>
              <text textAnchor="start" fontSize="13" fontWeight="800" fill="var(--text)">
                พฤติกรรม & ไลฟ์สไตล์
              </text>
              <text textAnchor="start" y="16" fontSize="11" fill="var(--muted)">
                คะแนน: {bmData[1].userScore}/{bmData[1].maxScore}
              </text>
            </g>

            {/* Bottom: Readiness */}
            <g transform={`translate(${cx}, ${cy + R + 26})`}>
              <text textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--text)">
                ความพร้อมประวัติสุขภาพ
              </text>
              <text textAnchor="middle" y="16" fontSize="11" fill="var(--muted)">
                บันทึกครบถ้วน ({bmData[2].percent}%)
              </text>
            </g>

            {/* Left: Chronic & Meds */}
            <g transform={`translate(${cx - R - 18}, ${cy - 8})`}>
              <text textAnchor="end" fontSize="13" fontWeight="800" fill="var(--text)">
                โรคเรื้อรัง & ความปลอดภัยยา
              </text>
              <text textAnchor="end" y="16" fontSize="11" fill="var(--muted)">
                {bmData[3].userValue}
              </text>
            </g>
          </svg>
        </div>
      ) : (
        /* ── TYPE 2: COMPARATIVE GROUPED BAR CHART ── */
        <div className="visual-bar-chart-wrap">
          <svg
            className="bar-chart-svg"
            viewBox="0 0 580 320"
            role="img"
            aria-label="กราฟแท่งเปรียบเทียบมิติสุขภาพกับเกณฑ์มาตรฐาน"
          >
            <defs>
              <linearGradient id="userBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines */}
            {[0, 25, 50, 75, 100].map((val) => {
              const y = 240 - (val / 100) * 190;
              return (
                <g key={val}>
                  <line x1="45" y1={y} x2="555" y2={y} stroke="var(--border)" strokeDasharray={val === 0 ? 'none' : '4 3'} strokeWidth="1" />
                  <text x="38" y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="num">
                    {val}%
                  </text>
                </g>
              );
            })}

            {/* Grouped Columns for Each Dimension */}
            {bmData.map((b, i) => {
              const groupX = 75 + i * 125;
              const chartBottom = 240;
              const maxH = 190;

              const badHeight = 0.55 * maxH; // 55%
              const userHeight = (b.userScore / b.maxScore) * maxH;
              const goodHeight = 0.88 * maxH; // 88%

              return (
                <g key={b.id} className="bar-group">
                  {/* Bar 1: Caution Benchmark */}
                  <rect
                    x={groupX}
                    y={chartBottom - badHeight}
                    width="22"
                    height={badHeight}
                    rx="5"
                    fill="#fee2e2"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    opacity="0.85"
                  />

                  {/* Bar 2: User Actual Score */}
                  <rect
                    x={groupX + 27}
                    y={chartBottom - userHeight}
                    width="28"
                    height={userHeight}
                    rx="6"
                    fill="url(#userBarGrad)"
                    stroke="#1d4ed8"
                    strokeWidth="1.5"
                    filter="drop-shadow(0 4px 6px rgba(16, 185, 129, 0.25))"
                  />
                  {/* Pin label on top of user bar */}
                  <text
                    x={groupX + 41}
                    y={chartBottom - userHeight - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="800"
                    fill="var(--text)"
                    className="num"
                  >
                    {b.percent}%
                  </text>

                  {/* Bar 3: Good Benchmark */}
                  <rect
                    x={groupX + 60}
                    y={chartBottom - goodHeight}
                    width="22"
                    height={goodHeight}
                    rx="5"
                    fill="#d1fae5"
                    stroke="#10b981"
                    strokeWidth="1.5"
                    opacity="0.85"
                  />

                  {/* X-Axis Category Name */}
                  <text
                    x={groupX + 41}
                    y={chartBottom + 20}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="var(--text)"
                  >
                    {b.id === 'bmi' ? '1. BMI' : b.id === 'lifestyle' ? '2. พฤติกรรม' : b.id === 'chronic' ? '3. ภาระโรค' : '4. ความพร้อม'}
                  </text>
                  <text
                    x={groupX + 41}
                    y={chartBottom + 35}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--muted)"
                    className="num"
                  >
                    {b.userScore}/{b.maxScore} คะแนน
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Detail Breakdown Cards Below the Chart */}
      <div className="visual-dimension-cards">
        {bmData.map((b) => (
          <div key={b.id} className="v-dim-card">
            <div className="between">
              <strong>{b.name}</strong>
              <Badge tone={b.userStatus}>
                <span className="num">{b.percent}%</span> ({b.userScore}/{b.maxScore})
              </Badge>
            </div>
            <div className="v-dim-val">{b.userValue}</div>
            <div className="v-dim-crit">
              <span className="v-crit-good">
                <Icon name="check" size={13} /> {b.goodBenchmark}
              </span>
              <span className="v-crit-bad">
                <Icon name="info" size={13} /> {b.poorBenchmark}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
