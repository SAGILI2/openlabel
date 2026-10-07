/**
 * OpenLabel mark: a page with one region being drawn — the corner handles of a
 * selection box over three text lines. Uses currentColor so it follows the theme.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <rect
        x="5"
        y="3.5"
        width="22"
        height="25"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.35"
      />
      <path
        d="M10 10h12M10 15h8M10 20h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.35"
      />
      <rect x="8.5" y="12.5" width="13" height="5" rx="1" stroke="var(--brand)" strokeWidth="1.75" />
      <rect x="7" y="11" width="3" height="3" rx="0.5" fill="var(--brand)" />
      <rect x="20" y="16" width="3" height="3" rx="0.5" fill="var(--brand)" />
    </svg>
  );
}
