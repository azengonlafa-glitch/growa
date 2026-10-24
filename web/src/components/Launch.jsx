// Launch screen shown while the app loads after sign-in: a green brand screen with the wordmark,
// then a circle opens from the centre to reveal the app underneath (like a ride-hailing app opening).
export default function Launch({ phase }) {
  return (
    <div className={`launch launch-${phase}`} role="status" aria-live="polite">
      <span className="launch-hole" aria-hidden />
      <div className="launch-brand">
        <span className="launch-word" aria-hidden>
          gr<span className="launch-o">o
            <svg className="launch-apple" viewBox="0 0 40 44">
              <path d="M20 12c-3-5-1-9 3-11 1 4-1 8-3 11z" fill="#3fae4a" />
              <path d="M19 12c0-3 1-5 2-7" stroke="#6b3a1a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
              <path d="M20 13c-5-4-16-3-17 10-1 11 7 20 13 20 2 0 3-1 4-1s2 1 4 1c6 0 14-9 13-20-1-13-12-14-17-10z" fill="#e5252e" />
              <path d="M20 13c-5-4-16-3-17 10-1 11 7 20 13 20 2 0 3-1 4-1s2 1 4 1c6 0 14-9 13-20-1-13-12-14-17-10z" fill="url(#apple-shade)" />
              <ellipse cx="11" cy="21" rx="3" ry="6" fill="#fff" opacity=".45" transform="rotate(18 11 21)" />
              <defs>
                <radialGradient id="apple-shade" cx=".35" cy=".3" r=".9">
                  <stop offset=".45" stopColor="#7a0008" stopOpacity="0" /><stop offset="1" stopColor="#7a0008" stopOpacity=".5" />
                </radialGradient>
              </defs>
            </svg>
          </span>wa
        </span>
        <span className="launch-text">{phase === 'reveal' ? 'พร้อมแล้ว' : 'กำลังโหลด'}<span className="launch-dots" aria-hidden><i /><i /><i /></span></span>
      </div>
    </div>
  );
}
