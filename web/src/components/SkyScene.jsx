// Decorative sky behind a page: gradient sky, sun with rays and lens flare, a faint rainbow, a cloud bank on the horizon,
// three layers of drifting clouds, a V of pigeons plus distant birds, a growa hot-air balloon, a delivery drone and
// floating light motes. Clouds are plain shapes roughened by an SVG turbulence filter, so no image files are needed.
// Rendered into <body> (a transformed ancestor would break position: fixed) and marks <body> so the page can restyle
// itself to sit on the sky. Purely visual: hidden from assistive tech, frozen under prefers-reduced-motion.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Storybook from './Storybook.jsx';
import '../sky.css';

// [layer, top (vh), width (vw), duration (s), delay (s), filter seed]
const CLOUDS = [
  ['far', 6, 24, 170, -20, 1], ['far', 24, 18, 200, -130, 2], ['far', 38, 22, 185, -70, 3], ['far', 12, 16, 210, -160, 3],
  ['mid', 14, 36, 115, -40, 2], ['mid', 50, 30, 130, -95, 1], ['mid', 30, 26, 140, -10, 3],
  ['near', 40, 54, 85, -30, 3], ['near', 74, 62, 95, -75, 2], ['near', 2, 46, 105, -60, 1],
];
// Horizon bank: wide, slow, sways instead of crossing. [left (vw), width (vw), seed]
const BANK = [[-10, 50, 1], [26, 46, 2], [58, 52, 3], [88, 40, 1]];
// [top (vh), scale, duration (s), delay (s)] — a V led by the first bird, then a small far group.
const PIGEONS = [
  [16, 1, 24, -3], [18, 0.9, 24, -2.55], [14, 0.88, 24, -2.6], [20, 0.8, 24, -2.1], [12, 0.78, 24, -2.15], [22, 0.7, 24, -1.7], [10, 0.68, 24, -1.75],
  [46, 0.5, 32, -18], [48, 0.45, 32, -17.6], [44.5, 0.42, 32, -17.4],
];
// Distant birds: [top (vh), duration (s), delay (s), scale]
const BIRDS = [[9, 46, -5, 0.9], [11, 46, -6.2, 0.7], [8, 46, -7, 0.6], [33, 58, -30, 0.8], [35, 58, -31.5, 0.6], [57, 52, -14, 0.7], [27, 64, -48, 0.5], [60, 70, -40, 0.55]];
// Light motes: spread deterministically so every render looks the same.
const MOTES = Array.from({ length: 28 }, (_, i) => ({ x: (i * 37) % 100, y: 20 + ((i * 53) % 80), d: 9 + (i % 7) * 2, delay: -((i * 1.7) % 14), s: 3 + (i % 4) * 2 }));
const FLARES = [[70, 24, 90, 'rgb(255 236 180 / 22%)'], [61, 36, 46, 'rgb(170 220 255 / 26%)'], [52, 48, 130, 'rgb(255 200 230 / 12%)'], [43, 60, 30, 'rgb(190 255 220 / 24%)']];

function Pigeon({ top, scale, dur, delay }) {
  return (
    <span className="pigeon" style={{ '--top': `${top}vh`, '--s': scale, '--dur': `${dur}s`, '--delay': `${delay}s` }}>
      <svg viewBox="0 0 60 40" width="60" height="40">
        <g className="pigeon-wing pigeon-wing-far"><path d="M22 21C18 7 29-1 40 2c-6 6-10 12-10 19z" fill="#6f7d92" /></g>
        <path d="M7 22 0 17.5 1 27z" fill="#6f7d92" />
        <ellipse cx="26" cy="23" rx="16" ry="7" fill="#9aa6b8" />
        <ellipse cx="28" cy="26" rx="11" ry="3.6" fill="#c6cfdb" />
        <ellipse cx="39.5" cy="19.5" rx="5.2" ry="5" fill="#5f8f87" />
        <circle cx="45" cy="16" r="4.6" fill="#8693a7" />
        <path d="m49.3 15.6 5 1.3-5 1.2z" fill="#e7c36a" />
        <circle cx="46.4" cy="15" r="1" fill="#1d2430" />
        <g className="pigeon-wing pigeon-wing-near">
          <path d="M20 21C15 5 30-3 43 1c-7 5-12 12-12 20z" fill="#b3bdcc" />
          <path d="M33 6c2 1 5 1 8-1M30 10c2 1 6 1 9-1" stroke="#7d899c" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      </svg>
    </span>
  );
}

function Balloon() {
  return (
    <span className="balloon">
      <svg viewBox="0 0 120 170" width="120" height="170">
        <defs>
          <radialGradient id="sky-bal" cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#7dffc0" /><stop offset=".55" stopColor="#14b86a" /><stop offset="1" stopColor="#076b3a" /></radialGradient>
        </defs>
        <path d="M60 4C28 4 8 28 8 56c0 30 30 50 40 74h24c10-24 40-44 40-74C112 28 92 4 60 4z" fill="url(#sky-bal)" />
        <path d="M60 4c-14 0-22 26-22 52 0 30 10 50 12 74h20c2-24 12-44 12-74 0-26-8-52-22-52z" fill="#fff" opacity=".9" />
        <path d="M60 4c-5 0-8 26-8 52 0 30 4 50 5 74h6c1-24 5-44 5-74 0-26-3-52-8-52z" fill="#14b86a" />
        <rect x="47" y="44" width="26" height="26" rx="5" fill="#0b8a4a" />
        <path d="M60 49v16M52 57h16" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        <path d="M49 130l3 18M71 130l-3 18M55 130l1 18M65 130l-1 18" stroke="#6b4a2a" strokeWidth="1.2" />
        <rect x="49" y="147" width="22" height="16" rx="3" fill="#a06a35" />
        <path d="M49 152h22" stroke="#7a4e24" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

function Drone() {
  return (
    <span className="drone">
      <svg viewBox="0 0 120 80" width="120" height="80">
        <path d="M22 18h76" stroke="#2c3a4f" strokeWidth="4" strokeLinecap="round" />
        <ellipse className="rotor" cx="22" cy="12" rx="17" ry="2.4" fill="#2c3a4f" opacity=".55" />
        <ellipse className="rotor rotor-b" cx="98" cy="12" rx="17" ry="2.4" fill="#2c3a4f" opacity=".55" />
        <path d="M22 13v6M98 13v6" stroke="#2c3a4f" strokeWidth="3" />
        <rect x="42" y="14" width="36" height="14" rx="7" fill="#f4f7fb" stroke="#2c3a4f" strokeWidth="2" />
        <circle className="drone-led" cx="60" cy="21" r="2.6" fill="#3ddc84" />
        <path d="M52 28l-4 14M68 28l4 14" stroke="#2c3a4f" strokeWidth="1.6" />
        <rect x="44" y="42" width="32" height="26" rx="4" fill="#fff" stroke="#0b8a4a" strokeWidth="2.4" />
        <path d="M60 48v14M53 55h14" stroke="#0b8a4a" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default function SkyScene({ nature = false }) {
  useEffect(() => {
    document.body.classList.add('sky-page');
    return () => document.body.classList.remove('sky-page');
  }, []);

  return createPortal(
    <div className={`sky${nature ? ' sky-nature' : ''}`} aria-hidden="true">
      <svg className="sky-defs" width="0" height="0">
        {[1, 2, 3].map((seed) => (
          <filter key={seed} id={`sky-cloud-${seed}`} x="-30%" y="-40%" width="160%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="5" seed={seed * 7} />
            <feDisplacementMap in="SourceGraphic" scale="90" />
          </filter>
        ))}
      </svg>
      <div className="sky-rainbow" />
      <div className="sky-sun" />
      <div className="sky-rays" />
      {FLARES.map(([x, y, size, color], i) => (
        <span key={i} className="sky-flare" style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: color, '--i': i }} />
      ))}
      {BIRDS.map(([top, dur, delay, s], i) => (
        <span key={i} className="far-bird" style={{ '--top': `${top}vh`, '--dur': `${dur}s`, '--delay': `${delay}s`, '--s': s }}>
          <svg viewBox="0 0 24 10" width="24" height="10"><path d="M1 6Q6 0 12 6Q18 0 23 6" stroke="#38506e" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
        </span>
      ))}
      <Balloon />
      {CLOUDS.map(([layer, top, w, dur, delay, seed], i) => (
        <div
          key={i}
          className={`cloud cloud-${layer}`}
          style={{ '--top': `${top}vh`, '--w': `${w}vw`, '--dur': `${dur}s`, '--delay': `${delay}s`, '--f': `url(#sky-cloud-${seed})` }}
        >
          <span className="cloud-shade" /><span className="cloud-body" /><span className="cloud-light" />
        </div>
      ))}
      {PIGEONS.map(([top, s, dur, delay], i) => <Pigeon key={i} top={top} scale={s} dur={dur} delay={delay} />)}
      <Drone />
      {MOTES.map((m, i) => (
        <span key={i} className="mote" style={{ left: `${m.x}%`, top: `${m.y}%`, width: m.s, height: m.s, '--d': `${m.d}s`, '--delay': `${m.delay}s` }} />
      ))}
      {nature ? <Storybook /> : null}
      <div className="sky-bank" hidden={nature}>
        {BANK.map(([left, w, seed], i) => (
          <div key={i} className="bank-cloud" style={{ left: `${left}vw`, '--w': `${w}vw`, '--f': `url(#sky-cloud-${seed})`, '--i': i }}>
            <span className="cloud-shade" /><span className="cloud-body" /><span className="cloud-light" />
          </div>
        ))}
      </div>
      <div className="sky-haze" hidden={nature} />
    </div>,
    document.body,
  );
}
