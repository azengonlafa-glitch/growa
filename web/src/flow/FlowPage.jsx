// Page frame for one step of the ordering flow: back button, step label, content, and a
// pinned action bar at the bottom (like the confirm button in a ride-hailing app).
import { useEffect } from 'react';
import { Icon } from '../components/ui.jsx';
import NavPill from '../components/NavPill.jsx';
import { go } from '../lib/hooks.js';
import { STEPS } from './state.jsx';

// Sends the customer back when a step is opened without the earlier choices (e.g. a bookmark).
export function Redirect({ to }) {
  useEffect(() => { go(to); }, [to]);
  return null;
}

export default function FlowPage({ step, steps = STEPS, title, onBack, children, footer, hero = null, wide = false }) {
  return (
    <div className={`flow${wide ? ' flow-wide' : ''}${footer ? ' flow-has-footer' : ''}`}>
      <header className="flow-top">
        {onBack ? (
          <button type="button" className="round-btn" onClick={onBack} aria-label="ย้อนกลับ"><Icon name="back" /></button>
        ) : <span className="flow-top-gap" />}
        <div className="flow-top-text">
          {step ? <span className="flow-step">ขั้นที่ {step} จาก {steps.length} · {steps[step - 1]}</span> : null}
          <h1 className="flow-title">{title}</h1>
        </div>
        <NavPill />
      </header>
      {step ? (
        <div className="flow-dots" role="img" aria-label={`ขั้นที่ ${step} จาก ${steps.length}`}>
          {steps.map((s, i) => <span key={s} className={i < step ? 'on' : ''} />)}
        </div>
      ) : null}
      {hero}
      <div className="flow-body">{children}</div>
      {footer ? <div className="flow-bottom">{footer}</div> : null}
    </div>
  );
}
