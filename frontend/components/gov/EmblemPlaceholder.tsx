/**
 * A deliberately stylised stand-in for the State Emblem of India — a simplified
 * lion-capital silhouette with the Ashoka chakra. It is not a reproduction of
 * the official emblem (no inscription, no fine detail) and must not be treated
 * as one: this is a Smart India Hackathon prototype, not a Government of India
 * service.
 */
export default function EmblemPlaceholder({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Stylised national emblem placeholder"
      fill="none"
    >
      <title>National emblem placeholder (prototype)</title>
      {/* abacus / base */}
      <rect x="14" y="40" width="36" height="4" rx="1" fill="currentColor" />
      <rect x="18" y="44" width="28" height="3" rx="1" fill="currentColor" opacity="0.6" />
      {/* chakra */}
      <circle cx="32" cy="42" r="0" />
      {/* three visible lions, abstracted as arches with manes */}
      <path
        d="M20 40c0-7 4-12 6-16 1-2 0-5-2-6 3-1 6 1 7 4 1-3 4-5 7-4-2 1-3 4-2 6 2 4 6 9 6 16"
        fill="currentColor"
      />
      <circle cx="26" cy="24" r="2.4" fill="var(--surface)" />
      <circle cx="38" cy="24" r="2.4" fill="var(--surface)" />
      <path d="M28 30c2 2 6 2 8 0" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" />
      {/* chakra spokes below the base */}
      <g stroke="currentColor" strokeWidth="1.4">
        <circle cx="32" cy="52" r="6" fill="none" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI) / 6;
          return (
            <line
              key={i}
              x1={32 + Math.cos(a) * 1.5}
              y1={52 + Math.sin(a) * 1.5}
              x2={32 + Math.cos(a) * 6}
              y2={52 + Math.sin(a) * 6}
            />
          );
        })}
      </g>
    </svg>
  );
}
