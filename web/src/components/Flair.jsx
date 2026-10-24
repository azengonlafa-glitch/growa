// Decorative, purely visual pieces for the livelier look: animated backdrop, step banner, confetti.
// Everything here is aria-hidden or plain text, and motion is switched off under prefers-reduced-motion (flair.css).
import { useMemo } from 'react';
import { Icon } from './ui.jsx';

const FLOATERS = [
  ['pill', '6%', '14%', 0, 44], ['heart', '90%', '22%', 1.4, 38], ['shield', '12%', '72%', 0.7, 40],
  ['truck', '84%', '66%', 2.1, 46], ['pill', '48%', '88%', 1.1, 34], ['heart', '70%', '8%', 2.8, 30],
];

// Soft colour blobs and slowly drifting health icons behind every page.
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <span className="blob blob-a" /><span className="blob blob-b" /><span className="blob blob-c" />
      {FLOATERS.map(([icon, x, y, delay, size], i) => (
        <span key={i} className="floater" style={{ left: x, top: y, animationDelay: `${delay}s` }}><Icon name={icon} size={size} stroke={1.6} /></span>
      ))}
    </div>
  );
}

// Big gradient banner at the top of the first steps of the flow.
export function Splash({ title, sub, chips = [] }) {
  return (
    <section className="splash" aria-label={title}>
      <span className="splash-orb splash-orb-a" aria-hidden /><span className="splash-orb splash-orb-b" aria-hidden />
      <span className="splash-art" aria-hidden><Icon name="pill" size={260} stroke={1} /></span>
      <span className="splash-icon" aria-hidden><Icon name="pill" size={34} stroke={1.8} /></span>
      <h2 className="splash-title">{title}</h2>
      <p className="splash-sub">{sub}</p>
      {chips.length ? (
        <ul className="splash-chips">
          {chips.map(([icon, text]) => <li key={text}><Icon name={icon} size={18} />{text}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

const CONFETTI = ['#0b8a4a', '#1479d4', '#2fc27a', '#5ab4ff', '#ffd23f', '#ff7a8a'];

// One-shot celebration when the order arrives.
export function Confetti({ count = 46 }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 0.8}s`,
    dur: `${2.4 + Math.random() * 1.8}s`,
    color: CONFETTI[i % CONFETTI.length],
    rot: `${Math.round(Math.random() * 360)}deg`,
    w: 6 + Math.round(Math.random() * 6),
  })), [count]);
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <span key={i} style={{ left: b.left, width: b.w, height: b.w * 1.6, background: b.color, animationDelay: b.delay, animationDuration: b.dur, '--rot': b.rot }} />
      ))}
    </div>
  );
}
