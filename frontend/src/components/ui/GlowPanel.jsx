/**
 * GlowPanel — terminal-card with an optional ambient glow.
 *
 * @param {object} props
 * @param {'gold'|'cyan'|'green'|'purple'} [props.glowColor]  Omit for no glow.
 * @param {boolean} [props.noPadding=false]
 * @param {string} [props.className]
 */
const GLOW_CLASSES = {
  gold: 'glow-panel',
  cyan: 'glow-panel-cyan',
  green: 'glow-panel-green',
  purple: 'glow-panel-purple',
};

const GlowPanel = ({ children, className = '', glowColor, noPadding = false }) => (
  <div className={`terminal-card hover:border-border-strong transition-all duration-300 ${glowColor ? GLOW_CLASSES[glowColor] || '' : ''} ${noPadding ? '' : 'p-5'} ${className}`}>
    {children}
  </div>
);

export default GlowPanel;
