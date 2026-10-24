// Painted lawn behind the picnic basket, seen from above. Built like a painting rather than a pattern:
// 1. soft, heavily blurred fields of sunlight and shade (the light layers),
// 2. a sparse wash of short brush strokes that all lean the same way, tinted by how lit each spot is,
// 3. a few large sweeping clumps at the corners, every blade with its own length, curve and width,
//    slightly out of focus so they read as close to the camera.
// Static on purpose.
import { memo } from 'react';

const W = 1600;
const H = 1000;

// Small seeded random so the lawn looks the same on every load.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// A single tapered blade from (x, y), pointing at `angle` (radians), bending sideways by `bend`.
function blade(x, y, angle, length, width, bend) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const tipX = x + dx * length + nx * bend * length;
  const tipY = y + dy * length + ny * bend * length;
  const mx = x + dx * length * 0.55 + nx * bend * length * 0.8;
  const my = y + dy * length * 0.55 + ny * bend * length * 0.8;
  const h = width / 2;
  const f = (n) => n.toFixed(1);
  return `M${f(x + nx * h)} ${f(y + ny * h)} Q${f(mx + nx * h * 0.7)} ${f(my + ny * h * 0.7)} ${f(tipX)} ${f(tipY)} Q${f(mx - nx * h * 0.7)} ${f(my - ny * h * 0.7)} ${f(x - nx * h)} ${f(y - ny * h)}Z`;
}

// How much sun reaches a point: brightest at the top-left, falling off toward the bottom-right.
const sunAt = (x, y) => Math.max(0, Math.min(1, 1 - Math.hypot(x / W, (y / H) * 0.8) / 1.15));

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const SHADE = [24, 82, 20];
const SUN = [214, 244, 128];

const STROKES = (() => {
  const rand = rng(7331);
  // A dense carpet of short blades so the ground reads as a lawn: each blade gets its own
  // angle, length and tint, a shade lighter or darker than the light around it.
  return Array.from({ length: 1600 }, () => {
    const x = rand() * (W + 40) - 20;
    const y = rand() * (H + 40) - 20;
    const lit = sunAt(x, y);
    const light = rand() < 0.5;
    const [r, g, b] = mix(SHADE, SUN, Math.max(0, Math.min(1, lit * 1.1 + (light ? 0.22 : -0.2) + (rand() - 0.5) * 0.15)));
    return {
      d: blade(x, y, -1.75 + (rand() - 0.5) * 0.9, 9 + rand() * 18, 2 + rand() * 2.6, (rand() - 0.5) * 0.5),
      fill: `rgb(${r} ${g} ${b})`,
      opacity: (light ? 0.3 + rand() * 0.3 : 0.25 + rand() * 0.25).toFixed(2),
    };
  });
})();

// Corner clumps: origin just off-screen, a fan of blades reaching into the frame.
const CLUMPS = [
  { id: 'tl', x: -70, y: -50, from: 0.15, to: 1.25, count: 9, len: [280, 520], tone: 'sunlit' },
  { id: 'tr', x: W + 60, y: -40, from: 1.9, to: 2.95, count: 7, len: [220, 420], tone: 'mid' },
  { id: 'bl', x: -60, y: H + 50, from: -1.35, to: -0.15, count: 8, len: [240, 460], tone: 'mid' },
  { id: 'br', x: W + 70, y: H + 60, from: 3.35, to: 4.5, count: 10, len: [300, 560], tone: 'deep' },
];

const CLUMP_PATHS = (() => {
  const rand = rng(424242);
  return CLUMPS.map((c) => ({
    ...c,
    blades: Array.from({ length: c.count }, (_, i) => {
      const t = (i + rand() * 0.6) / c.count;
      const angle = c.from + (c.to - c.from) * t;
      const length = c.len[0] + rand() * (c.len[1] - c.len[0]);
      return blade(c.x + (rand() - 0.5) * 60, c.y + (rand() - 0.5) * 60, angle, length, 34 + rand() * 40, (rand() - 0.5) * 0.4);
    }),
  }));
})();

function PicnicLawn() {
  return (
    <svg className="lawn" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="lawn-base" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6db83a" /><stop offset=".5" stopColor="#3f9027" /><stop offset="1" stopColor="#245f1a" />
        </linearGradient>
        <filter id="lawn-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="70" /></filter>
        <filter id="lawn-near" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="2.2" />
          <feDropShadow dx="12" dy="18" stdDeviation="16" floodColor="#0b3008" floodOpacity=".5" />
        </filter>
        <linearGradient id="clump-sunlit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c7ec6c" /><stop offset=".45" stopColor="#6fbf3a" /><stop offset="1" stopColor="#2f7d22" />
        </linearGradient>
        <linearGradient id="clump-mid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5aaa31" /><stop offset="1" stopColor="#1f5e17" />
        </linearGradient>
        <linearGradient id="clump-deep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2e7a22" /><stop offset="1" stopColor="#0f3a0c" />
        </linearGradient>
        <radialGradient id="lawn-vignette" cx=".45" cy=".42" r=".78">
          <stop offset=".55" stopColor="#0b2e08" stopOpacity="0" /><stop offset="1" stopColor="#0b2e08" stopOpacity=".55" />
        </radialGradient>
      </defs>

      <rect width={W} height={H} fill="url(#lawn-base)" />

      {/* light layers: soft pools of sun and shade, blurred into each other */}
      <g filter="url(#lawn-soft)">
        <ellipse cx="160" cy="90" rx="720" ry="430" fill="#c9ef72" opacity=".75" />
        <ellipse cx="40" cy="10" rx="380" ry="260" fill="#fff7c2" opacity=".85" />
        <ellipse cx="1300" cy="230" rx="420" ry="230" fill="#9fd955" opacity=".45" />
        <ellipse cx="560" cy="880" rx="400" ry="190" fill="#8ccf48" opacity=".4" />
        <ellipse cx="1380" cy="860" rx="640" ry="380" fill="#123f0e" opacity=".75" />
        <ellipse cx="220" cy="720" rx="360" ry="250" fill="#1b5615" opacity=".5" />
        <ellipse cx="900" cy="460" rx="430" ry="300" fill="#2a6d1d" opacity=".35" />
      </g>

      {/* brush-stroke texture, leaning with the wind */}
      <g>
        {STROKES.map((s, i) => <path key={i} d={s.d} fill={s.fill} opacity={s.opacity} />)}
      </g>

      {/* close-up clumps at the corners */}
      {CLUMP_PATHS.map((c) => (
        <g key={c.id} fill={`url(#clump-${c.tone})`} filter="url(#lawn-near)">
          {c.blades.map((d) => <path key={d.slice(0, 22)} d={d} />)}
        </g>
      ))}

      <rect width={W} height={H} fill="url(#lawn-vignette)" />
    </svg>
  );
}

export default memo(PicnicLawn);
