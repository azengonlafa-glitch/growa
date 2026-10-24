// Header nav, drawn as a strip of gingham washi tape with a paper "menu" label and a bitten apple (see navpill.css).
// On a phone only the "เมนู" label stays so the header does not crowd.
import { Icon } from './ui.jsx';
import '../navpill.css';

const LINKS = [
  ['meds', 'ยาของฉัน'],
  ['orders', 'คำสั่งซื้อ'],
  ['family', 'ครอบครัว'],
];

function Apple() {
  return (
    <svg className="navpill-apple" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <mask id="navpill-bite"><rect width="40" height="40" fill="#fff" /><circle cx="31" cy="14" r="5.5" fill="#000" /></mask>
        <radialGradient id="navpill-skin" cx="38%" cy="32%" r="75%"><stop offset="0" stopColor="#ff6a5c" /><stop offset=".6" stopColor="#e1262b" /><stop offset="1" stopColor="#a8141b" /></radialGradient>
      </defs>
      <path mask="url(#navpill-bite)" fill="url(#navpill-skin)" d="M20 11c-3-2.6-9-2.6-11.6 2.4C5.6 18.8 8 29.6 13 34c2.2 1.9 4.2.8 7-.2 2.8 1 4.8 2.1 7 .2 3.6-3.2 6.2-9.8 5-15.2-1.4-6.2-7.4-9.6-12-7.8z" />
      <path d="M20 11c0-3 1.2-5.2 3.4-6.6" stroke="#5b3516" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M22 8c2.4-3.2 6.2-3.6 8-2.6-1 3-4.6 4.6-8 2.6z" fill="#4c9a2a" />
      <ellipse cx="14" cy="17" rx="2.2" ry="3.4" fill="#fff" opacity=".35" transform="rotate(18 14 17)" />
    </svg>
  );
}

export default function NavPill() {
  return (
    <nav className="navpill" aria-label="เมนูลัด">
      <a className="navpill-brand" href="#/" translate="no">growa</a>
      <span className="navpill-links">
        {LINKS.map(([path, label]) => <a key={path} href={`#/${path}`}>{label}</a>)}
      </span>
      <a className="navpill-cta" href="#/care" aria-label="โฮมแคร์และเมนู"><Icon name="people" size={18} /><span>เมนู</span></a>
      <Apple />
    </nav>
  );
}
