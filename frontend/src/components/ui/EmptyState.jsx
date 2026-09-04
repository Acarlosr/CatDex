/**
 * EmptyState — centered empty/zero-data placeholder.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.icon]     SVG icon (w-6 h-6 recommended); a default is provided.
 * @param {string} props.title               Short headline ("No bots yet").
 * @param {string} [props.description]       One-sentence explanation.
 * @param {React.ReactNode} [props.action]   Usually a <Button>.
 * @param {string} [props.className]
 *
 * Usage:
 *   <EmptyState
 *     title="No open positions"
 *     description="Positions appear here once a bot opens a trade."
 *     action={<Button size="sm" onClick={goToBots}>View bots</Button>}
 *   />
 */
const DefaultIcon = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
  </svg>
);

const EmptyState = ({ icon = DefaultIcon, title, description, action, className = '' }) => (
  <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
    <div className="w-12 h-12 rounded-lg bg-raised border border-border flex items-center justify-center text-faint mb-4">
      {icon}
    </div>
    <h3 className="text-sm font-semibold text-text mb-1">{title}</h3>
    {description && (
      <p className="text-xs text-muted max-w-sm leading-relaxed mb-4">{description}</p>
    )}
    {action}
  </div>
);

export default EmptyState;
