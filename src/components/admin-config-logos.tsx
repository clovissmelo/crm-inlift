/** Marcas simplificadas — monocromáticas / tons suaves para o tema escuro do CRM. */

export function LogoApi4com({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 8.5c0-2.2 1.8-4 4-4h3c2.2 0 4 1.8 4 4v1.2c0 .9-.7 1.6-1.6 1.6h-.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M8 12.5v5.5M11.5 12.5v5.5M15 12.5v5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="17.5" cy="7.5" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <text x="17.5" y="8.65" textAnchor="middle" fill="currentColor" fontSize="5" fontWeight="700" fontFamily="system-ui,sans-serif">
        4
      </text>
    </svg>
  );
}

export function LogoGoogleCalendar({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 9.5h16" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="7.5" y="12" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="13.5" y="12" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.45" />
      <rect x="7.5" y="16" width="3" height="2.5" rx="0.5" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

export function LogoGooglePlaces({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s6.5-5.2 6.5-10a6.5 6.5 0 1 0-13 0c0 4.8 6.5 10 6.5 10Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="2.25" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

export function LogoGoogleG({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 10.2v3.6h5.1c-.2 1.2-1.4 3.5-5.1 3.5-3.1 0-5.6-2.6-5.6-5.8S8.9 5.7 12 5.7c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.4 3.6 14.4 2.8 12 2.8 7.5 2.8 4 6.3 4 10.8s3.5 8 8 8c4.6 0 7.6-3.2 7.6-7.8 0-.5-.1-.9-.2-1.2H12z"
      />
    </svg>
  );
}

export function LogoSettings({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M19.4 15a7.8 7.8 0 0 0 .1-1 7.8 7.8 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L15 3.5h-6L8.7 7.5a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0-.1 1c0 .34.03.67.1 1l-2 1.5 2 3.5 2.4-1c.52.43 1.1.78 1.7 1L9 20.5h6l.3-4c.6-.22 1.18-.57 1.7-1l2.4 1 2-3.5-2-1.5Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoImportSheet({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 7 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 3.5V8h4.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 12h8M8 15.5h8M8 19h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
