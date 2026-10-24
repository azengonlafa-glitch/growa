// Small presentational building blocks shared by every page.
import { useState } from 'react';

// `disabled` comes after the spread so a caller's `disabled={false}` cannot cancel `busy`.
export function Button({ variant = 'primary', size, block, busy, children, ...props }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant}${size ? ` btn-${size}` : ''}${block ? ' btn-block' : ''}`}
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
    >
      {busy ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}

// Two-step button for actions that cannot be undone: the first tap asks, the second does it.
export function ConfirmButton({ onConfirm, question = 'ยืนยันหรือไม่?', yes = 'ยืนยัน', no = 'ไม่', children, variant = 'secondary', size, busy, disabled, ariaLabel }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <Button variant={variant} size={size} busy={busy} disabled={disabled} aria-label={ariaLabel} onClick={() => setAsking(true)}>{children}</Button>;
  }
  return (
    <span className="confirm" role="group" aria-label={question}>
      <span className="confirm-q">{question}</span>
      <Button variant="danger" size="sm" busy={busy} onClick={() => { setAsking(false); onConfirm(); }}>{yes}</Button>
      <Button variant="secondary" size="sm" onClick={() => setAsking(false)}>{no}</Button>
    </span>
  );
}

// Polite status line for "saved" style feedback. Keep it mounted so screen readers announce changes.
export function Flash({ children }) {
  return <p className="flash" role="status" aria-live="polite">{children}</p>;
}

export function Card({ children, className = '', ...props }) {
  return <section className={`card ${className}`} {...props}>{children}</section>;
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

// Marks anything that is not real data, as the spec requires for the demo.
export function MockBadge({ label = 'ข้อมูลจำลอง' }) {
  return <span className="badge badge-mock" title="ข้อมูลนี้สร้างขึ้นสำหรับการสาธิต">{label}</span>;
}

const ICONS = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  pill: <><path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l10-10a4.95 4.95 0 0 1 7 7z" /><path d="M8.5 8.5l7 7" /></>,
  heart: <><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /><path d="M6 12h3l1.5-2.5L13 14l1.5-2H18" /></>,
  store: <><path d="M4 9l1.5-5h13L20 9" /><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9" /><path d="M5 12v8h14v-8" /><path d="M10 20v-4h4v4" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.3c3 .2 5 2.2 5 5.2" /></>,
  bell: <><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  truck: <><path d="M3 6h11v10H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><path d="M12 7.6h.01" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />,
  settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></>,
  minus: <path d="M5 12h14" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  shield: <><path d="M12 3l7 3v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  user: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" /></>,
  list: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  locate: <><circle cx="12" cy="12" r="3.5" /><circle cx="12" cy="12" r="8" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  camera: <><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  logout: <><path d="M10 4H5v16h5" /><path d="M15 8l4 4-4 4M19 12H9" /></>,
};

export function Icon({ name, size = 26, stroke = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

// The capsule mascot. Decorative unless a label is given.
export function Mascot({ size = 96, label }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g transform="rotate(-28 32 32)">
        <rect x="17" y="3" width="30" height="58" rx="15" fill="#FFFFFF" stroke="#10303A" strokeWidth="2.5" />
        <path d="M17 30V18a15 15 0 0 1 30 0v12z" fill="#2FC27A" />
        <path d="M17 30h30" stroke="#10303A" strokeWidth="2.5" />
        <circle cx="26" cy="42" r="2.4" fill="#10303A" /><circle cx="38" cy="42" r="2.4" fill="#10303A" />
        <path d="M28 48q4 4 8 0" fill="none" stroke="#10303A" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="22.5" cy="47" r="2.6" fill="#9BE7C1" /><circle cx="41.5" cy="47" r="2.6" fill="#9BE7C1" />
      </g>
    </svg>
  );
}

// Warm curved header used at the top of every page. `eyebrow` is the small line above the title.
export function PageHeader({ title, subtitle, eyebrow, back, actions, tone, mascot }) {
  return (
    <header className={`hero${tone === 'honey' ? ' hero-honey' : ''}`}>
      {back ? <a className="back-link" href={`#/${back}`} aria-label="ย้อนกลับ"><Icon name="back" /></a> : null}
      <div className="page-header-row">
        <div>
          {eyebrow ? <div className="hero-eyebrow">{eyebrow}</div> : null}
          <h1 className="hero-title">{title}</h1>
          {subtitle ? <p className="hero-sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="hero-actions">{actions}</div> : null}
        {mascot ? <Mascot size={96} /> : null}
      </div>
    </header>
  );
}

export function Empty({ icon = 'list', title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>{ICONS[icon] ? <Icon name={icon} size={36} /> : icon}</div>
      <p className="empty-title">{title}</p>
      {children ? <div className="muted">{children}</div> : null}
    </div>
  );
}

export function Loading({ label = 'กำลังโหลด…' }) {
  return <div className="loading"><span className="spinner" aria-hidden /> {label}</div>;
}

export function ErrorText({ children }) {
  return children ? <p className="error-text" role="alert">{children}</p> : null;
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Notice({ tone = 'info', title, children }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

// Chip-style segmented choice. Not real tabs (no panels), so it is a button group.
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}
