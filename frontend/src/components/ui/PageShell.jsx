/**
 * PageShell — standard page wrapper: grid background, ambient glow,
 * max-width container with consistent padding and vertical rhythm.
 *
 * @param {object} props
 * @param {'gold'|'cyan'|'green'|'purple'} [props.glowColor='gold']
 * @param {React.ReactNode} props.children
 */
const GLOW_COLORS = {
  gold: 'color-mix(in srgb, var(--color-accent) 5%, transparent)',
  cyan: 'color-mix(in srgb, var(--color-info) 5%, transparent)',
  green: 'color-mix(in srgb, var(--color-success) 5%, transparent)',
  purple: 'color-mix(in srgb, var(--color-purple) 5%, transparent)',
};

const PageShell = ({ children, glowColor = 'gold' }) => (
  <div className="page-container overflow-y-auto h-full">
    <div
      className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] opacity-60"
      style={{ background: GLOW_COLORS[glowColor] || GLOW_COLORS.gold }}
    />
    <div className="relative z-10 max-w-[1400px] mx-auto px-4 md:px-8 py-6 space-y-6 fade-in">
      {children}
    </div>
  </div>
);

export default PageShell;
