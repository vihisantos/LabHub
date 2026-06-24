import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePCs } from '../hooks/usePCs'
import { useParts } from '../hooks/useParts'
import { useMaintenance } from '../hooks/useMaintenance'
import { actionLogService } from '../services/actionLogService'
import { LoadingSpinner } from '../components/LoadingSpinner'

function formatDate(seconds: number) {
  return new Date(seconds * 1000).toLocaleDateString('pt-BR')
}

function isOverdue(seconds: number) {
  return seconds < Math.floor(Date.now() / 1000)
}

function formatTime(seconds: number) {
  const date = new Date(seconds * 1000)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const iconMap: Record<string, string> = {
  pc_created: '🆕',
  status_changed: '🔄',
  part_added: '🔧',
  checklist_applied: '📋',
  checklist_toggled: '✅',
  software_added: '💿',
}

const quickActions = [
  { to: '/pcare/pcs/new', label: 'Novo PC', icon: '🖥️', color: 'from-cyan-600 to-cyan-500' },
  { to: '/pcare/scanner', label: 'QR Code', icon: '📷', color: 'from-violet-600 to-violet-500' },
  { to: '/pcare/asset-scanner', label: 'Patrimônio', icon: '🏷️', color: 'from-emerald-600 to-emerald-500' },
  { to: '/pcare/reports', label: 'Relatórios', icon: '📄', color: 'from-amber-600 to-amber-500' },
  { to: '/pcare/checklists', label: 'Checklists', icon: '📋', color: 'from-rose-600 to-rose-500' },
  { to: '/pcare/qr', label: 'Gerar QR', icon: '🔲', color: 'from-sky-600 to-sky-500' },
]

export function Dashboard() {
  const navigate = useNavigate()
  const { pcs, loading: pcsLoading } = usePCs()
  const { parts, loading: partsLoading } = useParts()
  const { upcoming, loading: maintLoading } = useMaintenance()

  const recentLogs = useMemo(() => {
    return actionLogService.getAll()
      .sort((a, b) => b.timestamp.seconds - a.timestamp.seconds)
      .slice(0, 5)
  }, [])

  if (pcsLoading || partsLoading || maintLoading) return <LoadingSpinner />

  const totalPCs = pcs.length
  const cleaned = pcs.filter((p) => p.cleaningStatus === 'done').length
  const restored = pcs.filter((p) => p.restorationStatus === 'done').length
  const inProgress = pcs.filter(
    (p) => p.cleaningStatus === 'in_progress' || p.restorationStatus === 'in_progress',
  ).length
  const pending = pcs.filter(
    (p) => p.cleaningStatus === 'pending' && p.restorationStatus === 'pending',
  ).length

  const lowStockParts = parts.filter((p) => p.quantity <= p.minQuantity)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Total de PCs"
          value={totalPCs}
          icon="🖥️"
          gradient="from-cyan-600 to-blue-600"
          onClick={() => navigate('/pcare/pcs')}
        />
        <StatCard
          label="Limpos"
          value={cleaned}
          icon="✅"
          sub={`${totalPCs > 0 ? Math.round((cleaned / totalPCs) * 100) : 0}%`}
          gradient="from-emerald-600 to-green-600"
          onClick={() => navigate('/pcare/pcs')}
        />
        <StatCard
          label="Em andamento"
          value={inProgress}
          icon="🔄"
          gradient="from-amber-600 to-orange-600"
          onClick={() => navigate('/pcare/pcs')}
        />
        <StatCard
          label="Pendentes"
          value={pending}
          icon="⏳"
          gradient="from-slate-600 to-slate-500"
          onClick={() => navigate('/pcare/pcs')}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {quickActions.map(({ to, label, icon, color }) => (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            className="flex flex-col items-center gap-1 rounded-xl bg-slate-800/50 py-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md hover:shadow-black/20"
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${color} shadow-sm`}>
              <span className="text-sm">{icon}</span>
            </div>
            <span className="text-[10px] font-medium text-slate-400 leading-tight">{label}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Progresso</h3>
        <ProgressBar value={cleaned} total={totalPCs} label="Limpeza" color="from-cyan-500 to-blue-500" />
        <div className="mt-3">
          <ProgressBar value={restored} total={totalPCs} label="Restauração" color="from-emerald-500 to-green-500" />
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Manutenções Agendadas</h3>
            <button type="button" onClick={() => navigate('/pcare/maintenance')} className="text-[10px] font-medium text-cyan-400 hover:text-cyan-300">
              Ver todas
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {upcoming.slice(0, 3).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate(`/pcare/pcs/${m.pcId}`)}
                className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2.5 text-left transition-all hover:bg-slate-800 hover:shadow-sm"
              >
                <div>
                  <p className="text-sm font-medium text-slate-200">{m.labName} — {m.pcNumber}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(m.scheduledDate.seconds)} · {m.type === 'cleaning' ? 'Limpeza' : m.type === 'restoration' ? 'Restauração' : 'Ambos'}
                  </p>
                </div>
                {isOverdue(m.scheduledDate.seconds) && (
                  <span className="shrink-0 rounded-full bg-red-900/50 px-2 py-0.5 text-[10px] font-medium text-red-400">
                    Atrasada
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {lowStockParts.length > 0 && (
        <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="text-sm font-medium text-red-400">Estoque baixo</p>
              <p className="text-xs text-red-400/70">{lowStockParts.length} {lowStockParts.length === 1 ? 'item precisa' : 'itens precisam'} de reposição</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/pcare/parts')}
              className="ml-auto shrink-0 rounded-lg bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-900/60"
            >
              Ver
            </button>
          </div>
        </div>
      )}

      {recentLogs.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Atividade Recente</h3>
            <button type="button" onClick={() => navigate('/pcare/pcs')} className="text-[10px] font-medium text-cyan-400 hover:text-cyan-300">
              Ver PCs
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {recentLogs.map((log) => {
              const pc = pcs.find((p) => p.id === log.pcId)
              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => navigate(`/pcare/pcs/${log.pcId}`)}
                  className="flex items-start gap-3 rounded-lg bg-slate-800/50 px-3 py-2.5 text-left transition-all hover:bg-slate-800"
                >
                  <span className="mt-0.5">{iconMap[log.type] || '📌'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">{log.description}</p>
                    <p className="text-xs text-slate-500">
                      {pc ? `${pc.labName} — ${pc.pcNumber}` : 'PC removido'}
                      {' · '}{formatTime(log.timestamp.seconds)}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {pcs.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-700 py-12">
          <span className="text-3xl">🖥️</span>
          <p className="text-sm text-slate-500">Nenhum PC cadastrado ainda</p>
          <button
            type="button"
            onClick={() => navigate('/pcare/pcs/new')}
            className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md hover:shadow-cyan-500/30"
          >
            Adicionar primeiro PC
          </button>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  sub,
  gradient,
  onClick,
}: {
  label: string
  value: number
  icon: string
  sub?: string
  gradient: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl bg-slate-900 p-4 text-left ring-1 ring-slate-800 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20"
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${gradient}`} />
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} shadow-sm`}>
          <span className="text-xs">{icon}</span>
        </div>
      </div>
      <span className="text-2xl font-bold text-white">{value}</span>
      {sub && <span className="ml-1.5 text-xs text-slate-500">{sub}</span>}
    </button>
  )
}

function ProgressBar({ value, total, label, color }: { value: number; total: number; label: string; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-500">{value}/{total}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
