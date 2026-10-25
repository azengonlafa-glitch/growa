// The clinic desk and the clipboard for the symptom questions: a mint desk with a stethoscope, pill packs, a thermometer and a plant,
// and a paper-cut kraft clipboard that carries the questions. Purely decorative around the real content.
import './desk.css';

export function Desk() {
  return (
    <div className="desk" aria-hidden>
      <svg width="0" height="0" className="desk-defs">
        <filter id="cb-rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" />
        </filter>
      </svg>
      <svg className="dk-steth" viewBox="0 0 220 260">
        <path d="M40 10 v70 a50 50 0 0 0 100 0 v-70" fill="none" stroke="#3d4a5c" strokeWidth="9" strokeLinecap="round" />
        <path d="M90 130 v40 a45 45 0 0 0 90 0 v-20" fill="none" stroke="#3d4a5c" strokeWidth="9" strokeLinecap="round" />
        <circle cx="180" cy="140" r="26" fill="#b9c4d3" stroke="#3d4a5c" strokeWidth="8" /><circle cx="180" cy="140" r="11" fill="#e8eef6" />
        <circle cx="40" cy="10" r="9" fill="#e85d5d" /><circle cx="140" cy="10" r="9" fill="#e85d5d" />
      </svg>
      <svg className="dk-blister" viewBox="0 0 200 120">
        <rect width="200" height="120" rx="14" fill="#e9eef3" stroke="#c7d0da" strokeWidth="3" />
        {[0, 1, 2, 3].map((c) => [0, 1].map((r) => (
          <g key={`${c}${r}`}><ellipse cx={34 + c * 44} cy={36 + r * 48} rx="17" ry="14" fill="#fff" stroke="#c7d0da" strokeWidth="2.5" /><ellipse cx={34 + c * 44} cy={36 + r * 48} rx="11" ry="8" fill={c === 2 && r === 1 ? 'none' : (r ? '#f6b84a' : '#e86d6d')} /></g>
        )))}
      </svg>
      <svg className="dk-thermo" viewBox="0 0 220 40">
        <rect x="6" y="9" width="190" height="22" rx="11" fill="#f4f6f9" stroke="#bfc8d4" strokeWidth="3" />
        <rect x="14" y="15" width="120" height="10" rx="5" fill="#ef6a6a" />
        <circle cx="200" cy="20" r="14" fill="#ef6a6a" stroke="#bfc8d4" strokeWidth="3" />
        {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${24 + i * 12} 9 v${i % 2 ? 4 : 7}`} stroke="#8a95a5" strokeWidth="1.6" />)}
      </svg>
      <svg className="dk-cross" viewBox="0 0 100 100"><rect x="6" y="6" width="88" height="88" rx="22" fill="#ee5a5a" /><path d="M50 24v52M24 50h52" stroke="#fff" strokeWidth="16" strokeLinecap="round" /></svg>
      <svg className="dk-pen" viewBox="0 0 260 30"><path d="M0 15 L26 4 H236 a10 10 0 0 1 0 22 H26 Z" fill="#3b78c4" /><path d="M0 15 L26 4 V26 Z" fill="#f2d3a4" /><path d="M0 15 L9 11 V19 Z" fill="#2c2c34" /><rect x="190" y="4" width="46" height="22" fill="#2f63a6" /></svg>
      <svg className="dk-plant" viewBox="0 0 220 240">
        <path d="M110 230 C100 170 70 120 20 90 C60 80 100 110 110 160 C112 120 130 70 190 40 C170 100 130 150 118 230Z" fill="#5fb08a" />
        <path d="M110 230 C112 190 120 150 150 120 C150 170 130 200 116 230Z" fill="#3f9470" />
        <path d="M70 232 h80 l-10 -22 h-60Z" fill="#d98a5b" />
      </svg>
      <span className="dk-pill dp-1" /><span className="dk-pill dp-2" /><span className="dk-pill dp-3" />
    </div>
  );
}

// Kraft board with a clip and cream paper; the children are written on the paper.
export function Clipboard({ children, className = '' }) {
  return (
    <div className={`clipboard ${className}`}>
      <span className="cb-clip" aria-hidden />
      <div className="cb-paper">{children}</div>
    </div>
  );
}

export function DeskPage({ children }) {
  return (
    <div className="desk-page">
      <Desk />
      {children}
    </div>
  );
}
