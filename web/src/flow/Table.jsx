// Payment screen set: a blue gingham tablecloth with a cardboard box on it. The order summary and payment choices are inside the box,
// next to a few small keepsakes. Everything except the children is decoration.
import './table.css';

const Star = ({ fill, stroke, className }) => (
  <svg className={`tb-star ${className}`} viewBox="0 0 50 50"><path d="M25 3l6.5 14.5 15.8 1.6-11.9 10.6 3.5 15.5L25 37l-13.9 8.2 3.5-15.5L2.7 19.1l15.8-1.6z" fill={fill} stroke={stroke} strokeWidth="3" strokeLinejoin="round" /></svg>
);

function Keepsakes() {
  return (
    <div className="tb-things" aria-hidden>
      <svg className="tb-film" viewBox="0 0 90 260">
        <rect width="90" height="260" fill="#1f45b8" />
        {[0, 1, 2].map((i) => <g key={i}><rect x="8" y={8 + i * 84} width="74" height="76" fill="#f4f4f0" /><rect x="14" y={14 + i * 84} width="62" height="64" fill={['#cfe3f5', '#f6d3d6', '#d9efd3'][i]} />
          <circle cx="45" cy={46 + i * 84} r="15" fill={['#4f86c6', '#e0707a', '#5fae6d'][i]} /><path d={`M${30} ${74 + i * 84} q15 -22 30 0z`} fill="#fff" opacity=".7" /></g>)}
      </svg>
      <Star fill="#e9d3a0" stroke="#bfa56a" className="ts-1" /><Star fill="#cfd3d9" stroke="#9aa1ab" className="ts-2" /><Star fill="#f0e2bd" stroke="#c7ae74" className="ts-3" />
      <Star fill="none" stroke="#a31d2c" className="ts-4" /><Star fill="none" stroke="#a31d2c" className="ts-5" />
      <svg className="tb-polaroid tp-1" viewBox="0 0 120 140"><rect width="120" height="140" fill="#fbfbf8" /><rect x="9" y="9" width="102" height="96" fill="#bfd6ea" /><path d="M14 105 q30 -50 60 -10 q20 -28 36 10z" fill="#7fb08a" /><circle cx="84" cy="34" r="12" fill="#f6dc7a" /></svg>
      <svg className="tb-polaroid tp-2" viewBox="0 0 120 140"><rect width="120" height="140" fill="#fbfbf8" /><rect x="9" y="9" width="102" height="96" fill="#f3d4d4" /><path d="M60 88 C20 62 30 28 60 46 C90 28 100 62 60 88z" fill="#e8626f" /></svg>
      <svg className="tb-cassette" viewBox="0 0 230 150"><rect width="230" height="150" rx="12" fill="#f4f2ec" stroke="#cfcbbd" strokeWidth="3" /><rect x="20" y="22" width="190" height="62" rx="8" fill="#e3e0d4" />
        <circle cx="72" cy="53" r="24" fill="#2b2b2f" /><circle cx="72" cy="53" r="12" fill="#e9e9e4" /><circle cx="158" cy="53" r="24" fill="#2b2b2f" /><circle cx="158" cy="53" r="12" fill="#e9e9e4" />
        <path d="M60 112 h110 l12 24 h-134z" fill="#d6d2c4" /><rect x="120" y="14" width="64" height="26" fill="#b4574d" opacity=".85" transform="rotate(-8 150 27)" /></svg>
      <svg className="tb-wallet" viewBox="0 0 200 130"><rect x="14" y="10" width="150" height="46" rx="6" fill="#e9eef4" transform="rotate(-6 90 30)" /><rect x="40" y="6" width="130" height="40" rx="6" fill="#f3ead2" transform="rotate(4 100 26)" /><rect y="40" width="200" height="90" rx="12" fill="#a3682f" /><path d="M10 52 h180" stroke="#7d4d20" strokeWidth="3" strokeDasharray="6 5" /></svg>
      <div className="tb-note"><span>ขอบคุณที่ใช้ growa</span></div>
      <svg className="tb-keys" viewBox="0 0 110 150"><circle cx="46" cy="22" r="16" fill="none" stroke="#9aa3b2" strokeWidth="5" /><path d="M46 38 v34" stroke="#9aa3b2" strokeWidth="5" />
        <circle cx="26" cy="104" r="16" fill="#e0494f" /><circle cx="64" cy="122" r="16" fill="#f1c24b" /><circle cx="88" cy="88" r="16" fill="#4cae6b" /><path d="M46 72 L26 90 M46 72 L64 106 M46 72 L84 78" stroke="#9aa3b2" strokeWidth="3" /></svg>
    </div>
  );
}

// Open cardboard box seen from above. The walls are mitred borders; the floor holds the content.
export function CardboardBox({ children }) {
  return (
    <div className="cbox">
      <div className="cbox-floor">
        <Keepsakes />
        <div className="cbox-content">{children}</div>
      </div>
    </div>
  );
}

export function TablePage({ children }) {
  return (
    <div className="table-page">
      <div className="tablecloth" aria-hidden>
        <span className="tc-box tc-box-1" /><span className="tc-box tc-box-2" />
      </div>
      {children}
    </div>
  );
}
