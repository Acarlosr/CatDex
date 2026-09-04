/**
 * StatCard — compact KPI tile with a colored accent edge.
 *
 * @param {object} props
 * @param {string} props.label                    Uppercase caption.
 * @param {React.ReactNode} props.value           The stat (rendered in .font-num).
 * @param {'gold'|'cyan'|'green'|'red'|'purple'|'white'} [props.color='gold']
 * @param {string} [props.sub]                    Optional muted sub-line under the value.
 * @param {React.ReactNode} [props.icon]          Optional small icon, top-right.
 *
 * Usage:
 *   <StatCard label="Win rate" value="63.4%" color="green" sub="142 trades" />
 */
const COLORS = {
  gold: '#fcd535',
  cyan: '#0ea5e9',
  green: '#2ebd85',
  red: '#f6465d',
  purple: '#8b5cf6',
  white: '#eaecef',
};

const StatCard = ({ label, value, color = 'gold', sub, icon }) => {
  const accent = COLORS[color] || COLORS.gold;

  return (
    <div
      className="terminal-card relative p-4 border-l-2 transition-all duration-300 hover:border-border-strong hover:-translate-y-px hover:shadow-lg overflow-hidden"
      style={{ borderLeftColor: accent }}
    >
      <div
        className="pointer-events-none absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-[0.07]"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted mb-1">{label}</p>
        {icon && <span className="text-faint shrink-0">{icon}</span>}
      </div>
      <p className="text-base font-num font-bold leading-tight" style={{ color: accent }}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-faint mt-1 font-num">{sub}</p>}
    </div>
  );
};

export default StatCard;
