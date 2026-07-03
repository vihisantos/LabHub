import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePCs } from '../hooks/usePCs'
import { useParts } from '../hooks/useParts'
import { useChecklistTemplates, usePCChecklists } from '../hooks/useChecklists'
import { useActionLog } from '../hooks/useActionLog'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { AddPartToPcModal } from '../components/AddPartToPcModal'
import { PCChecklistModal } from '../components/PCChecklistModal'
import { ActionTimeline } from '../components/ActionTimeline'
import { partUsageService } from '../services/partUsageService'
import { stockService } from '../../stock/services/stockService'
import { icons } from '../../../lib/icons'
import type { PC, PCPart, OsType, OsEdition, PcTypeLabel } from '../types'
import { OS_TYPE_LABELS, OS_EDITION_LABELS, PC_TYPE_LABELS } from '../types'

export function PCDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { pcs, update, reload } = usePCs()

  const pc = pcs.find((p) => p.id === id)
  if (!pc) {
    return (
      <EmptyState
        icon={icons.ui.search}
        title="PC não encontrado"
        action={{ label: 'Voltar', onClick: () => navigate('/pcare/pcs') }}
      />
    )
  }

  return <PCDetailContent pc={pc} onUpdate={update} onReload={reload} />
}

function PCDetailContent({
  pc,
  onUpdate,
  onReload,
}: {
  pc: PC
  onUpdate: (id: string, data: Partial<PC>) => PC | undefined
  onReload: () => void
}) {
  const navigate = useNavigate()
  const { parts, update: updatePart, reload: reloadParts } = useParts()
  const { templates } = useChecklistTemplates()
  const { checklists: pcChecklists, create: createChecklist, update: updateChecklist, reload: reloadChecklists } = usePCChecklists(pc.id)
  const { logs, log: addLog } = useActionLog(pc.id)
  const [showAddPart, setShowAddPart] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const partUsages = useMemo(() => partUsageService.getByPC(pc.id), [pc.id])
  const linkedStockItems = useMemo(
    () => stockService.query((item) => item.linkedPcId === pc.id),
    [pc.id],
  )

  function toggleStatus(type: 'cleaning' | 'restoration') {
    const key = type === 'cleaning' ? 'cleaningStatus' : 'restorationStatus'
    const current = pc[key]
    const next =
      current === 'pending' ? 'in_progress' : current === 'in_progress' ? 'done' : 'pending'
    onUpdate(pc.id, { [key]: next })
    onReload()

    const label = type === 'cleaning' ? 'Limpeza' : 'Restauração'
    const statusLabel = next === 'done' ? 'concluído' : next === 'in_progress' ? 'em andamento' : 'pendente'
    addLog('status_changed', `${label} alterado para "${statusLabel}"`)
  }

  function handleAddPart(replacedPart: PCPart) {
    const stockPart = parts.find((p) => p.id === replacedPart.partId)
    if (!stockPart) return

    const newQuantity = stockPart.quantity - replacedPart.quantity
    updatePart(stockPart.id, { quantity: Math.max(0, newQuantity) })

    onUpdate(pc.id, {
      partsReplaced: [...pc.partsReplaced, replacedPart],
    })

    onReload()
    reloadParts()
    setShowAddPart(false)

    partUsageService.log(replacedPart.partId, pc.id, replacedPart.partName, replacedPart.quantity)
    addLog('part_added', `${replacedPart.quantity}x ${replacedPart.partName} adicionado(a)`)
  }

  function handleApplyChecklist(templateId: string) {
    const template = templates.find((t) => t.id === templateId)
    if (!template) return

    createChecklist({
      pcId: pc.id,
      templateId: template.id,
      templateName: template.name,
      labName: template.labName,
      items: template.items.map((item) => ({
        itemId: item.id,
        label: item.label,
        category: item.category,
        done: false,
        doneAt: null,
      })),
      completedAt: null,
    })

    reloadChecklists()

    addLog('checklist_applied', `Checklist "${template.name}" aplicado`)
  }

  function handleToggleItem(checklistId: string, itemId: string) {
    const cl = pcChecklists.find((c) => c.id === checklistId)
    if (!cl) return

    const item = cl.items.find((i) => i.itemId === itemId)
    const newDone = !item?.done

    const updatedItems = cl.items.map((item) =>
      item.itemId === itemId
        ? {
            ...item,
            done: newDone,
            doneAt: newDone
        ? new Date().toISOString()
              : null,
          }
        : item,
    )

    const allDone = updatedItems.every((i) => i.done)
    updateChecklist(checklistId, {
      items: updatedItems,
      completedAt: allDone
        ? new Date().toISOString()
        : null,
    })

    reloadChecklists()

    addLog('checklist_toggled', newDone ? `"${item?.label}" concluído` : `"${item?.label}" pendente`)
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/pcare/pcs')}
          className="rounded-lg p-1 text-fg-dim hover:text-fg"
          aria-label="Voltar"
        >
          <icons.ui.back size={20} />
        </button>
        <h2 className="text-xl font-semibold">
          {pc.labName} — {pc.pcNumber}
        </h2>
      </div>

      <div className="flex flex-col gap-3">
        {pc.photos && pc.photos.length > 0 && (
          <section className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Fotos</h3>
            <div className="flex flex-wrap gap-2">
              {pc.photos.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="group relative h-24 w-24 overflow-hidden rounded-xl bg-input transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <img
                    src={url}
                    alt={`Foto ${i + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {i === 0 && pc.photos.length > 1 && (
                    <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-medium">
                      +{pc.photos.length - 1}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

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
              {pc.photos.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLightboxIndex((prev) => (prev === 0 ? pc.photos.length - 1 : prev! - 1))
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
                  aria-label="Anterior"
                >
                  <icons.ui.back size={20} />
                </button>
              )}
              <img
                src={pc.photos[lightboxIndex]}
                alt={`Foto ${lightboxIndex + 1}`}
                className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              {pc.photos.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setLightboxIndex((prev) => (prev === pc.photos.length - 1 ? 0 : prev! + 1))
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
                  aria-label="Próximo"
                >
                  <icons.ui.chevronDown size={20} className="-rotate-90" />
                </button>
              )}
            </div>
            <p className="absolute bottom-4 text-sm text-white/70">
              {lightboxIndex + 1} / {pc.photos.length}
            </p>
          </div>
        )}

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Localização</h3>
          <p className="text-fg">{pc.roomLocation || 'Não informado'}</p>
          {pc.assetTag && (
            <p className="mt-1 text-xs text-fg-muted">Patrimônio: {pc.assetTag}</p>
          )}
        </section>

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Especificações</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-fg-muted">CPU:</span> <span className="text-fg">{pc.specs.cpu || '-'}</span></div>
            <div><span className="text-fg-muted">RAM:</span> <span className="text-fg">{pc.specs.ram || '-'}</span></div>
            <div className="col-span-2"><span className="text-fg-muted">Armazenamento:</span> <span className="text-fg">{pc.specs.storage || '-'}</span></div>
          </div>
        </section>

        {(pc.config?.osType || pc.config?.pcType) && (
          <section className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Configuração do Sistema</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {pc.config.osType && (
                <div className="col-span-2">
                  <span className="text-fg-muted">SO:</span>{' '}
                  <span className="text-fg">
                    {OS_TYPE_LABELS[pc.config.osType as OsType] || pc.config.osType}
                    {pc.config.osEdition && ` ${OS_EDITION_LABELS[pc.config.osEdition as OsEdition] || pc.config.osEdition}`}
                    {pc.config.osVersion && ` ${pc.config.osVersion}`}
                  </span>
                </div>
              )}
              {pc.config.pcType && (
                <div>
                  <span className="text-fg-muted">Tipo:</span>{' '}
                  <span className="text-fg">{PC_TYPE_LABELS[pc.config.pcType as PcTypeLabel] || pc.config.pcType}</span>
                </div>
              )}
              {pc.config.domain && (
                <div>
                  <span className="text-fg-muted">Domínio:</span>{' '}
                  <span className="text-fg font-mono text-[11px]">{pc.config.domain}</span>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Status</h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-fg-dim">Limpeza</span>
              <div className="flex items-center gap-2">
                <StatusBadge status={pc.cleaningStatus} />
                <button type="button" onClick={() => toggleStatus('cleaning')} className="rounded-md bg-input px-2 py-1 text-xs text-fg-dim ring-1 ring-line transition-colors hover:bg-card hover:text-fg">Avançar</button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-fg-dim">Restauração</span>
              <div className="flex items-center gap-2">
                <StatusBadge status={pc.restorationStatus} />
                <button type="button" onClick={() => toggleStatus('restoration')} className="rounded-md bg-input px-2 py-1 text-xs text-fg-dim ring-1 ring-line transition-colors hover:bg-card hover:text-fg">Avançar</button>
              </div>
            </div>
          </div>
        </section>

        {pc.softwareInstalled.length > 0 && (
          <section className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Software Instalado</h3>
            <div className="flex flex-wrap gap-1.5">
              {pc.softwareInstalled.map((sw) => (
                <span key={sw} className="rounded-md bg-input px-2 py-1 text-xs text-fg-dim ring-1 ring-line/50">{sw}</span>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Peças Trocadas</h3>
            <button
              type="button"
              onClick={() => setShowAddPart(true)}
              className="rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1 text-xs font-medium text-fg shadow-sm shadow-cyan-500/20 hover:shadow-md"
            >
              + Adicionar
            </button>
          </div>
          {pc.partsReplaced.length === 0 ? (
            <p className="text-sm text-fg-muted">Nenhuma peça trocada ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pc.partsReplaced.map((part) => (
                <div key={part.partId + part.replacedAt} className="flex items-center justify-between rounded-lg bg-input/50 px-3 py-2">
                  <div>
                    <p className="text-sm text-fg">{part.partName}</p>
                    <p className="text-xs text-fg-muted">{part.quantity}x · {part.category}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Checklists</h3>
            <button
              type="button"
              onClick={() => setShowChecklist(true)}
              className="rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1 text-xs font-medium text-fg shadow-sm shadow-cyan-500/20 hover:shadow-md"
            >
              + Aplicar
            </button>
          </div>
          {pcChecklists.length === 0 ? (
            <p className="text-sm text-fg-muted">Nenhum checklist aplicado.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pcChecklists.map((cl) => (
                <div key={cl.id} className="rounded-lg bg-input/50 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-fg">{cl.templateName}</span>
                    {cl.items.every((i) => i.done) && (
                      <icons.ui.check size={14} className="text-emerald-600 dark:text-emerald-400" />
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {cl.items.map((item) => (
                      <button
                        key={item.itemId}
                        type="button"
                        onClick={() => handleToggleItem(cl.id, item.itemId)}
                        className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs transition-colors ${
                          item.done                         ? 'text-emerald-700 dark:text-emerald-300' : 'text-fg-dim hover:bg-card/50'
                        }`}
                      >
                        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                          item.done ? 'border-emerald-600 bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-500' : 'border-line'
                        }`}>
                          {item.done && <icons.ui.check size={10} className="text-fg" />}
                        </span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {pc.observations && (
          <section className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Observações</h3>
            <p className="text-sm text-fg-dim">{pc.observations}</p>
          </section>
        )}

        {partUsages.length > 0 && (
          <section className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Peças Utilizadas</h3>
            <div className="flex flex-col gap-2">
              {partUsages.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-lg bg-input/50 px-3 py-2">
                  <div>
                    <p className="text-sm text-fg">{u.quantity}x {u.partName}</p>
                    <p className="text-xs text-fg-muted">{new Date(u.timestamp).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {linkedStockItems.length > 0 && (
          <section className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Itens Vinculados do Estoque
            </h3>
            <div className="flex flex-col gap-2">
              {linkedStockItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/stock/items/${item.id}`)}
                  className="flex items-center justify-between rounded-lg bg-violet-50/50 dark:bg-violet-950/20 px-3 py-2 text-left transition-colors hover:bg-violet-100 dark:hover:bg-violet-950/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">{item.name}</p>
                    <p className="text-xs text-fg-muted">
                      {item.subcategory}
                      {item.serialNumber && ` · ${item.serialNumber}`}
                      {item.room && ` · ${item.room}`}
                    </p>
                  </div>
                  <icons.nav.pcs size={14} className="ml-2 shrink-0 text-violet-500" />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Histórico</h3>
          <ActionTimeline logs={logs} />
        </section>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate(`/pcare/pcs/${pc.id}/edit`)} className="flex-1 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md">Editar</button>
          <button type="button" onClick={() => navigate('/pcare/qr')} className="rounded-lg border border-cyan-600 dark:border-cyan-700 px-4 py-2 text-sm text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/30">QR</button>
        </div>
      </div>

      <AddPartToPcModal
        open={showAddPart}
        onClose={() => setShowAddPart(false)}
        parts={parts}
        onConfirm={handleAddPart}
      />
      <PCChecklistModal
        open={showChecklist}
        onClose={() => setShowChecklist(false)}
        templates={templates}
        existingChecklists={pcChecklists}
        onApplyTemplate={handleApplyChecklist}
        onToggleItem={handleToggleItem}
      />
    </div>
  )
}
