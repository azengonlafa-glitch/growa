// The green cutting mat shared by the sticky-note screens.
import './mat.css';

// The desk the notes lie on: a green cutting mat with a pencil, ruler, eraser, paper clip and washi tape. Purely decorative.
export function Mat() {
  return (
    <div className="mat" aria-hidden>
      <svg className="mat-lines" viewBox="0 0 1000 700" preserveAspectRatio="none">
        <path d="M0 520 L1000 330" /><path d="M0 610 L1000 250" /><path d="M120 700 L760 0" />
      </svg>
      <span className="mat-holes"><i /><i /><i /><i /></span>
      <span className="mat-tape mt-1" /><span className="mat-tape mt-2" />
      <svg className="mat-pencil" viewBox="0 0 320 36">
        <path d="M0 18 L34 4 H300 V32 H34 Z" fill="#f4b73c" /><path d="M34 4 H300 V12 H34Z" fill="#fbd37a" /><path d="M34 26 H300 V32 H34Z" fill="#c98616" />
        <path d="M0 18 L34 4 V32 Z" fill="#f2d3a4" /><path d="M0 18 L12 13 V23 Z" fill="#3b3b44" />
        <rect x="300" y="4" width="20" height="28" rx="4" fill="#ec6b6b" /><rect x="292" y="4" width="10" height="28" fill="#b9bcc4" />
      </svg>
      <svg className="mat-ruler" viewBox="0 0 360 54">
        <rect width="360" height="54" rx="6" fill="#f6efd6" opacity=".92" />
        {Array.from({ length: 36 }, (_, i) => <path key={i} d={`M${10 + i * 9.6} 0 v${i % 5 === 0 ? 20 : 11}`} stroke="#6b5b2e" strokeWidth="1.6" />)}
      </svg>
      <span className="mat-eraser" />
      <svg className="mat-scissors" viewBox="0 0 180 90"><g fill="none" stroke="#c9ced8" strokeWidth="7" strokeLinecap="round"><path d="M70 45 L170 10" /><path d="M70 45 L170 80" /></g><circle cx="28" cy="22" r="16" fill="none" stroke="#e85d5d" strokeWidth="9" /><circle cx="28" cy="68" r="16" fill="none" stroke="#e85d5d" strokeWidth="9" /><path d="M42 28 L74 45 M42 62 L74 45" stroke="#e85d5d" strokeWidth="8" strokeLinecap="round" /></svg>
      <span className="mat-mini mm-1" /><span className="mat-mini mm-2" /><span className="mat-mini mm-3" />
      <svg className="mat-clip" viewBox="0 0 40 90"><path d="M12 62V18a9 9 0 0 1 18 0v50a14 14 0 0 1-28 0V26" fill="none" stroke="#9aa3b2" strokeWidth="4" strokeLinecap="round" /></svg>
      <span className="mat-rim" />
    </div>
  );
}


// Wraps a FlowPage so it sits on the mat.
export function MatPage({ children }) {
  return (
    <div className="mat-page">
      <Mat />
      {children}
    </div>
  );
}
