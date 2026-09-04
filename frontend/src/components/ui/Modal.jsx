/**
 * Modal — confirm/info dialog driven by a config object.
 *
 * @param {object} props
 * @param {object|null} props.config      Null hides the modal.
 * @param {'danger'|'warning'|'success'|'info'} [props.config.type='warning']
 * @param {string} props.config.title
 * @param {string} [props.config.message]
 * @param {Function} [props.config.onConfirm]   Renders confirm button when set.
 * @param {Function} [props.config.onCancel]    Renders cancel button; also Esc / backdrop click.
 * @param {string} [props.config.confirmText='Confirm']
 * @param {string} [props.config.cancelText='Cancel']
 * @param {boolean} [props.config.busy]         Disables confirm, shows "Processing…".
 * @param {React.ReactNode} [props.customBody]  Replaces the message paragraph.
 *
 * For simple yes/no flows prefer `confirmDialog()` from ui/ConfirmDialog.
 */
import { useEffect } from 'react';
import Button from './Button';

const TYPE_COLORS = {
  danger: { accent: '#f6465d', bg: 'rgba(246, 70, 93, 0.08)', variant: 'danger' },
  warning: { accent: '#fcd535', bg: 'rgba(252, 213, 53, 0.08)', variant: 'primary' },
  success: { accent: '#2ebd85', bg: 'rgba(46, 189, 133, 0.08)', variant: 'success' },
  info: { accent: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.08)', variant: 'primary' },
};

const Modal = ({ config, customBody }) => {
  const onCancel = config?.onCancel;
  const busy = config?.busy;

  useEffect(() => {
    if (!config) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && onCancel && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [config, onCancel, busy]);

  if (!config) return null;

  const colors = TYPE_COLORS[config.type] || TYPE_COLORS.warning;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md backdrop-enter"
        onClick={busy ? undefined : config.onCancel}
      />
      <div className="relative modal-enter bg-overlay/95 backdrop-blur-xl border border-border rounded-lg max-w-md w-full shadow-pop overflow-hidden">
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${colors.accent}66, transparent)` }}
        />
        <div className="px-5 py-4 border-b border-border" style={{ background: colors.bg }}>
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.accent }}>
            {config.title}
          </h3>
        </div>

        <div className="px-5 py-4">
          {customBody || (
            <p className="text-xs text-text-secondary leading-relaxed">{config.message}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-3.5 border-t border-border bg-raised/50">
          {config.onCancel && (
            <Button variant="secondary" size="sm" onClick={config.onCancel} disabled={config.busy}>
              {config.cancelText || 'Cancel'}
            </Button>
          )}
          {config.onConfirm && (
            <Button
              variant={colors.variant}
              size="sm"
              onClick={config.onConfirm}
              loading={config.busy}
            >
              {config.busy ? 'Processing…' : (config.confirmText || 'Confirm')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal;
