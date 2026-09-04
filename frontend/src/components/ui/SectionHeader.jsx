/**
 * SectionHeader — titled section divider with optional action slot.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {React.ReactNode} [props.action]   Right-aligned slot (usually a <Button>).
 * @param {'gold'|'cyan'|'green'|'purple'|'red'|'white'} [props.accentColor='white']
 */
const ACCENT_COLORS = {
  gold: 'text-accent',
  cyan: 'text-info',
  green: 'text-success',
  purple: 'text-purple',
  red: 'text-danger',
  white: 'text-text',
};

const BAR_COLORS = {
  gold: 'bg-accent',
  cyan: 'bg-info',
  green: 'bg-success',
  purple: 'bg-purple',
  red: 'bg-danger',
  white: 'bg-border-strong',
};

const SectionHeader = ({ title, subtitle, action, accentColor = 'white' }) => (
  <div className="flex items-center justify-between gap-4">
    <div className="flex items-center gap-3 min-w-0">
      <span className={`w-1 h-8 rounded-full shrink-0 ${BAR_COLORS[accentColor] || BAR_COLORS.white}`} />
      <div className="min-w-0">
        <h2 className={`text-sm font-bold uppercase tracking-[0.15em] truncate ${ACCENT_COLORS[accentColor] || ACCENT_COLORS.white}`}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-[10px] text-muted mt-0.5 uppercase tracking-wider truncate">{subtitle}</p>
        )}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export default SectionHeader;
