import { useEffect, useState } from 'react'
import { useProblemTemplates } from '../hooks/useProblemTemplates'
import { icons } from '../../../lib/icons'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { slaConfigService } from '../services/slaConfigService'
import { TICKET_PRIORITIES, TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS } from '../types'
import type { TicketPriority } from '../types'

export function Settings() {
  const { templates, create, update, remove } = useProblemTemplates()
  const { isFullAccess } = useAppAccess()
  const canWrite = isFullAccess('chamados')
  const { workspace } = useWorkspace()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newType, setNewType] = useState('')
  const [newCategories, setNewCategories] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [editCategories, setEditCategories] = useState('')

  const [slaHours, setSlaHours] = useState<Record<TicketPriority, number> | null>(null)
  const [slaSaved, setSlaSaved] = useState(false)

  useEffect(() => {
    if (!workspace?.id) return
    setSlaHours(slaConfigService.getFor(workspace.id).hours)
  }, [workspace?.id])

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newType.trim() || !newCategories.trim()) return
    const categories = newCategories.split('\n').map((c) => c.trim()).filter(Boolean)
    create({ assetType: newType.trim(), categories })
    setNewType('')
    setNewCategories('')
    setShowForm(false)
  }

  function startEditing(id: string, categories: string[]) {
    setEditingId(id)
    setEditCategories(categories.join('\n'))
  }

  function saveEdit(id: string) {
    const categories = editCategories.split('\n').map((c) => c.trim()).filter(Boolean)
    update(id, { categories })
    setEditingId(null)
  }

  function handleSlaHour(priority: TicketPriority, value: string) {
    if (!slaHours) return
    const num = Number(value)
    setSlaHours({ ...slaHours, [priority]: Number.isFinite(num) ? Math.max(1, num) : 1 })
  }

  function saveSla() {
    if (!workspace?.id || !slaHours) return
    slaConfigService.update(workspace.id, slaHours)
    setSlaSaved(true)
    setTimeout(() => setSlaSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-fg">SLA de atendimento</h2>
            <p className="text-[11px] text-fg-muted">
              {workspace ? `Prazos para ${workspace.name}` : 'Selecione um campus para configurar'} · contam a partir da abertura do chamado
            </p>
          </div>
          {canWrite && workspace?.id && slaHours && (
            <button
              type="button"
              onClick={saveSla}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                slaSaved ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white hover:bg-amber-400'
              }`}
            >
              {slaSaved ? <icons.ui.check size={14} /> : <icons.ui.clock size={14} />}
              {slaSaved ? 'Salvo' : 'Salvar prazos'}
            </button>
          )}
        </div>

        {slaHours && (
          <div className="space-y-2">
            {TICKET_PRIORITIES.map((priority) => (
              <div
                key={priority}
                className="flex items-center gap-3 rounded-xl bg-card p-3.5 shadow-[var(--shadow-card)]"
              >
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TICKET_PRIORITY_COLORS[priority]}`}>
                  {TICKET_PRIORITY_LABELS[priority]}
                </span>
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={slaHours[priority]}
                    disabled={!canWrite}
                    onChange={(e) => handleSlaHour(priority, e.target.value)}
                    className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-fg focus:border-amber-500 focus:outline-none disabled:opacity-50"
                  />
                  <span className="text-xs text-fg-muted">horas para atendimento</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-fg">Templates de problema</h2>
            <p className="text-xs text-fg-muted">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-400"
            >
              <icons.ui.plus size={14} />
              Novo Template
            </button>
          )}
        </div>

        {canWrite && showForm && (
          <form onSubmit={handleCreate} className="mt-3 space-y-3 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <div>
              <label className="mb-1 block text-xs font-semibold text-fg-muted">Tipo de Ativo *</label>
              <input
                type="text"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                placeholder="Ex: Projetor"
                required
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-fg-muted">Categorias (uma por linha) *</label>
              <textarea
                value={newCategories}
                onChange={(e) => setNewCategories(e.target.value)}
                placeholder={"Não liga\nSem imagem\nHDMI\nOutro"}
                rows={4}
                required
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-fg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white"
              >
                Criar
              </button>
            </div>
          </form>
        )}

        <div className="mt-3 space-y-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-fg">{template.assetType}</h3>
                {canWrite && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEditing(template.id, template.categories)}
                      className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-input hover:text-fg"
                    >
                      <icons.ui.edit size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(template.id)}
                      className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                    >
                      <icons.ui.trash size={14} />
                    </button>
                  </div>
                )}
              </div>

              {editingId === template.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editCategories}
                    onChange={(e) => setEditCategories(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex-1 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg"
                    >
                      Cancelar
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => saveEdit(template.id)}
                        className="flex-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Salvar
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {template.categories.map((cat) => (
                    <span
                      key={cat}
                      className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
