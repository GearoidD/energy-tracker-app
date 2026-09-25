export default function GnoRateLogo({ tone = "dark", size = 36, className = "" }) {
  return (
    <span
      className={`gnorate-logo gnorate-logo--${tone} ${className}`.trim()}
      style={{ "--gn-logo-size": `${size}px` }}
      aria-label="GnóRate"
    >
      <svg className="gnorate-logo-mark" viewBox="0 0 40 40" aria-hidden="true">
        <rect x="1" y="1" width="38" height="38" rx="12" fill="#0b9569" />
        <circle cx="20" cy="20" r="11.4" fill="none" stroke="#ffffff" strokeWidth="3.1" />
        <path d="M27.2 13.2h7v13.6h-7z" fill="#0b9569" />
        <path d="M19.8 20h11.3" fill="none" stroke="#ffffff" strokeWidth="3.1" strokeLinecap="round" />
        <circle cx="31.2" cy="20" r="1.45" fill="#a8f0d0" />
      </svg>
      <span className="gnorate-logo-wordmark"><span>Gnó</span><strong>Rate</strong></span>
    </span>
  );
}
