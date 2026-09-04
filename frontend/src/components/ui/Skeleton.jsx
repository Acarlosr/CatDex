/**
 * Skeleton — loading placeholder blocks.
 *
 * @param {object} props
 * @param {string} [props.className]  Size it with w- and h- classes.
 * @param {boolean} [props.circle=false]
 *
 * Helpers:
 *   <SkeletonText lines={3} />          — stacked text lines
 *   <SkeletonCard />                    — a card-shaped placeholder
 *
 * Usage:
 *   {loading ? <SkeletonCard /> : <BotCard bot={bot} />}
 */
export const Skeleton = ({ className = 'w-full h-4', circle = false }) => (
  <div
    aria-hidden="true"
    className={`skeleton-pulse bg-raised border border-border/50 ${circle ? 'rounded-full' : 'rounded-md'} ${className}`}
  />
);

export const SkeletonText = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2 ${className}`} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
    ))}
  </div>
);

export const SkeletonCard = ({ className = '' }) => (
  <div className={`terminal-card p-5 space-y-4 ${className}`} aria-hidden="true">
    <div className="flex items-center gap-3">
      <Skeleton circle className="w-8 h-8" />
      <Skeleton className="h-3.5 w-1/3" />
    </div>
    <SkeletonText lines={2} />
    <div className="flex gap-2">
      <Skeleton className="h-7 w-20" />
      <Skeleton className="h-7 w-20" />
    </div>
  </div>
);

export default Skeleton;
