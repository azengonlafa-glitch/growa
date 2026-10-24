// Floating frosted pill that replaces the round "menu" icon on the flow headers: wordmark, three shortcuts and a
// pill button to the main menu. On a phone only the wordmark-less "เมนู" button stays so the header does not crowd.
import { Icon } from './ui.jsx';
import '../navpill.css';

const LINKS = [
  ['meds', 'ยาของฉัน'],
  ['orders', 'คำสั่งซื้อ'],
  ['family', 'ครอบครัว'],
];

export default function NavPill() {
  return (
    <nav className="navpill" aria-label="เมนูลัด">
      <a className="navpill-brand" href="#/" translate="no">growa</a>
      <span className="navpill-links">
        {LINKS.map(([path, label]) => <a key={path} href={`#/${path}`}>{label}</a>)}
      </span>
      <a className="navpill-cta" href="#/care" aria-label="โฮมแคร์และเมนู"><Icon name="people" size={18} /><span>เมนู</span></a>
    </nav>
  );
}
