/**
 * Confetti — todo 27 round-clear celebration.
 *
 * A burst of token-colored falling bits rendered ONLY while the celebrating
 * overlay is mounted (round_end interstitial in GameScreen, Result screen).
 * Zero interaction: aria-hidden + pointer-events: none (CSS). All motion is
 * the transform/opacity-only `confetti-fall` keyframe (compositor-friendly);
 * under `prefers-reduced-motion` the global media block collapses it to a
 * single instant frame, which lands the bits off-screen (110vh) — reduced-
 * motion users see no falling bits.
 */
const CONFETTI_BITS = 16;

/** Design-token colors only (DESIGN.md §2) — no raw hex. */
const CONFETTI_COLORS = [
  'var(--color-accent)',
  'var(--color-primary)',
  'var(--color-secondary)',
  'var(--color-info)',
  'var(--color-success)',
  'var(--color-primary-alt)',
];

export function Confetti() {
  return (
    <div className="confetti-burst" aria-hidden="true">
      {Array.from({ length: CONFETTI_BITS }, (_, i) => (
        <span
          key={i}
          className="confetti-bit"
          style={{
            left: `${(i * 37) % 90}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            // Staggered starts + varied fall speeds — organic, not robotic.
            animationDelay: `${(i % 5) * 0.22}s`,
            animationDuration: `${1.9 + ((i * 7) % 5) * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}
