// Small presentational building blocks shared by every page.

export function Button({ variant = 'primary', size, busy, children, ...props }) {
  return (
    <button className={`btn btn-${variant}${size ? ` btn-${size}` : ''}`} disabled={busy || props.disabled} {...props}>
      {busy ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  );
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
  shield: <><path d="M12 3l7 3v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  user: <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" /></>,
  list: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
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
        <rect x="17" y="3" width="30" height="58" rx="15" fill="#FFFCF8" stroke="#3B2A20" strokeWidth="2.5" />
        <path d="M17 30V18a15 15 0 0 1 30 0v12z" fill="#F0916A" />
        <path d="M17 30h30" stroke="#3B2A20" strokeWidth="2.5" />
        <circle cx="26" cy="42" r="2.4" fill="#3B2A20" /><circle cx="38" cy="42" r="2.4" fill="#3B2A20" />
        <path d="M28 48q4 4 8 0" fill="none" stroke="#3B2A20" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="22.5" cy="47" r="2.6" fill="#F6B9A5" /><circle cx="41.5" cy="47" r="2.6" fill="#F6B9A5" />
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

export function Empty({ icon = '○', title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>{icon}</div>
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

// Chip-style segmented choice.
export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
