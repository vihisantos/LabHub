import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useMovements } from '../hooks/useMovements'
import { StatusBadge } from '../components/StatusBadge'
import { StockForm } from '../components/StockForm'
import { MovementTimeline } from '../components/MovementTimeline'
import { EmptyState } from '../../pcare/components/EmptyState'
import { Modal, ConfirmDialog } from '../../pcare/components/Modal'
import { icons } from '../../../lib/icons'
import type { StockItemFormData } from '../types'

export function StockDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { items, update, remove } = useStock()
  const { movements } = useMovements()
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

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

  function handleSave(data: StockItemFormData) {
    update(item!.id, data)
    setShowEdit(false)
  }

  function handleDelete() {
    remove(item!.id)
    setShowDelete(false)
    navigate('/stock', { replace: true })
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/stock')}
          className="rounded-xl p-1.5 text-fg-dim hover:text-fg hover:bg-input transition-colors"
          aria-label="Voltar"
        >
          <icons.ui.back size={20} />
        </button>
        <h2 className="text-2xl font-bold tracking-tight flex-1">{item.name}</h2>
        <button
          type="button"
          onClick={() => setShowEdit(true)}
          className="rounded-xl bg-card p-2 text-fg-dim hover:text-fg hover:bg-input transition-colors shadow-[var(--shadow-card)]"
          aria-label="Editar"
        >
          <icons.ui.edit size={18} />
        </button>
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="rounded-xl bg-card p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shadow-[var(--shadow-card)]"
          aria-label="Deletar"
        >
          <icons.ui.trash size={18} />
        </button>
        <StatusBadge status={item.status} />
      </div>

      <div className="flex flex-col gap-4">
        <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Informações</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-fg-muted font-medium">Seção:</span> <span className="text-fg">{item.section}</span></div>
            <div><span className="text-fg-muted font-medium">Subcategoria:</span> <span className="text-fg">{item.subcategory || '-'}</span></div>
            <div><span className="text-fg-muted font-medium">Sala:</span> <span className="text-fg">{item.room || '-'}</span></div>
            <div><span className="text-fg-muted font-medium">Nº Série:</span> <span className="text-fg">{item.serialNumber || '-'}</span></div>
            <div><span className="text-fg-muted font-medium">Condição:</span> <span className="text-fg">{item.condition || '-'}</span></div>
            {item.section === 'cabos' && (
              <>
                {item.cableType && <div><span className="text-fg-muted font-medium">Tipo Cabo:</span> <span className="text-fg">{item.cableType}</span></div>}
                {item.cableLength && <div><span className="text-fg-muted font-medium">Comprimento:</span> <span className="text-fg">{item.cableLength}m</span></div>}
                {item.connectorType && <div><span className="text-fg-muted font-medium">Conectores:</span> <span className="text-fg">{item.connectorType}</span></div>}
                {item.outletCount && <div><span className="text-fg-muted font-medium">Tomadas:</span> <span className="text-fg">{item.outletCount}</span></div>}
              </>
            )}
          </div>
          {item.status === 'emprestado' && (
            <div className="mt-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 p-3 text-sm text-violet-700 dark:text-violet-300">
              <span className="font-medium">Emprestado</span>
              {itemMovements.length > 0 && itemMovements[0].type === 'emprestimo' && (
                <div className="mt-1 text-xs text-violet-600 dark:text-violet-400">
                  {itemMovements[0].borrowedBy && <p>Com: {itemMovements[0].borrowedBy}</p>}
                  {itemMovements[0].expectedReturnAt && <p>Previsão de devolução: {new Date(itemMovements[0].expectedReturnAt).toLocaleDateString('pt-BR')}</p>}
                </div>
              )}
            </div>
          )}
        </section>

        {item.notes && (
          <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Observações</h3>
            <p className="text-sm text-fg-dim">{item.notes}</p>
          </section>
        )}

        <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Histórico de Movimentações</h3>
          <MovementTimeline movements={itemMovements} />
        </section>
      </div>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Editar Item">
        <StockForm
          initial={item}
          onSave={handleSave}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>

      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Deletar Item"
        message={`Tem certeza que deseja deletar "${item.name}" permanentemente? Esta ação não pode ser desfeita.`}
        confirmLabel="Deletar"
        variant="danger"
      />
    </div>
  )
}
