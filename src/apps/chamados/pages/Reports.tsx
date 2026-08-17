import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ticketService } from '../services/ticketService'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { useAuth } from '../../../core/auth/useAuth'
import { defaultDb as supabase } from '../../../lib/supabase'
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  PROBLEM_AREA_LABELS,
} from '../types'
import { icons } from '../../../lib/icons'
import type { ChamadosReport, ReportPeriodDays, TicketStatus } from '../types'

const PERIOD_OPTIONS: { label: string; days: ReportPeriodDays }[] = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
  { label: 'Todo o período', days: 0 },
]

const STATUS_ORDER: TicketStatus[] = ['aberto', 'a_caminho', 'em_atendimento', 'resolvido', 'fechado']
const PRIORITY_ORDER = ['baixa', 'normal', 'alta', 'urgente']

function BarList({ items, total }: { items: [string, number][]; total: number }) {
  return (
    <div className="space-y-2">
      {items.map(([label, count]) => (
        <div key={label}>
          <div className="mb-0.5 flex items-center justify-between text-xs">
            <span className="truncate text-fg">{label}</span>
            <span className="font-semibold text-fg-muted">{count}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-input">
            <div
              className="h-1.5 rounded-full bg-amber-500"
              style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Reports() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const { user } = useAuth()
  const [days, setDays] = useState<ReportPeriodDays>(30)
  const [report, setReport] = useState<ChamadosReport | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailResult, setEmailResult] = useState<{ ok: boolean; message: string } | null>(null)

  const load = useCallback(
    async (d: ReportPeriodDays) => {
      setLoading(true)
      setError('')
      const params: { from?: string; to?: string; workspace_id?: string } = {}
      if (d > 0) {
        params.from = new Date(Date.now() - d * 86400000).toISOString()
      }
      if (workspace?.id) params.workspace_id = workspace.id
      try {
        setReport(await ticketService.getReports(params))
      } catch {
        setError('Não foi possível carregar o relatório')
      } finally {
        setLoading(false)
      }
    },
    [workspace?.id],
  )

  useEffect(() => {
    load(days)
  }, [load, days])

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            type="button"
            onClick={() => setDays(opt.days)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              days === opt.days ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading && !report && (
        <div className="flex items-center justify-center gap-3 rounded-xl bg-card py-10 text-sm text-fg-muted">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          Carregando...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-medium text-red-600 dark:text-red-400">
          <icons.ui.alertTriangle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 rounded-xl bg-card p-4 text-center shadow-[var(--shadow-card)]">
              <p className="text-3xl font-bold text-fg">{report.total}</p>
              <p className="mt-1 text-xs text-fg-muted">
                Chamados no período
                {workspace ? ` · ${workspace.name}` : ''}
              </p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <p className="text-2xl font-bold text-fg">
                {report.avgResolutionHours !== null ? `${report.avgResolutionHours}h` : '—'}
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">Tempo médio de resolução</p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <icons.ui.star
                    key={n}
                    size={16}
                    className={report.feedback.average !== null && n <= Math.round(report.feedback.average) ? 'fill-amber-500 text-amber-500' : 'text-fg-dim'}
                  />
                ))}
              </div>
              <p className="mt-1 text-center text-xs text-fg-muted">
                {report.feedback.count} avaliaç{report.feedback.count !== 1 ? 'ões' : 'ão'}
                {report.feedback.average !== null ? ` · ${report.feedback.average.toFixed(1)}` : ''}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-xs font-semibold text-fg-muted">Por status</h3>
            <BarList
              items={STATUS_ORDER.filter((s) => report.byStatus[s]).map((s) => [TICKET_STATUS_LABELS[s], report.byStatus[s]])}
              total={report.total}
            />
          </div>

          <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-xs font-semibold text-fg-muted">Por prioridade</h3>
            <BarList
              items={PRIORITY_ORDER.filter((p) => report.byPriority[p]).map((p) => [TICKET_PRIORITY_LABELS[p as keyof typeof TICKET_PRIORITY_LABELS], report.byPriority[p]])}
              total={report.total}
            />
          </div>

          {Object.keys(report.byCategory).length > 0 && (
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <h3 className="mb-3 text-xs font-semibold text-fg-muted">Por categoria</h3>
              <BarList items={Object.entries(report.byCategory).sort((a, b) => b[1] - a[1])} total={report.total} />
            </div>
          )}

          {Object.keys(report.byArea).length > 0 && (
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <h3 className="mb-3 text-xs font-semibold text-fg-muted">Por área</h3>
              <BarList
                items={Object.entries(report.byArea).map(([key, count]) => [
                  PROBLEM_AREA_LABELS[key as keyof typeof PROBLEM_AREA_LABELS] ?? key,
                  count,
                ])}
                total={report.total}
              />
            </div>
          )}

          {report.byRoom.length > 0 && (
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <h3 className="mb-3 text-xs font-semibold text-fg-muted">Top salas</h3>
              <BarList items={report.byRoom.slice(0, 8)} total={report.total} />
            </div>
          )}

          {report.byTechnician.length > 0 && (
            <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
              <h3 className="mb-3 text-xs font-semibold text-fg-muted">Atendimento por técnico</h3>
              <div className="space-y-2">
                {report.byTechnician.map((tech) => (
                  <div key={tech.name} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{tech.name}</p>
                      <p className="text-[10px] text-fg-muted">
                        {tech.open} aberto{tech.open !== 1 ? 's' : ''} · {tech.resolved} resolvido{tech.resolved !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-fg">
                        {tech.avgResolutionHours !== null ? `${tech.avgResolutionHours}h` : '—'}
                      </p>
                      <p className="text-[10px] text-fg-muted">
                        {tech.rating !== null ? `★ ${tech.rating.toFixed(1)}` : 'Sem avaliação'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-line bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-1 text-xs font-semibold text-fg">Enviar resumo semanal por email</h3>
            <p className="mb-3 text-[11px] text-fg-muted">
              Gera o resumo dos últimos 7 dias e envia para o email abaixo.
            </p>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              onFocus={() => {
                if (!emailTo && user?.email) setEmailTo(user.email)
              }}
              placeholder="email@exemplo.com"
              className="mb-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={async () => {
                if (emailSending) return
                setEmailSending(true)
                setEmailResult(null)
                try {
                  if (!supabase) throw new Error('Supabase não configurado')
                  const { data: { session } } = await supabase.auth.getSession()
                  if (!session) throw new Error('Sessão expirada. Faça login novamente.')
                  const res = await fetch('/api/chamados/reports/weekly-email', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                      to: emailTo.trim(),
                      workspace_id: workspace?.id,
                    }),
                  })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data.error || 'Erro ao enviar o email')
                  setEmailResult({ ok: true, message: `Resumo enviado para ${data.sent_to}` })
                } catch (e) {
                  setEmailResult({ ok: false, message: e instanceof Error ? e.message : 'Erro ao enviar o email' })
                } finally {
                  setEmailSending(false)
                }
              }}
              disabled={emailSending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <icons.ui.mail size={16} />
              {emailSending ? 'Enviando...' : 'Enviar resumo semanal'}
            </button>
            {emailResult && (
              <p
                className={`mt-2 text-[11px] font-medium ${
                  emailResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                }`}
              >
                {emailResult.message}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('/chamados/tickets')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-sm font-semibold text-fg transition-colors hover:border-amber-500 hover:text-amber-500"
          >
            <icons.ui.inbox size={16} />
            Ver todos os chamados
          </button>
        </>
      )}
    </div>
  )
}
