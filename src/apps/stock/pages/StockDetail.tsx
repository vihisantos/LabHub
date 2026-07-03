import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useMovements } from '../hooks/useMovements'
import { pcService } from '../../pcare/services/pcService'
import { stockPhotoService } from '../services/stockPhotoService'
import { StatusBadge } from '../components/StatusBadge'
import { StockForm } from '../components/StockForm'
import { MovementTimeline } from '../components/MovementTimeline'
import { EmptyState } from '../../pcare/components/EmptyState'
import { Modal, ConfirmDialog } from '../../pcare/components/Modal'
import { icons } from '../../../lib/icons'
import type { StockItemFormData } from '../types'
import { DEFAULT_PC_PARTS } from '../types'

export function StockDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { items, create, update, remove } = useStock()
  const { movements } = useMovements()
  const [showEdit, setShowEdit] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const item = items.find((i) => i.id === id)
  const itemMovements = useMemo(
    () => movements.filter((m) => m.itemId === id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [movements, id],
  )

  const photos = useMemo(() => (item?.id ? stockPhotoService.get(item.id) : []), [item?.id])

  const linkedPc = useMemo(
    () => (item?.linkedPcId ? pcService.getAll().find((p) => p.id === item.linkedPcId) : undefined),
    [item?.linkedPcId],
  )

  function togglePart(partName: string) {
    if (!item) return
    const updatedParts = (item.pcParts || []).map(p =>
      p.partName === partName ? { ...p, present: !p.present } : p,
    )
    update(item.id, { pcParts: updatedParts })
  }

  function handleActivate() {
    if (!item) return
    const now = new Date().toISOString()
    const pc = pcService.create({
      labName: item.room || 'Laboratório',
      pcNumber: item.name,
      assetTag: item.serialNumber || '',
      roomLocation: item.room || '',
      specs: { cpu: '', ram: '', storage: '' },
      config: { osType: '', osVersion: '', osEdition: '', pcType: '', domain: '' },
      cleaningStatus: 'pending',
      restorationStatus: 'pending',
      softwareInstalled: [],
      partsReplaced: [],
      observations: item.notes || '',
      photos: [],
      lastIntervention: null,
      createdAt: now,
      updatedAt: now,
    })
    update(item.id, {
      linkedPcId: pc.id,
      linkedPcLabel: `${pc.labName} — ${pc.pcNumber}`,
    })
    navigate(`/pcare/pcs/${pc.id}/edit`)
  }

  if (!item) {
    return (
      <EmptyState
        icon={icons.ui.search}
        title="Item não encontrado"
        action={{ label: 'Voltar', onClick: () => navigate('/stock') }}
      />
    )
  }

  function handleSave(data: StockItemFormData, photos?: string[]) {
    update(item!.id, data)
    if (photos !== undefined) {
      stockPhotoService.setAll(item!.id, photos)
    }
    setShowEdit(false)
  }

  function handleDuplicate(data: StockItemFormData, photos?: string[]) {
    const newItem = create(data)
    if (photos && photos.length > 0) {
      stockPhotoService.setAll(newItem.id, photos)
    }
    setShowDuplicate(false)
    navigate(`/stock/items/${newItem.id}`, { replace: true })
  }

  function handleDelete() {
    stockPhotoService.deleteAll(item!.id)
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
          onClick={() => setShowDuplicate(true)}
          className="rounded-xl bg-card p-2 text-fg-dim hover:text-fg hover:bg-input transition-colors shadow-[var(--shadow-card)]"
          aria-label="Duplicar"
          title="Duplicar"
        >
          <icons.ui.copy size={18} />
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
        {photos.length > 0 && (
          <section className="rounded-xl bg-card p-3 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap gap-2">
              {photos.map((photo, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="group relative h-24 w-24 overflow-hidden rounded-xl bg-input transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <img
                    src={photo}
                    alt={`Foto ${i + 1} de ${item.name}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {i === 0 && photos.length > 1 && (
                    <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-medium">
                      +{photos.length - 1}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Lightbox */}
        {lightboxIndex !== null && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setLightboxIndex(null)}
          >
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
              aria-label="Fechar"
            >
              <icons.ui.close size={20} />
            </button>
            <div className="flex max-h-full max-w-full items-center gap-3" onClick={(e) => e.stopPropagation()}>
              {photos.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLightboxIndex((prev) => (prev === 0 ? photos.length - 1 : prev! - 1))
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
                  aria-label="Anterior"
                >
                  <icons.ui.back size={20} />
                </button>
              )}
              <img
                src={photos[lightboxIndex]}
                alt={`Foto ${lightboxIndex + 1}`}
                className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              {photos.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLightboxIndex((prev) => (prev === photos.length - 1 ? 0 : prev! + 1))
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
                  aria-label="Próximo"
                >
                  <icons.ui.chevronDown size={20} className="-rotate-90" />
                </button>
              )}
            </div>
            <p className="absolute bottom-4 text-sm text-white/70">
              {lightboxIndex + 1} / {photos.length}
            </p>
          </div>
        )}

        <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Informações</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-fg-muted font-medium">Seção:</span> <span className="text-fg">{item.section}</span></div>
            <div><span className="text-fg-muted font-medium">Subcategoria:</span> <span className="text-fg">{item.subcategory || '-'}</span></div>
            <div><span className="text-fg-muted font-medium">Sala:</span> <span className="text-fg">{item.room || '-'}</span></div>
            <div><span className="text-fg-muted font-medium">Nº Série:</span> <span className="text-fg">{item.serialNumber || '-'}</span></div>
            <div><span className="text-fg-muted font-medium">Condição:</span> <span className="text-fg">{item.condition || '-'}</span></div>
            {item.linkedPcLabel && (
              <div className="col-span-2">
                <span className="text-fg-muted font-medium">Vinculado ao PC:</span>{' '}
                {linkedPc ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/pcare/pcs/${linkedPc.id}`)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    <icons.nav.pcs size={14} />
                    {linkedPc.labName} — {linkedPc.pcNumber}
                  </button>
                ) : (
                  <span className="text-sm text-fg">{item.linkedPcLabel}</span>
                )}
              </div>
            )}
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

        {item.section === 'maquinas' && !item.linkedPcId && item.pcParts && item.pcParts.length > 0 && (
          <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Peças do PC</h3>
            <div className="space-y-2">
              {item.pcParts.map((part) => (
                <div key={part.partName} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => togglePart(part.partName)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
                      part.present ? 'bg-emerald-500' : 'border-2 border-line'
                    }`}
                  >
                    {part.present && <icons.ui.check size={12} className="text-white" />}
                  </button>
                  <span className="text-sm text-fg">{part.partName}</span>
                  {part.present ? (
                    <span className="ml-auto text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Presente</span>
                  ) : (
                    <span className="ml-auto text-[11px] text-amber-600 dark:text-amber-400 font-medium">Faltando</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-fg-muted">
                {item.pcParts.filter(p => p.present).length} de {item.pcParts.length} peças
              </span>
              {item.pcParts.every(p => p.present) ? (
                <button
                  type="button"
                  onClick={handleActivate}
                  className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md btn-interactive"
                >
                  <icons.nav.pcs size={14} className="inline mr-1" />
                  Ativar e enviar para PCare
                </button>
              ) : (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Faltam {item.pcParts.filter(p => !p.present).length} peça(s)
                </span>
              )}
            </div>
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

      <Modal open={showDuplicate} onClose={() => setShowDuplicate(false)} title="Duplicar Item">
        <StockForm
          initial={item}
          onSave={handleDuplicate}
          onCancel={() => setShowDuplicate(false)}
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
