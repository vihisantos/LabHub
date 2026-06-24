interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon = '📋', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="mb-3 text-4xl">{icon}</span>
      <h3 className="mb-1 text-lg font-medium text-slate-300">{title}</h3>
      {description && <p className="mb-4 text-sm text-slate-500">{description}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
