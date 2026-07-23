import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePCs } from '../hooks/usePCs'
import { useParts } from '../hooks/useParts'
import { useMaintenance } from '../hooks/useMaintenance'
import { useActiveLab } from '../../../lib/useLabContext'
import { actionLogService } from '../services/actionLogService'
import { SkeletonStatCard, SkeletonTimeline } from '../components/Skeletons'
import { icons } from '../../../lib/icons'
import { ChartCard, DonutChart, BarChart } from '../../../lib/charts'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function isOverdue(iso: string) {
  return new Date(iso).getTime() < Date.now()
}

function formatTime(iso: string) {
  const date = new Date(iso)
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

const iconMap: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  pc_created: icons.ui.plusCircle,
  status_changed: icons.ui.refresh,
  part_added: icons.nav.parts,
  checklist_applied: icons.nav.checklists,
  checklist_toggled: icons.ui.check,
  software_added: icons.ui.hardDrive,
}

const quickActions: { to: string; label: string; icon: ComponentType<{ size?: number; className?: string }>; color: string }[] = [
  { to: '/pc-care/assets/new', label: 'Novo ativo', icon: icons.nav.pcs, color: 'from-violet-600 to-blue-600' },
  { to: '/pc-care/reports', label: 'Relatórios', icon: icons.nav.reports, color: 'from-amber-600 to-orange-500' },
  { to: '/pc-care/checklists', label: 'Checklists', icon: icons.nav.checklists, color: 'from-rose-600 to-pink-500' },
  { to: '/pc-care/scanner', label: 'Scanner', icon: icons.ui.scanBarcode, color: 'from-violet-600 to-purple-500' },
]

export function Dashboard() {
  const navigate = useNavigate()
  const { pcs: allPcs, loading: pcsLoading } = usePCs()
  const { parts, loading: partsLoading } = useParts()
  const { all: allMaint, upcoming, loading: maintLoading } = useMaintenance()
  const { activeLab } = useActiveLab()

  const pcs = useMemo(() => {
    if (!activeLab) return allPcs
    return allPcs.filter((p) => p.labName === activeLab)
  }, [allPcs, activeLab])

  const recentLogs = useMemo(() => {
    return actionLogService.getAll()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5)
  }, [])

  const labs = useMemo(() => {
    const map = new Map<string, number>()
    pcs.forEach((p) => map.set(p.labName, (map.get(p.labName) || 0) + 1))
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [pcs])

  const statusSummary = useMemo(() => {
    const todos = pcs.length
    const feitos = pcs.filter((p) => p.cleaningStatus === 'done').length
    const andamento = pcs.filter((p) => p.cleaningStatus === 'in_progress').length
    const pendentes = pcs.filter((p) => p.cleaningStatus === 'pending').length
    return { todos, feitos, andamento, pendentes }
  }, [pcs])

  const maintenanceByMonth = useMemo(() => {
    const monthMap = new Map<string, number>()
    for (const m of allMaint) {
      const key = m.scheduledDate.slice(0, 7)
      monthMap.set(key, (monthMap.get(key) || 0) + 1)
    }
    const months: { label: string; value: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push({ label: d.toLocaleDateString('pt-BR', { month: 'short' }), value: monthMap.get(key) || 0 })
    }
    return months
  }, [allMaint])

  const cleaningDonut = useMemo(() => {
    const { feitos, andamento, pendentes } = statusSummary
    return [
      { name: 'Prontos', value: feitos, color: '#10b981' },
      { name: 'Andamento', value: andamento, color: '#f59e0b' },
      { name: 'Pendentes', value: pendentes, color: '#94a3b8' },
    ]
  }, [statusSummary])

  const labColors = ['#06b6d4', '#8b5cf6', '#f43f5e', '#f97316', '#22c55e', '#eab308', '#a855f7', '#ec4899']

  if (pcsLoading || partsLoading || maintLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <SkeletonStatCard key={i} />)}
        </div>
        <div className="rounded-xl border border-line bg-card/50 p-4">
          <div className="mb-3 h-3 w-24 rounded bg-input" />
          <SkeletonTimeline />
        </div>
      </div>
    )
  }

  const totalPCs = pcs.length
  const cleaned = pcs.filter((p) => p.cleaningStatus === 'done').length
  const inProgress = pcs.filter(
    (p) => p.cleaningStatus === 'in_progress' || p.restorationStatus === 'in_progress',
  ).length
  const pending = pcs.filter(
    (p) => p.cleaningStatus === 'pending' && p.restorationStatus === 'pending',
  ).length

  const lowStockParts = parts.filter((p) => p.quantity <= p.minQuantity)

  return (
    <div className="relative space-y-5">
      {/* ── Wallpaper blobs animados ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="wallpaper-blob"
          style={{
            width: '500px', height: '500px',
            top: '-10%', right: '-15%',
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15), transparent 70%)',
            animation: 'blob-float-slow 8s ease-in-out infinite',
          }}
        />
        <div
          className="wallpaper-blob"
          style={{
            width: '400px', height: '400px',
            bottom: '-5%', left: '-10%',
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12), transparent 70%)',
            animation: 'blob-float-slow-2 10s ease-in-out infinite',
          }}
        />
        <div
          className="wallpaper-blob"
          style={{
            width: '300px', height: '300px',
            top: '40%', left: '50%',
            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.08), transparent 70%)',
            animation: 'blob-float-slow 12s ease-in-out infinite',
          }}
        />
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-3">
        <StatCard
          label="Total de PCs"
          value={totalPCs}
          icon={icons.nav.pcs}
          gradient="from-violet-600 to-blue-600"
          glowColor="rgba(139, 92, 246, 0.15)"
          onClick={() => navigate('/pc-care/pcs')}
        />
        <StatCard
          label="Limpos"
          value={cleaned}
          icon={icons.ui.check}
          sub={`${totalPCs > 0 ? Math.round((cleaned / totalPCs) * 100) : 0}%`}
          gradient="from-emerald-600 to-green-600"
          glowColor="rgba(16, 185, 129, 0.15)"
          onClick={() => navigate('/pc-care/pcs')}
        />
        <StatCard
          label="Em andamento"
          value={inProgress}
          icon={icons.ui.refresh}
          gradient="from-amber-600 to-orange-600"
          glowColor="rgba(245, 158, 11, 0.15)"
          onClick={() => navigate('/pc-care/pcs')}
        />
        <StatCard
          label="Pendentes"
          value={pending}
          icon={icons.ui.clock}
          gradient="from-slate-600 to-slate-500"
          glowColor="rgba(148, 163, 184, 0.12)"
          onClick={() => navigate('/pc-care/pcs')}
        />
      </div>

      <div className="relative z-10 grid grid-cols-3 gap-2">
        {quickActions.map(({ to, label, icon: Icon, color }, i) => (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            className="stagger-item group flex flex-col items-center gap-1.5 rounded-xl bg-card/80 py-3.5 text-center ring-1 ring-line/50 transition-all duration-300 hover:-translate-y-1 hover:bg-card hover:shadow-lg hover:shadow-black/15 hover:ring-violet-500/30 active:scale-95"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${color} shadow-sm shadow-black/10 transition-all duration-300 group-hover:shadow-md group-hover:scale-110 group-hover:-translate-y-0.5`}>
              <Icon size={16} className="text-white" />
            </div>
            <span className="text-[10px] font-medium text-fg-dim leading-tight group-hover:text-fg transition-colors">{label}</span>
          </button>
        ))}
      </div>

      {totalPCs > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ChartCard title="Status de Limpeza">
            <DonutChart
              data={cleaningDonut}
              size={180}
              centralLabel={String(statusSummary.todos)}
              centralSubLabel="total"
            />
          </ChartCard>

          {labs.length > 1 && (
            <ChartCard title="PCs por Laboratório">
              <BarChart
                data={labs.map(([lab, count], idx) => ({
                  label: lab,
                  value: count,
                  color: labColors[idx % labColors.length],
                }))}
                layout="horizontal"
                height={Math.max(100, labs.length * 36)}
              />
            </ChartCard>
          )}

          {maintenanceByMonth.some((m) => m.value > 0) && (
            <ChartCard title="Manutenções no Tempo" subtitle="Últimos 6 meses">
              <BarChart
                data={maintenanceByMonth}
                layout="vertical"
                height={160}
                defaultColor="#f43f5e"
              />
            </ChartCard>
          )}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="rounded-xl border border-line bg-card/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Manutenções Agendadas</h3>
            <button type="button" onClick={() => navigate('/pc-care/maintenance')} className="text-[10px] font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300">
              Ver todas
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {upcoming.slice(0, 3).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate(`/pc-care/pcs/${m.pcId}`)}
                className="flex items-center justify-between rounded-lg bg-input/50 px-3 py-2.5 text-left transition-all hover:bg-input hover:shadow-sm"
              >
                <div>
                  <p className="text-sm font-medium text-fg">{m.labName} — {m.pcNumber}</p>
                  <p className="text-xs text-fg-muted">
                    {formatDate(m.scheduledDate)} · {m.type === 'cleaning' ? 'Limpeza' : m.type === 'restoration' ? 'Restauração' : 'Ambos'}
                  </p>
                </div>
                {isOverdue(m.scheduledDate) && (
                  <span className="shrink-0 rounded-full bg-red-100 dark:bg-red-900/50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                    Atrasada
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {lowStockParts.length > 0 && (
        <div className="rounded-xl border border-red-900/30 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20 p-4">
          <div className="flex items-center gap-2">
            <icons.ui.alertTriangle size={20} />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Estoque baixo</p>
              <p className="text-xs text-red-600/70 dark:text-red-400/70">{lowStockParts.length} {lowStockParts.length === 1 ? 'item precisa' : 'itens precisam'} de reposição</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/pc-care/parts')}
              className="ml-auto shrink-0 rounded-lg bg-red-100 dark:bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 transition-colors hover:bg-red-200 dark:hover:bg-red-900/60"
            >
              Ver
            </button>
          </div>
        </div>
      )}

      {recentLogs.length > 0 && (
        <div className="rounded-xl border border-line bg-card/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Atividade Recente</h3>
            <button type="button" onClick={() => navigate('/pc-care/pcs')} className="text-[10px] font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300">
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
                  onClick={() => navigate(`/pc-care/pcs/${log.pcId}`)}
                  className="flex items-start gap-3 rounded-lg bg-input/50 px-3 py-2.5 text-left transition-all hover:bg-input"
                >
                  <span className="mt-0.5">
                    {iconMap[log.type] ? (
                      (() => { const Icon = iconMap[log.type]; return <Icon size={16} /> })()
                    ) : (
                      <icons.ui.dot size={16} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{log.description}</p>
                    <p className="text-xs text-fg-muted">
                      {pc ? `${pc.labName} — ${pc.pcNumber}` : 'PC removido'}
                      {' · '}{formatTime(log.timestamp)}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {pcs.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line py-12">
          <icons.nav.pcs size={32} />
          <p className="text-sm text-fg-muted">Nenhum PC cadastrado ainda</p>
          <p className="text-xs text-fg-dim">Cadastre PCs pelo app Estoque</p>
          <button
            type="button"
            onClick={() => navigate('/stock/items')}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md hover:shadow-cyan-500/30"
          >
            Ir para Estoque
          </button>
        </div>
      )}
    </div>
  )
}

function AnimatedCounter({ value, suffix }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    setDisplay(0)
    const duration = 600
    const start = performance.now()
    const to = value

    function animate(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(to * eased))
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [value])

  return (
    <span className="count-up-item text-3xl font-bold tracking-tight text-fg transition-all duration-300 group-hover:tracking-normal">
      {display}{suffix || ''}
    </span>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
  gradient,
  glowColor,
  onClick,
}: {
  label: string
  value: number
  icon: ComponentType<{ size?: number; className?: string }>
  sub?: string
  gradient: string
  glowColor: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl bg-card p-4 text-left ring-1 ring-line/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 active:scale-[0.98] btn-press-light card-gradient-bg"
    >
      {/* Glow effect no hover */}
      <div
        className="absolute -inset-4 opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at 50% 0%, ${glowColor}, transparent 60%)`,
        }}
      />
      {/* Gradient top border animado */}
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${gradient} transition-all duration-500 group-hover:h-[3px] group-hover:shadow-lg`}
        style={{ boxShadow: `0 0 12px ${glowColor.replace('0.15', '0.3')}` }}
      />
      <div className="relative z-10">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-fg-muted group-hover:text-fg-dim transition-colors">{label}</span>
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} shadow-sm shadow-black/10 transition-all duration-300 group-hover:shadow-md group-hover:scale-110 group-hover:-rotate-3`}>
            <Icon size={15} className="text-white" />
          </div>
        </div>
        <div className="flex items-baseline gap-1.5">
          <AnimatedCounter value={value} />
          {sub && <span className="text-xs font-medium text-fg-muted">{sub}</span>}
        </div>
      </div>
    </button>
  )
}


