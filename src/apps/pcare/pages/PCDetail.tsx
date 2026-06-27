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
import { icons } from '../../../lib/icons'
import type { PC, PCPart } from '../types'

export function PCDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { pcs, update, remove, reload } = usePCs()

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

  return <PCDetailContent pc={pc} onUpdate={update} onRemove={remove} onReload={reload} />
}

function PCDetailContent({
  pc,
  onUpdate,
  onRemove,
  onReload,
}: {
  pc: PC
  onUpdate: (id: string, data: Partial<PC>) => PC | undefined
  onRemove: (id: string) => boolean
  onReload: () => void
}) {
  const navigate = useNavigate()
  const { parts, update: updatePart, reload: reloadParts } = useParts()
  const { templates } = useChecklistTemplates()
  const { checklists: pcChecklists, create: createChecklist, update: updateChecklist, reload: reloadChecklists } = usePCChecklists(pc.id)
  const { logs, log: addLog } = useActionLog(pc.id)
  const [showAddPart, setShowAddPart] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)

  const partUsages = useMemo(() => partUsageService.getByPC(pc.id), [pc.id])

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
              ? ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any)
              : null,
          }
        : item,
    )

    const allDone = updatedItems.every((i) => i.done)
    updateChecklist(checklistId, {
      items: updatedItems,
      completedAt: allDone
        ? ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any)
        : null,
    })

    reloadChecklists()

    addLog('checklist_toggled', newDone ? `"${item?.label}" concluído` : `"${item?.label}" pendente`)
  }

  function handleDelete() {
    if (window.confirm(`Remover ${pc.labName} — ${pc.pcNumber}?`)) {
      onRemove(pc.id)
      navigate('/pcare/pcs')
    }
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
            <div><span className="text-fg-muted">Armazenamento:</span> <span className="text-fg">{pc.specs.storage || '-'}</span></div>
            <div><span className="text-fg-muted">Sistema:</span> <span className="text-fg">{pc.specs.os || '-'}</span></div>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Status</h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Limpeza</span>
              <div className="flex items-center gap-2">
                <StatusBadge status={pc.cleaningStatus} />
                <button type="button" onClick={() => toggleStatus('cleaning')} className="rounded-md bg-input px-2 py-1 text-xs text-fg-dim ring-1 ring-slate-700 transition-colors hover:bg-slate-700 hover:text-fg">Avançar</button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Restauração</span>
              <div className="flex items-center gap-2">
                <StatusBadge status={pc.restorationStatus} />
                <button type="button" onClick={() => toggleStatus('restoration')} className="rounded-md bg-input px-2 py-1 text-xs text-fg-dim ring-1 ring-slate-700 transition-colors hover:bg-slate-700 hover:text-fg">Avançar</button>
              </div>
            </div>
          </div>
        </section>

        {pc.softwareInstalled.length > 0 && (
          <section className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Software Instalado</h3>
            <div className="flex flex-wrap gap-1.5">
              {pc.softwareInstalled.map((sw) => (
                <span key={sw} className="rounded-md bg-input px-2 py-1 text-xs text-slate-300 ring-1 ring-slate-700/50">{sw}</span>
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
                <div key={part.partId + part.replacedAt.seconds} className="flex items-center justify-between rounded-lg bg-input/50 px-3 py-2">
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
                      <icons.ui.check size={14} className="text-emerald-400" />
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {cl.items.map((item) => (
                      <button
                        key={item.itemId}
                        type="button"
                        onClick={() => handleToggleItem(cl.id, item.itemId)}
                        className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs transition-colors ${
                          item.done ? 'text-emerald-300' : 'text-fg-dim hover:bg-slate-700/50'
                        }`}
                      >
                        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                          item.done ? 'border-emerald-500 bg-emerald-500' : 'border-slate-600'
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
            <p className="text-sm text-slate-300">{pc.observations}</p>
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
                    <p className="text-xs text-fg-muted">{new Date(u.timestamp.seconds * 1000).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
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
          <button type="button" onClick={() => navigate('/pcare/pcs/new', { state: { clone: pc } })} className="rounded-lg border border-line px-4 py-2 text-sm text-fg-dim hover:bg-input">Clonar</button>
          <button type="button" onClick={() => navigate('/pcare/qr')} className="rounded-lg border border-cyan-700 px-4 py-2 text-sm text-cyan-400 hover:bg-cyan-900/30">QR</button>
          <button type="button" onClick={handleDelete} className="rounded-lg border border-red-800 px-4 py-2 text-sm text-red-400 hover:bg-red-900/30">Excluir</button>
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
