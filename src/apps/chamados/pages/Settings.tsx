import { useEffect, useState } from 'react'
import { icons } from '../../../lib/icons'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { slaConfigService } from '../services/slaConfigService'
import { TICKET_PRIORITIES, TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS } from '../types'
import type { TicketPriority } from '../types'

export function Settings() {
  const { isFullAccess } = useAppAccess()
  const canWrite = isFullAccess('chamados')
  const { workspace } = useWorkspace()

  const [slaHours, setSlaHours] = useState<Record<TicketPriority, number> | null>(null)
  const [slaSaved, setSlaSaved] = useState(false)

  useEffect(() => {
    if (!workspace?.id) return
    setSlaHours(slaConfigService.getFor(workspace.id).hours)
  }, [workspace?.id])

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
    </div>
  )
}