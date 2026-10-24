// Storybook countryside for SkyScene's nature mode (step 2): blue mountains, a lake with a red-roof village, rolling
// meadows with tree clumps, a dirt path, then foreground pieces anchored to the screen corners — a leafy branch over
// the top-left, bushes with daisies bottom-left, a fence and a picnic crate with gingham cloth bottom-right — and a
// few leaves drifting down. All SVG, no image files; decorative only.

const DAISY_PETALS = [0, 40, 80, 120, 160, 200, 240, 280, 320];
function Daisy({ x, y, r = 14, className = '' }) {
  return (
    <g className={`daisy-g ${className}`} transform={`translate(${x} ${y})`}>
      {DAISY_PETALS.map((a) => <ellipse key={a} cx="0" cy={-r * 0.62} rx={r * 0.28} ry={r * 0.55} fill="#fff" transform={`rotate(${a})`} />)}
      <circle r={r * 0.32} fill="#ffd23f" /><circle r={r * 0.32} fill="none" stroke="#e8a817" strokeWidth={r * 0.06} />
    </g>
  );
}

const LEAF = 'M0 0C9-11 25-12 34 0 25 12 9 11 0 0z';
function Leaf({ x, y, s = 1, rot = 0, fill }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d={LEAF} fill={fill} /><path d="M2 0h28" stroke="rgb(255 255 255 / 35%)" strokeWidth="1.2" />
    </g>
  );
}
const GREENS = ['#4fae3c', '#6cc449', '#8ad65a', '#3d9a35', '#a6e070'];
const pick = (i) => GREENS[i % GREENS.length];

// Middle of the scene: everything between the sky and the foreground.
function Land() {
  return (
    <svg className="sb-land" viewBox="0 0 1600 700" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id="sb-mt1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9cc0ec" /><stop offset="1" stopColor="#c9e0f6" /></linearGradient>
        <linearGradient id="sb-mt2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5f8fd0" /><stop offset="1" stopColor="#9ec3ea" /></linearGradient>
        <linearGradient id="sb-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b7e889" /><stop offset="1" stopColor="#93d466" /></linearGradient>
        <linearGradient id="sb-lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bfeaff" /><stop offset="1" stopColor="#6cc6f2" /></linearGradient>
        <linearGradient id="sb-near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9be05f" /><stop offset=".55" stopColor="#6cc43f" /><stop offset="1" stopColor="#4aa52f" /></linearGradient>
        <linearGradient id="sb-path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2dcae" /><stop offset="1" stopColor="#d9b073" /></linearGradient>
        <filter id="sb-bush" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".07" numOctaves="2" seed="5" /><feDisplacementMap in="SourceGraphic" scale="10" /></filter>
      </defs>

      {/* mountains */}
      <path d="M0 230Q90 170 170 190T360 120Q440 90 520 150T720 110Q800 70 880 130T1060 90Q1150 40 1240 110T1430 100Q1520 80 1600 130V300H0z" fill="url(#sb-mt1)" />
      <path d="M380 270Q520 130 660 200T900 190Q980 140 1060 200T1240 170Q1320 140 1420 210T1600 230V320H380z" fill="url(#sb-mt2)" opacity=".9" />
      <path d="M640 168l20-26 22 30-14-6zM1260 150l22-28 20 30-12-8z" fill="#fff" opacity=".6" />

      {/* far meadow with tree lines and the village */}
      <path d="M0 290Q300 250 600 285T1200 270 1600 290V420H0z" fill="url(#sb-far)" />
      <g filter="url(#sb-bush)">
        {Array.from({ length: 26 }, (_, i) => {
          const x = 560 + i * 34 + (i % 3) * 6;
          return <circle key={i} cx={x} cy={282 - (i % 4) * 3} r={16 + (i % 3) * 5} fill={['#4f9e3a', '#5fb245', '#3f8a32'][i % 3]} />;
        })}
      </g>
      {[[1010, 282, 1], [1060, 276, 0.8], [1150, 270, 1.15], [1215, 278, 0.85], [1270, 268, 1], [940, 286, 0.7]].map(([x, y, s], i) => (
        <g key={x} transform={`translate(${x} ${y}) scale(${s})`}>
          <rect x="-22" y="-22" width="44" height="26" fill="#fbf7ee" /><rect x="-22" y="-22" width="44" height="26" fill="none" stroke="#d9cdb4" strokeWidth="1.5" />
          <path d="M-28-20 0-44 28-20z" fill={i % 2 ? '#d8423a' : '#e85a44'} /><path d="M-28-20 0-44 2-42-24-20z" fill="#b8332c" opacity=".5" />
          <rect x="-14" y="-14" width="8" height="8" fill="#7fb7e0" /><rect x="6" y="-14" width="8" height="8" fill="#7fb7e0" /><rect x="-4" y="-8" width="8" height="12" fill="#a0652e" />
        </g>
      ))}

      {/* lake with shimmer and its little fence */}
      <path d="M520 330Q700 300 960 306T1340 318Q1300 352 1060 356T560 352Q500 346 520 330z" fill="url(#sb-lake)" />
      {[[640, 326, 90], [820, 332, 140], [1010, 330, 110], [1180, 334, 80], [730, 342, 70]].map(([x, y, w], i) => (
        <rect key={i} className="sb-shimmer" style={{ '--d': `${-i * 0.7}s` }} x={x} y={y} width={w} height="2.4" rx="1.2" fill="#fff" opacity=".8" />
      ))}
      <g stroke="#9a6a3a" strokeWidth="4" strokeLinecap="round">
        <path d="M560 372H1140M560 386H1140" strokeWidth="3" />
        {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${565 + i * 52} 364v32`} />)}
      </g>

      {/* near meadow with tree clumps on both sides */}
      <path d="M0 360Q260 330 520 380T1000 392 1600 360V700H0z" fill="url(#sb-near)" />
      <g filter="url(#sb-bush)">
        {[[60, 300, 70], [150, 280, 90], [250, 310, 64], [330, 330, 50], [1330, 300, 70], [1430, 280, 90], [1530, 300, 76], [1250, 330, 46]].map(([x, y, r], i) => (
          <g key={i}>
            <rect x={x - 6} y={y + r * 0.5} width="12" height={r * 0.9} fill="#7a5231" />
            <circle cx={x} cy={y} r={r} fill={['#3f9a35', '#4caa3c', '#368a2f'][i % 3]} />
            <circle cx={x - r * 0.35} cy={y - r * 0.3} r={r * 0.55} fill="#6cc449" />
            <circle cx={x - r * 0.45} cy={y - r * 0.45} r={r * 0.25} fill="#a6e070" opacity=".8" />
          </g>
        ))}
      </g>

      {/* path from the front down to the lake */}
      <path d="M860 700C900 620 1000 590 960 520 930 470 900 440 940 404L968 404C940 440 970 470 1010 520 1060 590 1010 640 1080 700z" fill="url(#sb-path)" />
      <path d="M900 700C940 630 1020 600 985 530" stroke="#c99a5c" strokeWidth="3" fill="none" opacity=".4" />

      {/* small daisies and grass in the meadow */}
      {Array.from({ length: 40 }, (_, i) => <Daisy key={i} x={40 + ((i * 113) % 1520)} y={430 + ((i * 47) % 240)} r={4 + (i % 3) * 1.6} />)}
      {Array.from({ length: 120 }, (_, i) => {
        const x = (i * 13.3) % 1600; const h = 18 + (i % 5) * 7;
        return <path key={i} className="blade" style={{ '--d': `${-((i * 0.37) % 3)}s` }} d={`M${x} 702q3-${h / 2} ${(i % 5) - 2} -${h}q4 ${h / 2} 6 ${h}z`} fill={['#4aa52f', '#5cb83a', '#3d9428'][i % 3]} />;
      })}
    </svg>
  );
}

// Top-left: trunk and a branch heavy with leaves, hanging over the scene.
function Branch() {
  const leaves = Array.from({ length: 70 }, (_, i) => ({
    x: 40 + ((i * 53) % 600) * (1 - ((i * 7) % 10) / 40), y: -10 + ((i * 37) % 210) * (0.4 + ((i * 53) % 600) / 1100),
    s: 1.1 + (i % 4) * 0.35, rot: ((i * 47) % 160) - 40,
  }));
  return (
    <svg className="sb-branch" viewBox="0 0 700 520" aria-hidden>
      <defs>
        <linearGradient id="sb-bark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6b4220" /><stop offset=".5" stopColor="#9a6436" /><stop offset="1" stopColor="#5a3518" /></linearGradient>
      </defs>
      <path d="M-30 520C10 420 40 330 46 240 52 150 30 70 -10-20H110C130 70 140 160 128 250 116 340 70 430 40 520z" fill="url(#sb-bark)" />
      <path d="M100 150C220 110 340 70 520 40" stroke="url(#sb-bark)" strokeWidth="28" strokeLinecap="round" fill="none" />
      <path d="M300 90C360 110 420 140 470 190" stroke="#7a4b25" strokeWidth="12" strokeLinecap="round" fill="none" />
      <g className="sb-sway">
        {[[60, 30, 90], [200, 40, 100], [360, 10, 110], [520, 0, 90], [140, -20, 80]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={['#3f9a35', '#4caa3c'][i % 2]} />
        ))}
        {leaves.map((l, i) => <Leaf key={i} x={l.x} y={l.y} s={l.s} rot={l.rot} fill={pick(i)} />)}
        <Leaf x={470} y={200} s={1.6} rot={70} fill="#6cc449" /><Leaf x={420} y={230} s={1.3} rot={100} fill="#8ad65a" />
      </g>
    </svg>
  );
}

// Bottom-left: a bush with big leaves and daisies.
function BushLeft() {
  return (
    <svg className="sb-bush-l" viewBox="0 0 560 300" aria-hidden>
      {[[60, 260, 120], [200, 280, 110], [330, 300, 90], [0, 200, 90]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={['#3d9a35', '#4caa3c', '#5cb83a', '#368a2f'][i]} />)}
      {Array.from({ length: 18 }, (_, i) => <Leaf key={i} x={10 + i * 22} y={190 + (i % 4) * 22} s={1.8 + (i % 3) * 0.5} rot={-80 + (i % 6) * 22} fill={pick(i + 1)} />)}
      <Daisy x={110} y={170} r={34} className="sb-nod" /><Daisy x={40} y={120} r={24} className="sb-nod" /><Daisy x={250} y={210} r={22} className="sb-nod" /><Daisy x={190} y={260} r={18} />
    </svg>
  );
}

// Bottom-right: fence, a picnic crate with gingham cloth, a bush and daisies.
function CornerRight() {
  return (
    <svg className="sb-corner-r" viewBox="0 0 640 440" aria-hidden>
      <defs>
        <pattern id="sb-gingham" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <rect width="26" height="26" fill="#fff" /><rect width="13" height="26" fill="#e3262f" opacity=".55" /><rect width="26" height="13" fill="#e3262f" opacity=".55" />
        </pattern>
        <linearGradient id="sb-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9a466" /><stop offset="1" stopColor="#a8703a" /></linearGradient>
      </defs>
      {/* fence */}
      <g fill="url(#sb-wood)" stroke="#8a5a2c" strokeWidth="3">
        <rect x="40" y="170" width="600" height="22" rx="8" /><rect x="40" y="226" width="600" height="22" rx="8" />
        {[60, 240, 430, 600].map((x) => <rect key={x} x={x} y={x === 430 ? 80 : 130} width={x === 430 ? 54 : 38} height="320" rx="10" />)}
      </g>
      {/* crate */}
      <g stroke="#8a5a2c" strokeWidth="3">
        <rect x="280" y="300" width="300" height="140" rx="10" fill="url(#sb-wood)" />
        <path d="M280 346H580M280 392H580" />
      </g>
      <path d="M360 250C420 236 520 232 640 244V430C600 404 560 390 520 396 500 340 460 300 360 250z" fill="url(#sb-gingham)" stroke="#c51f28" strokeWidth="2" />
      <path d="M360 250C420 236 520 232 640 244" stroke="#fff" strokeWidth="3" opacity=".6" fill="none" />
      {/* plants in the crate and in front */}
      {Array.from({ length: 10 }, (_, i) => <Leaf key={i} x={300 + i * 12} y={290 - (i % 3) * 18} s={1.7} rot={-120 + i * 12} fill={pick(i)} />)}
      {[[560, 440, 110], [440, 450, 80], [640, 380, 90]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={['#3d9a35', '#4caa3c', '#368a2f'][i]} />)}
      {Array.from({ length: 12 }, (_, i) => <Leaf key={`f${i}`} x={420 + i * 20} y={380 + (i % 3) * 20} s={1.9} rot={-100 + i * 14} fill={pick(i + 2)} />)}
      <Daisy x={500} y={370} r={26} className="sb-nod" /><Daisy x={600} y={330} r={20} className="sb-nod" />
    </svg>
  );
}

const FALLING = Array.from({ length: 7 }, (_, i) => ({ x: 8 + i * 13, d: 9 + (i % 3) * 3, delay: -i * 2.3, s: 0.8 + (i % 3) * 0.3 }));

export default function Storybook() {
  return (
    <div className="storybook">
      <Land />
      <Branch />
      <BushLeft />
      <CornerRight />
      {FALLING.map((l, i) => (
        <span key={i} className="sb-falling" style={{ left: `${l.x}%`, '--d': `${l.d}s`, '--delay': `${l.delay}s`, '--s': l.s }}>
          <svg viewBox="-2 -14 38 28" width="30" height="22"><path d={LEAF} fill={pick(i)} /></svg>
        </span>
      ))}
    </div>
  );
}
