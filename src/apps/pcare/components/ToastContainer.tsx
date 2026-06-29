import { useToast } from '../../../lib/ToastContext'
import { icons } from '../../../lib/icons'

const typeConfig = {
  info: {
    icon: <icons.ui.refresh size={14} className="animate-spin" />,
    cls: 'bg-amber-500/15 border-amber-500/25 text-amber-400',
  },
  success: {
    icon: <icons.ui.checkCircle size={14} />,
    cls: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400',
  },
  error: {
    icon: <icons.ui.alertCircle size={14} />,
    cls: 'bg-red-500/15 border-red-500/25 text-red-400',
  },
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col-reverse gap-2 px-4">
      {toasts.map((toast) => {
        const cfg = typeConfig[toast.type]
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-lg shadow-black/20 animate-[apple-fade-in_0.2s_ease-out] ${cfg.cls}`}
          >
            {cfg.icon}
            <span className="flex-1 min-w-0">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={toast.action.onClick}
                className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium hover:bg-white/20"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded p-0.5 hover:bg-white/10"
              aria-label="Fechar"
            >
              <icons.ui.close size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
