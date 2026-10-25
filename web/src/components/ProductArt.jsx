// Drawn product pictures for the demo catalogue. The sample products have no photos (and no brands, so no
// logos or packaging we do not own), so each one is drawn as a plain unbranded pack of its kind: blister strip,
// carton, pill jar, pump bottle, tube and so on. Picked by catalogId; unknown ids get a generic carton.
// A real photo wins when one exists: drop web/public/products/<catalogId>.jpg (or .png / .webp) and it is shown
// instead of the drawing (see web/public/products/README.md).
import { useId, useState } from 'react';
import { findProductPhoto } from '../assets/productImages.js';

const SHADOW = <ellipse cx="100" cy="176" rx="58" ry="7" fill="#000" opacity=".12" />;

// ── pieces ──
function Carton({ id, color, dark, label, sub, w = 96, h = 112, children }) {
  const x = 100 - w / 2;
  const y = 170 - h;
  return (
    <g>
      <defs>
        <linearGradient id={`${id}c`} x1="0" x2="1"><stop offset="0" stopColor={color} /><stop offset="1" stopColor={dark} /></linearGradient>
      </defs>
      <path d={`M${x + w} ${y + 6} l14 -8 v${h} l-14 8z`} fill={dark} opacity=".85" />
      <rect x={x} y={y} width={w} height={h} rx="5" fill={`url(#${id}c)`} />
      <rect x={x} y={y + h * 0.36} width={w} height={h * 0.34} fill="#fff" opacity=".94" />
      {children}
      <text x="100" y={y + h * 0.54} textAnchor="middle" fontSize="15" fontWeight="700" fill={dark}>{label}</text>
      {sub ? <text x="100" y={y + h * 0.66} textAnchor="middle" fontSize="10.5" fill="#556" >{sub}</text> : null}
      <rect x={x} y={y} width={w} height={h} rx="5" fill="none" stroke="#fff" strokeOpacity=".35" />
    </g>
  );
}

function Blister({ x = 70, y = 118, rows = 2, cols = 5, pill = '#fff', capsule = false }) {
  const w = cols * 18 + 14;
  const h = rows * 22 + 12;
  return (
    <g transform={`rotate(-7 ${x} ${y})`}>
      <rect x={x} y={y} width={w} height={h} rx="6" fill="#dfe6ea" stroke="#fff" strokeWidth="2" />
      <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx="4" fill="#eef2f4" />
      {Array.from({ length: rows * cols }, (_, i) => {
        const cx = x + 16 + (i % cols) * 18;
        const cy = y + 17 + Math.floor(i / cols) * 22;
        return capsule ? (
          <g key={i}><rect x={cx - 7} y={cy - 5} width="14" height="10" rx="5" fill="#fff" stroke="#c4ced4" /><rect x={cx} y={cy - 5} width="7" height="10" rx="5" fill="#f2b84b" /></g>
        ) : (
          <g key={i}><circle cx={cx} cy={cy} r="7.5" fill="#fff" stroke="#c4ced4" /><circle cx={cx} cy={cy} r="5" fill={pill} stroke="#d5dde2" strokeWidth=".6" /></g>
        );
      })}
    </g>
  );
}

function Jar({ id, color, dark, label, sub, pills }) {
  return (
    <g>
      <defs>
        <linearGradient id={`${id}j`} x1="0" x2="1"><stop offset="0" stopColor={color} /><stop offset=".5" stopColor="#fff" stopOpacity=".5" /><stop offset="1" stopColor={dark} /></linearGradient>
      </defs>
      <rect x="62" y="62" width="76" height="108" rx="14" fill={color} />
      <rect x="62" y="62" width="76" height="108" rx="14" fill={`url(#${id}j)`} opacity=".55" />
      <rect x="66" y="40" width="68" height="28" rx="7" fill={dark} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <line key={i} x1={74 + i * 9} y1="44" x2={74 + i * 9} y2="64" stroke="#fff" strokeOpacity=".25" />)}
      <rect x="62" y="92" width="76" height="52" fill="#fff" opacity=".95" />
      <text x="100" y="114" textAnchor="middle" fontSize="14" fontWeight="700" fill={dark}>{label}</text>
      <text x="100" y="130" textAnchor="middle" fontSize="10.5" fill="#556">{sub}</text>
      {pills}
    </g>
  );
}

function PumpBottle({ id, color, dark, label, sub, tall = false, pump = true, cap = false }) {
  const top = tall ? 54 : 72;
  return (
    <g>
      <defs>
        <linearGradient id={`${id}p`} x1="0" x2="1"><stop offset="0" stopColor={color} /><stop offset=".55" stopColor="#fff" stopOpacity=".45" /><stop offset="1" stopColor={dark} /></linearGradient>
      </defs>
      <rect x="64" y={top} width="72" height={170 - top} rx="16" fill={color} />
      <rect x="64" y={top} width="72" height={170 - top} rx="16" fill={`url(#${id}p)`} opacity=".5" />
      {pump ? (
        <g fill={dark}>
          <rect x="92" y={top - 16} width="16" height="18" rx="3" />
          <path d={`M92 ${top - 14} h-18 a4 4 0 0 0 -4 4 v3 h22z`} />
        </g>
      ) : cap ? <rect x="78" y={top - 14} width="44" height="16" rx="5" fill={dark} /> : null}
      <rect x="64" y={top + (170 - top) * 0.34} width="72" height={(170 - top) * 0.38} fill="#fff" opacity=".95" />
      <text x="100" y={top + (170 - top) * 0.34 + 20} textAnchor="middle" fontSize="13" fontWeight="700" fill={dark}>{label}</text>
      <text x="100" y={top + (170 - top) * 0.34 + 34} textAnchor="middle" fontSize="10" fill="#556">{sub}</text>
    </g>
  );
}

function Tube({ id, color, dark, label, sub, upright = true }) {
  return (
    <g transform={upright ? undefined : 'rotate(-18 100 110)'}>
      <defs>
        <linearGradient id={`${id}t`} x1="0" x2="1"><stop offset="0" stopColor={color} /><stop offset=".5" stopColor="#fff" stopOpacity=".5" /><stop offset="1" stopColor={dark} /></linearGradient>
      </defs>
      <path d="M72 58 h56 l4 96 h-64z" fill={color} />
      <path d="M72 58 h56 l4 96 h-64z" fill={`url(#${id}t)`} opacity=".5" />
      <rect x="86" y="36" width="28" height="24" rx="5" fill={dark} />
      <path d="M68 154 h64 v8 h-64z" fill={dark} opacity=".8" />
      {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={72 + i * 14} y1="156" x2={72 + i * 14} y2="161" stroke="#fff" strokeOpacity=".5" />)}
      <rect x="70" y="84" width="60" height="44" fill="#fff" opacity=".95" />
      <text x="100" y="104" textAnchor="middle" fontSize="13" fontWeight="700" fill={dark}>{label}</text>
      <text x="100" y="119" textAnchor="middle" fontSize="10" fill="#556">{sub}</text>
    </g>
  );
}

function Sachets({ color, dark }) {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`rotate(${-14 + i * 14} ${100 + (i - 1) * 30} 168)`}>
          <rect x={80 + (i - 1) * 30} y="98" width="40" height="70" rx="3" fill={i === 1 ? color : dark} opacity={i === 1 ? 1 : 0.75} />
          <path d={`M${80 + (i - 1) * 30} 100 h40 M${80 + (i - 1) * 30} 166 h40`} stroke="#fff" strokeOpacity=".6" strokeDasharray="3 2" />
        </g>
      ))}
    </g>
  );
}

// ── one drawing per catalogue entry ──
const ART = {
  para500: (id) => <><Carton id={id} color="#2fb6e6" dark="#0b6f9c" label="พารา" sub="500 มก." w={86} h={96} /><Blister x={74} y={134} rows={1} cols={4} /></>,
  cpm4: (id) => <><Carton id={id} color="#f2a33a" dark="#a8620d" label="แก้แพ้" sub="4 มก." w={86} h={96} /><Blister x={74} y={134} rows={1} cols={4} pill="#f3e17a" /></>,
  loratadine10: (id) => <><Carton id={id} color="#9a7be0" dark="#5a3ea6" label="แก้แพ้" sub="10 มก." w={86} h={96} /><Blister x={74} y={134} rows={1} cols={4} /></>,
  ibuprofen400: (id) => <><Carton id={id} color="#ef6a6a" dark="#a82727" label="แก้ปวด" sub="400 มก." w={86} h={96} /><Blister x={74} y={134} rows={1} cols={4} pill="#f5c9a0" /></>,
  omeprazole20: (id) => <><Carton id={id} color="#46b98a" dark="#16744f" label="ลดกรด" sub="20 มก." w={86} h={96} /><Blister x={74} y={134} rows={1} cols={4} capsule /></>,
  amlodipine5: (id) => <Carton id={id} color="#5b8def" dark="#2749a8" label="แอมโลดิปีน" sub="5 มก. · 30 เม็ด" />,
  metformin500: (id) => <Carton id={id} color="#35a7a7" dark="#126666" label="เมทฟอร์มิน" sub="500 มก. · 50 เม็ด" />,
  diazepam5: (id) => <Carton id={id} color="#8a97a3" dark="#4a5864" label="ยาควบคุม" sub="5 มก." />,
  ors: (id) => <><Sachets color="#ffd24a" dark="#ff9f2e" /><Carton id={id} color="#ffb13b" dark="#c56d00" label="เกลือแร่" sub="ORS 10 ซอง" w={92} h={70} /></>,
  antacid: (id) => <PumpBottle id={id} color="#e9f3f7" dark="#3a8cae" label="ยาลดกรด" sub="240 มล." pump={false} cap />,
  calamine: (id) => <PumpBottle id={id} color="#f6b7c4" dark="#c2476a" label="คาลาไมน์" sub="โลชั่น 60 มล." tall={false} pump={false} cap />,
  vitc500: (id) => <Jar id={id} color="#ffae2b" dark="#c26a00" label="วิตามินซี" sub="500 มก. · 30 เม็ด" />,
  multivit: (id) => <Jar id={id} color="#ff7a3d" dark="#b3410d" label="วิตามินรวม" sub="60 เม็ด" />,
  calciumD: (id) => <Jar id={id} color="#5bc0eb" dark="#17709a" label="แคลเซียม+D" sub="30 เม็ด" />,
  fishOil: (id) => <Jar id={id} color="#f0c14b" dark="#8f6a00" label="น้ำมันปลา" sub="30 แคปซูล" />,
  shampooAntiDandruff: (id) => <PumpBottle id={id} color="#3ab7c8" dark="#0e6a78" label="แชมพู" sub="ขจัดรังแค 200 มล." />,
  shampooGentle: (id) => <PumpBottle id={id} color="#8fd6a5" dark="#2d7d4a" label="แชมพู" sub="อ่อนโยน 300 มล." tall />,
  conditioner: (id) => <PumpBottle id={id} color="#f4a6c0" dark="#b03c68" label="ครีมนวด" sub="250 มล." />,
  moisturizer: (id) => <PumpBottle id={id} color="#c7b4f0" dark="#6a49b8" label="โลชั่น" sub="บำรุงผิว 250 มล." tall />,
  handGel: (id) => <PumpBottle id={id} color="#bfe6f5" dark="#2b86ad" label="เจลล้างมือ" sub="แอลกอฮอล์ 100 มล." />,
  sunscreen: (id) => <Tube id={id} color="#ffd35c" dark="#c27d00" label="กันแดด" sub="SPF50 · 50 มล." upright={false} />,
  toothpaste: (id) => <Tube id={id} color="#4fc3f7" dark="#0f73a8" label="ยาสีฟัน" sub="ฟลูออไรด์ 160 ก." upright={false} />,
  lipBalm: () => (
    <g>
      <rect x="78" y="86" width="44" height="82" rx="7" fill="#f78fb3" />
      <rect x="78" y="86" width="44" height="82" rx="7" fill="#fff" opacity=".18" />
      <rect x="80" y="58" width="40" height="34" rx="6" fill="#fff" stroke="#e5d7dc" />
      <path d="M84 64 h32 v12 l-16 4 -16 -4z" fill="#ff6f91" />
      <rect x="78" y="116" width="44" height="22" fill="#fff" opacity=".95" />
      <text x="100" y="131" textAnchor="middle" fontSize="12" fontWeight="700" fill="#c0396a">ลิปบาล์ม</text>
    </g>
  ),
  probiotic: (id) => <><Sachets color="#a5dc86" dark="#52a23a" /><Carton id={id} color="#7ccf6b" dark="#2f7a25" label="โพรไบโอติก" sub="10 ซอง" w={92} h={70} /></>,
  collagen: (id) => <><Sachets color="#ffc0d0" dark="#e4789a" /><Carton id={id} color="#ff9db8" dark="#b83a68" label="คอลลาเจน" sub="14 ซอง" w={92} h={70} /></>,
  faceMask: (id) => (
    <Carton id={id} color="#5fb3e8" dark="#1c6aa0" label="หน้ากากอนามัย" sub="50 ชิ้น" w={104} h={92}>
      <g transform="translate(100 78)">
        <path d="M-26 -8 q26 -10 52 0 v14 q-26 12 -52 0z" fill="#dff2fb" stroke="#fff" strokeWidth="1.5" />
        <path d="M-22 -3 h44 M-22 1 h44 M-22 5 h44" stroke="#9ccbe3" strokeWidth="1" />
      </g>
    </Carton>
  ),
  bandage: (id) => (
    <g>
      <rect x="44" y="82" width="112" height="76" rx="10" fill="#f2c27b" />
      <rect x="44" y="82" width="112" height="76" rx="10" fill="#fff" opacity=".12" />
      <rect x="44" y="82" width="112" height="22" rx="10" fill="#d9993f" />
      <g transform="rotate(-18 100 70)">
        <rect x="60" y="46" width="80" height="22" rx="11" fill="#f6d3a8" stroke="#e1b27a" />
        <rect x="88" y="46" width="24" height="22" fill="#fff" stroke="#e1b27a" />
      </g>
      <rect x="62" y="116" width="76" height="26" rx="4" fill="#fff" opacity=".95" />
      <text x="100" y="133" textAnchor="middle" fontSize="13" fontWeight="700" fill="#a8641a">พลาสเตอร์</text>
    </g>
  ),
  thermometer: () => (
    <g transform="rotate(-30 100 100)">
      <rect x="86" y="30" width="28" height="130" rx="14" fill="#f4f6f8" stroke="#cfd8de" strokeWidth="2" />
      <rect x="92" y="48" width="16" height="30" rx="3" fill="#cdeedd" stroke="#8cc8a9" />
      <text x="100" y="69" textAnchor="middle" fontSize="11" fontWeight="700" fill="#17663f">36.5</text>
      <circle cx="100" cy="98" r="5" fill="#46b98a" />
      <rect x="95" y="118" width="10" height="30" rx="5" fill="#cfd8de" />
    </g>
  ),
};

const EXTENSIONS = ['jpg', 'png', 'webp'];

export default function ProductArt({ catalogId, label }) {
  const id = useId().replace(/:/g, '');
  const [tried, setTried] = useState(0); // how many photo file types failed to load

  const photo = findProductPhoto(catalogId, label);
  if (photo) {
    return (
      <img
        className="product-photo"
        src={photo}
        alt={label || catalogId || 'สินค้า'}
        loading="lazy"
        decoding="async"
      />
    );
  }

  if (catalogId && tried < EXTENSIONS.length) {
    return (
      <img
        className="product-photo"
        src={`/products/${catalogId}.${EXTENSIONS[tried]}`}
        alt={label || catalogId}
        loading="lazy"
        decoding="async"
        onError={() => setTried((n) => n + 1)}
      />
    );
  }
  const draw = ART[catalogId] ?? ((i) => <Carton id={i} color="#7ac7a0" dark="#2c7a54" label={label || 'สินค้า'} />);
  return (
    <svg className="product-art" viewBox="24 26 152 156" role="img" aria-label={label} fontFamily="inherit">
      {SHADOW}
      {draw(id)}
    </svg>
  );
}
