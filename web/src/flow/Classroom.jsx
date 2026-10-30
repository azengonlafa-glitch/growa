// A classroom seen out of focus: a wall with a framed chalkboard, light from the windows and rows of school desks.
// It sits behind the main menu so the folders read as the sharp thing in the room. Purely decorative.
import './classroom.css';

function Desk({ x, y, s }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-70" y="40" width="10" height="70" fill="#5b4632" />
      <rect x="60" y="40" width="10" height="70" fill="#5b4632" />
      <rect x="-80" y="20" width="160" height="26" rx="4" fill="#b98a58" />
      <rect x="-80" y="20" width="160" height="7" rx="3" fill="#d8ab76" />
      <rect x="-40" y="-40" width="80" height="50" rx="8" fill="#6f8f9c" />
      <rect x="-34" y="10" width="8" height="60" fill="#4c5f68" />
      <rect x="26" y="10" width="8" height="60" fill="#4c5f68" />
    </g>
  );
}

export function Classroom() {
  return (
    <div className="classroom" aria-hidden>
      <div className="cr-scene">
        <span className="cr-wall" />
        <div className="cr-board">
          <svg className="cr-chalk" viewBox="0 0 1000 400" preserveAspectRatio="none">
            <path d="M80 90 q60 -30 120 0 t120 0" />
            <path d="M90 150 h260" />
            <path d="M90 190 h200" />
            <path d="M620 80 q40 60 0 120 q-40 60 0 120" />
            <path d="M700 120 l80 0 l-40 70 z" />
            <path d="M820 300 q60 -50 120 -10" />
            <circle cx="860" cy="120" r="34" />
            <path d="M120 300 c40 -40 90 -40 130 0 s90 40 130 0" />
          </svg>
          <span className="cr-tray" />
        </div>
        <span className="cr-clock" />
        <span className="cr-window cr-window-l" />
        <span className="cr-window cr-window-r" />
        <span className="cr-floor" />
        <svg className="cr-desks" viewBox="0 0 1600 420" preserveAspectRatio="xMidYMax slice">
          <Desk x={200} y={120} s={0.8} /><Desk x={560} y={110} s={0.8} /><Desk x={1040} y={110} s={0.8} /><Desk x={1400} y={120} s={0.8} />
          <Desk x={80} y={260} s={1.15} /><Desk x={520} y={250} s={1.15} /><Desk x={1080} y={250} s={1.15} /><Desk x={1520} y={260} s={1.15} />
        </svg>
        <span className="cr-light" />
      </div>
      <span className="cr-vignette" />
    </div>
  );
}

export function ClassroomPage({ children }) {
  return (
    <div className="class-page">
      <Classroom />
      {children}
    </div>
  );
}
