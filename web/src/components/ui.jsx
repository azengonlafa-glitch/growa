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

export function PageHeader({ title, subtitle, back, actions }) {
  return (
    <header className="page-header">
      {back ? <a className="back-link" href={`#/${back}`}>← กลับ</a> : null}
      <div className="page-header-row">
        <div>
          <h1>{title}</h1>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
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
