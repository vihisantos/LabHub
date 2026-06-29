import type { StockMovement } from '../types'
import { movementTypes } from '../types'
import { icons } from '../../../lib/icons'

const typeIcons: Record<string, typeof icons.ui.check> = {
  entrada: icons.ui.plus,
  saida: icons.ui.minus,
  mudanca_sala: icons.ui.refresh,
  conserto: icons.nav.parts,
  descarte: icons.ui.trash,
  substituicao: icons.ui.refresh,
  emprestimo: icons.ui.user,
  devolucao: icons.ui.userCheck,
}

const typeColors: Record<string, string> = {
  entrada: 'text-emerald-600 dark:text-emerald-400',
  saida: 'text-red-600 dark:text-red-400',
  mudanca_sala: 'text-cyan-600 dark:text-cyan-400',
  conserto: 'text-amber-600 dark:text-amber-400',
  descarte: 'text-red-600 dark:text-red-400',
  substituicao: 'text-violet-600 dark:text-violet-400',
  emprestimo: 'text-violet-600 dark:text-violet-400',
  devolucao: 'text-emerald-600 dark:text-emerald-400',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface MovementTimelineProps {
  movements: StockMovement[]
}

export function MovementTimeline({ movements }: MovementTimelineProps) {
  if (movements.length === 0) {
    return <p className="text-sm text-fg-muted">Nenhuma movimentação registrada.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {movements.map((m) => {
        const typeInfo = movementTypes.find((t) => t.value === m.type)
        const Icon = typeIcons[m.type] || icons.ui.dot
        const color = typeColors[m.type] || 'text-fg-muted'
        const borderColor = color.replace('text-', 'border-')

        return (
          <div key={m.id} className={`flex gap-3 rounded-xl bg-card px-4 py-3 shadow-[var(--shadow-card)] border-l-2 ${borderColor}`}>
            <span className={`mt-0.5 ${color}`}>
              <Icon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-fg">{typeInfo?.label || m.type}</span>
                {m.fromRoom && m.toRoom && m.type === 'mudanca_sala' && (
                  <span className="text-[11px] text-fg-muted">{m.fromRoom} → {m.toRoom}</span>
                )}
              </div>
              {m.type === 'emprestimo' && m.borrowedBy && (
                <p className="mt-1 text-xs text-fg-dim">
                  Com: <span className="font-medium text-fg">{m.borrowedBy}</span>
                  {m.destinationRoom && ` → ${m.destinationRoom}`}
                </p>
              )}
              {m.type === 'emprestimo' && m.expectedReturnAt && (
                <p className="mt-0.5 text-[11px] text-fg-muted">Previsão devolução: {formatDate(m.expectedReturnAt)}</p>
              )}
              {m.description && (
                <p className="mt-1 text-xs text-fg-dim">{m.description}</p>
              )}
              {(m.replacedPart || m.newPart) && (
                <p className="mt-1 text-[11px] text-fg-muted">
                  {m.replacedPart && `Trocou: ${m.replacedPart}`}
                  {m.replacedPart && m.newPart && ' por '}
                  {m.newPart && `Novo: ${m.newPart}`}
                </p>
              )}
              <p className="mt-1 text-[11px] text-fg-muted font-medium">
                {formatDate(m.createdAt)}
                {m.performedBy && ` · ${m.performedBy}`}
                {m.type === 'devolucao' && ' · Item devolvido'}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
