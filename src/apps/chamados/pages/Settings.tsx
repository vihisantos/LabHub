import { useEffect, useMemo, useState } from 'react'
import { useProblemTemplates } from '../hooks/useProblemTemplates'
import { icons } from '../../../lib/icons'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { useAuth } from '../../../core/auth/useAuth'
import { defaultDb as supabase } from '../../../lib/supabase'
import { usePushNotifications } from '../../../lib/usePushNotifications'
import { buildPushUser } from '../../../lib/buildPushUser'
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

  const { user } = useAuth()

  // Payload de segmentação do push (mesmo formato usado no PushNotificationButton)
  const pushUser = useMemo(() => (user ? buildPushUser(user) : null), [user])

  const { supported, permission, subscribed, loading, error, subscribe } = usePushNotifications(
    [{ id: 'labhub', name: 'LabHub', subscribeUrl: '/api/push/subscribe', icon: '' }],
    pushUser,
  )

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleTestPush() {
    setTesting(true)
    setTestResult(null)
    try {
      if (!supabase) throw new Error('Supabase não configurado')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada. Faça login novamente.')
      const res = await fetch('/api/chamados/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar a notificação de teste')
      if (data.total === 0) {
        setTestResult({ ok: false, message: data.message || 'Nenhuma inscrição encontrada para este usuário' })
      } else if (data.sent > 0) {
        setTestResult({ ok: true, message: `Push de teste enviado (${data.sent}/${data.total}) — confira a notificação!` })
      } else {
        setTestResult({ ok: false, message: 'O envio falhou. Verifique as permissões do navegador.' })
      }
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Erro ao testar a notificação' })
    } finally {
      setTesting(false)
    }
  }

  const pushActive = subscribed && permission === 'granted'
  const pushDenied = permission === 'denied'

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
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-fg">Notificações Push</h2>
          <p className="text-[11px] text-fg-muted">
            Avisos de novos chamados, atribuições e mudanças de status no navegador
          </p>
        </div>

        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          {loading ? (
            <p className="text-xs text-fg-muted">Verificando suporte do navegador…</p>
          ) : !supported ? (
            <div className="flex items-center gap-3">
              <icons.ui.alertTriangle size={20} className="shrink-0 text-amber-500" />
              <p className="text-xs text-fg-muted">
                Este navegador não suporta notificações push (é preciso Service Worker + Push API).
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    pushActive
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : pushDenied
                        ? 'bg-red-500/10 text-red-500'
                        : 'bg-amber-500/10 text-amber-500'
                  }`}
                >
                  {pushActive ? (
                    <icons.ui.checkCircle size={20} />
                  ) : pushDenied ? (
                    <icons.ui.alertTriangle size={20} />
                  ) : (
                    <icons.ui.bellRing size={20} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">
                    {pushActive ? '✅ Ativas' : pushDenied ? '⚠️ Bloqueadas pelo navegador' : '🔔 Não ativadas'}
                  </p>
                  <p className="text-[11px] text-fg-muted">
                    {pushActive
                      ? 'Este dispositivo está inscrito e recebe os avisos do Chamados.'
                      : pushDenied
                        ? 'Você bloqueou as notificações neste navegador. Libere nas configurações do navegador e reative abaixo.'
                        : 'Ative para receber os avisos mesmo com o app fechado.'}
                  </p>
                </div>
              </div>

              {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
              {testResult && (
                <p className={`mt-2 text-[11px] ${testResult.ok ? 'text-emerald-500' : 'text-red-500'}`}>
                  {testResult.message}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {!pushActive && (
                  <button
                    type="button"
                    onClick={subscribe}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-400 disabled:opacity-60"
                  >
                    <icons.ui.bellRing size={14} />
                    {loading ? 'Ativando…' : pushDenied ? 'Reativar notificações' : 'Ativar notificações'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleTestPush}
                  disabled={!pushActive || testing}
                  className={`flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium transition-colors ${
                    pushActive ? 'bg-surface text-fg hover:bg-input' : 'cursor-not-allowed bg-surface text-fg-dim opacity-60'
                  }`}
                >
                  <icons.ui.refresh size={14} />
                  {testing ? 'Enviando…' : 'Testar notificação'}
                </button>
              </div>

              {pushDenied && (
                <p className="mt-2 text-[11px] leading-snug text-fg-muted">
                  Dica: no Chrome/Edge, acesse{' '}
                  <span className="font-medium text-fg">Configurações → Privacidade e segurança → Notificações</span> e
                  libere este site. Depois volte aqui e clique em “Reativar notificações”.
                </p>
              )}
            </>
          )}
        </div>
      </section>

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
                      aria-label={`Editar template ${template.assetType}`}
                      onClick={() => startEditing(template.id, template.categories)}
                      className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-input hover:text-fg"
                    >
                      <icons.ui.edit size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover template ${template.assetType}`}
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
