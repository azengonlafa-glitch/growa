// Launch screen shown while the app loads after sign-in: the dinosaur in its helmet on blue, with the wordmark drawn in
// white outline in the open sky beside it, then a circle opens from the centre to reveal the app underneath.
import dino from '../assets/launch-dino.jpg';

export default function Launch({ phase }) {
  return (
    <div className={`launch launch-${phase}`} role="status" aria-live="polite" style={{ '--launch-art': `url(${dino})` }}>
      <span className="launch-art" aria-hidden />
      <span className="launch-twinkles" aria-hidden><i /><i /><i /></span>
      <div className="launch-brand">
        <span className="launch-word" aria-hidden>growa</span>
        <span className="launch-text">{phase === 'reveal' ? 'พร้อมแล้ว' : 'กำลังโหลด'}<span className="launch-dots" aria-hidden><i /><i /><i /></span></span>
      </div>
    </div>
  );
}
