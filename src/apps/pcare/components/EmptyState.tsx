import type { ComponentType, ReactNode } from 'react'
import { icons } from '../../../lib/icons'

interface EmptyStateProps {
  icon?: ComponentType<{ size?: number; className?: string }> | ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  accentColor?: string
}

export function EmptyState({ icon, title, description, action, accentColor = 'cyan' }: EmptyStateProps) {
  const gradients: Record<string, string> = {
    cyan: 'from-cyan-600 to-blue-600 shadow-cyan-500/20',
    emerald: 'from-emerald-600 to-green-600 shadow-emerald-500/20',
  }

  const gradient = gradients[accentColor] || gradients.cyan

  function renderIcon() {
    if (!icon) return <icons.ui.inbox size={28} className="text-fg-muted" />
    if (typeof icon === 'function') {
      const Icon = icon
      return <Icon size={28} className="text-fg-muted" />
    }
    return icon
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-input/50">
        {renderIcon()}
      </div>
      <h3 className="mb-1 text-lg font-medium text-slate-300">{title}</h3>
      {description && <p className="mb-4 text-sm text-fg-muted">{description}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`rounded-lg bg-gradient-to-r ${gradient} px-5 py-2 text-sm font-medium text-fg shadow-sm transition-all hover:shadow-md`}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
