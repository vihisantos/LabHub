import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminService } from '../../../core/auth/adminService'
import type { User } from '../../../core/auth/types'
import { useAuth } from '../../../core/auth/AuthContext'
import { PersonAvatar } from '../components/personShared'
import { icons } from '../../../lib/icons'

type Phase = 'loading' | 'has' | 'empty' | 'error'

function formatSignupDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR')
}

/**
 * Fila GLOBAL de aprovação de contas (não de memberships).
 *
 * A aprovação responde somente: "esta conta está autorizada a existir no
 * LabHub?" Ela NÃO escolhe unidade, NÃO atribui cargo e NÃO cria memberships
 * (etapa posterior de configuração de acesso). Por isso a fila não tem filtro
 * por campus, não exige workspace selecionado e cada card tem apenas
 * [ Rejeitar ] [ Aprovar ].
 *
 * Autorização: AdminGuard (is_super_admin) + RLS `profiles_select` (044,
 * super admin enxerga todos os pendentes; demais atores não veem nada).
 */
export function RequestsPage() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const isSuperAdmin = !!currentUser?.is_super_admin
  const [requests, setRequests] = useState<User[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const load = useCallback(async (silent = false) => {
    // Sem permissão administrativa nem consulta a fila (o RLS também
    // retornaria vazio — defesa em profundidade, fail-closed).
    if (!isSuperAdmin) return
    if (!silent) setPhase('loading')
    try {
      // Leitura GLOBAL: todas as contas pendentes, sem separação por campus.
      const pending = await adminService.listPendingProfiles()
      setRequests(pending)
      setPhase(pending.length > 0 ? 'has' : 'empty')
    } catch {
      setRequests([])
      setPhase('error')
    }
  }, [isSuperAdmin])

  useEffect(() => {
    load()
  }, [load])

  // Polling leve para a inbox operacional
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!savingId) load(true)
    }, 15000)
    return () => window.clearInterval(id)
  }, [load, savingId])

  async function handleApprove(userId: string) {
    setSavingId(userId)
    const success = await adminService.approveUser(userId)
    if (success) {
      setRequests((prev) => prev.filter((u) => u.id !== userId))
      setFeedback({ type: 'success', message: 'Conta aprovada — acesso ainda não configurado' })
      if (requests.length === 1) setPhase('empty')
    } else {
      setFeedback({ type: 'error', message: 'Erro ao aprovar' })
    }
    setSavingId(null)
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleReject(userId: string) {
    setSavingId(userId)
    const success = await adminService.rejectUser(userId)
    if (success) {
      setRequests((prev) => prev.filter((u) => u.id !== userId))
      setFeedback({ type: 'success', message: 'Conta rejeitada e removida' })
      if (requests.length === 1) setPhase('empty')
    } else {
      setFeedback({ type: 'error', message: 'Erro ao recusar solicitação' })
    }
    setSavingId(null)
    setTimeout(() => setFeedback(null), 3000)
  }

  if (!isSuperAdmin) {
    return (
      <div className="rounded-xl bg-card p-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-input text-fg-muted">
          <icons.ui.shield size={22} />
        </div>
        <p className="text-sm font-medium text-fg-muted">
          Apenas administradores podem revisar solicitações.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/admin/users')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-fg-dim transition-colors hover:bg-input hover:text-fg"
          aria-label="Voltar"
        >
          <icons.ui.back size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-fg">Aprovações</h1>
          <p className="text-[11px] text-fg-muted">
            {phase === 'has'
              ? `${requests.length} aguardando revisão`
              : 'Contas pendentes'}
          </p>
        </div>
      </div>

      {feedback && (
        <div className={`rounded-xl p-3 text-xs font-medium ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          {feedback.message}
        </div>
      )}

      {phase === 'loading' && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 animate-pulse rounded-xl bg-input" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 animate-pulse rounded bg-input" />
                  <div className="h-2.5 w-2/3 animate-pulse rounded bg-input" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {phase === 'error' && (
        <div className="rounded-xl bg-red-500/10 p-8 text-center ring-1 ring-red-500/20">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 text-red-500">
            <icons.ui.alertCircle size={22} />
          </div>
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Não foi possível carregar as solicitações.
          </p>
          <button
            type="button"
            onClick={() => load()}
            className="mt-3 rounded-lg bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/20"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {phase === 'empty' && (
        <div className="rounded-xl bg-card p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 empty-state-icon">
            <icons.ui.circleCheck size={22} />
          </div>
          <p className="text-sm font-medium text-fg">Tudo em dia</p>
          <p className="mt-1 text-[11px] text-fg-muted">
            Nenhuma conta pendente de aprovação.
          </p>
        </div>
      )}

      {phase === 'has' && (
        <div className="space-y-2.5">
          {requests.map((u) => {
            const busy = savingId === u.id
            return (
              <div key={u.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-3">
                  <PersonAvatar user={u} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{u.name}</p>
                    <p className="truncate text-[11px] text-fg-muted">{u.email}</p>
                    <p className="mt-0.5 text-[10px] text-fg-dim">
                      Cadastrado em {formatSignupDate(u.created_at) || 'data desconhecida'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleReject(u.id)}
                    disabled={busy}
                    className="flex-1 rounded-lg bg-input px-3 py-2 text-xs font-semibold text-fg-muted transition-colors hover:text-red-500 disabled:opacity-50"
                  >
                    Rejeitar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(u.id)}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <icons.ui.userCheck size={14} />
                    {busy ? 'Aprovando…' : 'Aprovar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
