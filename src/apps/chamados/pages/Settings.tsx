import { useEffect, useState } from 'react'
import { icons } from '../../../lib/icons'
import { useCanAccessAction } from '../../../core/permissions/usePermissions'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { slaConfigService } from '../services/slaConfigService'
import { TICKET_PRIORITIES, TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS } from '../types'
import type { TicketPriority } from '../types'

export function Settings() {
  // RBAC 2.0 (F2-D-G): a edição do SLA é decidida pela Action
  // `chamados.settings.manage` (migration 079) — a mesma que o
  // `slaConfigService.update` exige no service. Antes era `isFullAccess
  // ('chamados')`, derivado de `Role.appAccess`/`profiles.app_access`.
  // Fail-closed: enquanto a consulta não responde, `allowed` é false.
  const { allowed: canWrite } = useCanAccessAction('chamados.settings.manage')
  const { workspace } = useWorkspace()

  const [slaHours, setSlaHours] = useState<Record<TicketPriority, number> | null>(null)
  const [slaSaved, setSlaSaved] = useState(false)
  const [slaError, setSlaError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspace?.id) return
    // Leitura pura: devolve o SLA salvo ou o padrão efêmero (nunca cria).
    setSlaHours(slaConfigService.getFor(workspace.id).hours)
  }, [workspace?.id])

  function handleSlaHour(priority: TicketPriority, value: string) {
    if (!slaHours) return
    const num = Number(value)
    setSlaHours({ ...slaHours, [priority]: Number.isFinite(num) ? Math.max(1, num) : 1 })
  }

  async function saveSla() {
    if (!workspace?.id || !slaHours || !canWrite) return
    setSlaError(null)
    try {
      await slaConfigService.update(workspace.id, slaHours)
      setSlaSaved(true)
      setTimeout(() => setSlaSaved(false), 2000)
    } catch (err) {
      setSlaSaved(false)
      setSlaError(err instanceof Error ? err.message : 'Não foi possível salvar os prazos.')
    }
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

        {slaError && (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            {slaError}
          </p>
        )}

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