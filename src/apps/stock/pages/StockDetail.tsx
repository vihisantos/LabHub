import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useMovements } from '../hooks/useMovements'
import { StatusBadge } from '../components/StatusBadge'
import { MovementTimeline } from '../components/MovementTimeline'
import { EmptyState } from '../../pcare/components/EmptyState'
import { icons } from '../../../lib/icons'

export function StockDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { items } = useStock()
  const { movements } = useMovements()

  const item = items.find((i) => i.id === id)
  const itemMovements = useMemo(
    () => movements.filter((m) => m.itemId === id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [movements, id],
  )

  if (!item) {
    return (
      <EmptyState
        icon={icons.ui.search}
        title="Item não encontrado"
        action={{ label: 'Voltar', onClick: () => navigate('/stock') }}
      />
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/stock')}
          className="rounded-lg p-1 text-fg-dim hover:text-fg"
          aria-label="Voltar"
        >
          <icons.ui.back size={20} />
        </button>
        <h2 className="text-xl font-semibold">{item.name}</h2>
        <StatusBadge status={item.status} />
      </div>

      <div className="flex flex-col gap-3">
        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Informações</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-fg-muted">Seção:</span> <span className="text-fg">{item.section}</span></div>
            <div><span className="text-fg-muted">Subcategoria:</span> <span className="text-fg">{item.subcategory || '-'}</span></div>
            <div><span className="text-fg-muted">Sala:</span> <span className="text-fg">{item.room || '-'}</span></div>
            <div><span className="text-fg-muted">Nº Série:</span> <span className="text-fg">{item.serialNumber || '-'}</span></div>
            <div><span className="text-fg-muted">Condição:</span> <span className="text-fg">{item.condition || '-'}</span></div>
          </div>
        </section>

        {item.notes && (
          <section className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Observações</h3>
            <p className="text-sm text-fg-dim">{item.notes}</p>
          </section>
        )}

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Histórico de Movimentações</h3>
          <MovementTimeline movements={itemMovements} />
        </section>
      </div>
    </div>
  )
}
