import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts'
import { Users, BookOpen, Clock, Activity, ArrowUpRight, BarChart3, Package, Monitor, Zap, User } from 'lucide-react'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { StatsCard } from '../components/StatsCard'
import { ChartContainer } from '../components/ChartContainer'
import { useIsMobile } from '../hooks/useIsMobile'
import { normalizeLabName } from '../utils/labUtils'
import { parseHorario } from '../utils/timeUtils'
import { fetchReservas } from '../services/api'
import { fetchTabletReservas } from '../services/supabase'
import type { LaboratorioReserva, ReservasAPIResponse, TabletReserva } from '../types'

export function DashboardView() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })

  const [data, setData] = useState<ReservasAPIResponse>({ lab1_reservas: [], lab2_reservas: [], reservas_semana: [] })
  const [tabletReservas, setTabletReservas] = useState<TabletReserva[]>([])
  const [tabletSemana, setTabletSemana] = useState<TabletReserva[]>([])
  const [tabletsLoaded, setTabletsLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    const fetchAll = async () => {
      try {
        const [res, rows] = await Promise.all([
          fetchReservas(workspace?.slug).catch(() => ({ lab1_reservas: [], lab2_reservas: [], reservas_semana: [] })),
          fetchTabletReservas(new Date(), new Date(Date.now() + 7 * 86400000), workspace?.id).catch(() => [] as TabletReserva[]),
        ])
        if (!mounted) return
        setData(res as ReservasAPIResponse)
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
        const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1)
        setTabletReservas(rows.filter((r) => { const d = new Date(r.horario_inicio); return d >= hoje && d < amanha }))
        setTabletSemana(rows)
        setTabletsLoaded(true)
      } catch {
        if (mounted) setTabletsLoaded(true)
      }
    }
    fetchAll()
    const interval = setInterval(fetchAll, 15000)
    return () => { mounted = false; clearInterval(interval) }
    // Re-busca quando o workspace (campus) muda — antes a closure ficava com o valor antigo
  }, [workspace?.slug, workspace?.id])

  const lab1Today = data?.lab1_reservas?.length || 0
  const lab2Today = data?.lab2_reservas?.length || 0
  const reservasToday = lab1Today + lab2Today
  const totalWeek = data?.reservas_semana?.length || 0

  // Labs do workspace (lab_count configurável) — fallback legado LAB01/LAB02
  const labsDisponiveis = data.labs?.length ? data.labs : ['LAB01', 'LAB02']

  const reservasSemanaPorLab = (lab: string) =>
    data.reservas_semana?.filter((r) => r.labs?.includes(lab) || normalizeLabName(r.lab) === lab).length || 0

  const reservasHojePorLab = (lab: string) =>
    (data.lab_reservas?.[lab] as LaboratorioReserva[] | undefined)?.length ??
    (lab === 'LAB01' ? lab1Today : lab === 'LAB02' ? lab2Today : 0)

  // ── Ocupação da semana por lab (horas reservadas / horas disponíveis) ──
  // Janela de 7 dias × 15h de funcionamento (7h–22h) = 105h por lab
  const HORAS_SEMANA = 7 * 15
  const OCC_COLORS = ['var(--accent)', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899', '#84cc16', '#f97316', '#14b8a6']
  const labOccupancy = labsDisponiveis.map((lab) => {
    const horas = (data.reservas_semana || [])
      .filter((r) => r.labs?.includes(lab) || normalizeLabName(r.lab) === lab)
      .reduce((sum, r) => {
        const p = parseHorario(r.horario)
        if (p.inicio === null || p.fim === null) return sum
        return sum + (p.fim - p.inicio) / 60
      }, 0)
    return {
      lab,
      label: `Lab ${lab.replace(/^LAB/, '')}`,
      horas: Math.round(horas * 10) / 10,
      pct: Math.min(100, Math.round((horas / HORAS_SEMANA) * 100)),
    }
  })

  const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  const weekDaysMap: Record<number, string> = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' }

  const weeklyUsageData = weekDays.map((day) => {
    const dayReservas = data.reservas_semana?.filter((r) => {
      if (!r.data) return false
      const [d, m, y] = r.data.split('/').map(Number)
      const date = new Date(y, m - 1, d)
      return weekDaysMap[date.getDay()] === day
    }) || []
    // Uma série por lab do workspace (dinâmico por lab_count) + Tablets
    const byLab: Record<string, number | string> = {}
    for (const lab of labsDisponiveis) {
      byLab[lab] = dayReservas.filter((r) => r.labs?.includes(lab) || normalizeLabName(r.lab) === lab).length
    }
    byLab['Tablets'] = tabletSemana.filter((r) => {
      const date = new Date(r.horario_inicio)
      return weekDaysMap[date.getDay()] === day
    }).length
    return { name: day, ...byLab }
  })

  const allReservas = [
    ...(data.lab1_reservas?.map((r) => ({ ...r, lab: 'Lab01' })) || []),
    ...(data.lab2_reservas?.map((r) => ({ ...r, lab: 'Lab02' })) || []),
  ]

  const timeDistributionData = Array.from({ length: 24 }, (_, i) => {
    const hour = i
    const labCount = allReservas.filter((r) => {
      if (!r.horario) return false
      const match = String(r.horario).match(/(\d{1,2})/)
      return match && parseInt(match[1]) === hour
    }).length
    const tabletCount = tabletReservas.filter((r) => new Date(r.horario_inicio).getHours() === hour).length
    return { time: `${hour}h`, ocupacao: labCount + tabletCount }
  }).filter((item) => {
    const hour = parseInt(item.time)
    return hour >= 7 && hour <= 22
  })

  const totalAlunos = data.reservas_semana?.reduce((sum, r) => sum + (parseInt(String(r.alunos)) || 0), 0) || 0

  const peakHourData = timeDistributionData.reduce(
    (max, curr) => (curr.ocupacao > max.ocupacao ? curr : max),
    { time: 'N/A', ocupacao: 0 }
  )

  const currentHour = new Date().getHours()
  const isHoraAtiva = (horario: string | undefined, agora: Date) => {
    const p = parseHorario(horario)
    if (p.inicio === null) return false
    const agoraMin = agora.getHours() * 60 + agora.getMinutes()
    return agoraMin >= p.inicio && (p.fim === null || agoraMin < p.fim)
  }

  const lab1Now = data.lab1_reservas?.filter((r) => isHoraAtiva(r.horario, new Date())).length || 0
  const lab2Now = data.lab2_reservas?.filter((r) => isHoraAtiva(r.horario, new Date())).length || 0
  const isLabHours = currentHour >= 7 && currentHour <= 22

  const tabletHoje = tabletReservas.length
  const tabletAgoraList = tabletReservas.filter((r) => {
    const inicio = new Date(r.horario_inicio)
    const fim = new Date(r.horario_fim)
    const agora = new Date()
    return inicio <= agora && fim >= agora
  })
  const tabletAgora = tabletAgoraList.length
  const tabletUnidadesAgora = tabletAgoraList.reduce((sum, r) => sum + (r.quantidade_tablets || 1), 0)

  const totalGeralNow = lab1Now + lab2Now + tabletAgora
  const maxNow = Math.max(lab1Now, lab2Now, 1)

  const statsCards = [
    {
      title: 'Reservas Hoje',
      value: reservasToday,
      subtitle: labsDisponiveis.map((lab) => `${lab.replace(/^LAB/, 'Lab ')}: ${reservasHojePorLab(lab)}`).join(' • ') + (tabletsLoaded ? ` • Tablet: ${tabletHoje}` : ''),
      icon: <Users size={20} color="var(--accent)" />,
      color: 'var(--accent)',
    },
    {
      title: 'Total da Semana',
      value: totalWeek,
      subtitle: labsDisponiveis.map((lab) => `${lab.replace(/^LAB/, 'Lab ')}: ${reservasSemanaPorLab(lab)}`).join(' • ') + (tabletsLoaded ? ` • Tablet: ${tabletSemana.length}` : ''),
      icon: <BookOpen size={20} color="#0ea5e9" />,
      color: '#0ea5e9',
    },
    {
      title: 'Alunos Programados',
      value: totalAlunos,
      subtitle: 'Previsão de público',
      icon: <Activity size={20} color="#10b981" />,
      color: '#10b981',
    },
    {
      title: 'Horário Pico',
      value: peakHourData.time,
      subtitle: `${peakHourData.ocupacao} reservas simultâneas`,
      icon: <Clock size={20} color="#f59e0b" />,
      color: '#f59e0b',
    },
  ]

  const lab01Color = 'var(--accent)'
  const tabletColor = '#10b981'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        maxWidth: '80rem',
        margin: '0 auto',
        padding: isMobile ? '6rem 1rem 5rem' : '9rem 1.5rem 6rem',
        background: 'transparent',
        minHeight: '100vh',
        color: 'var(--text-primary)',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: isMobile ? '1.5rem' : '3rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: isMobile ? '2.25rem' : '3rem',
            height: isMobile ? '2.25rem' : '3rem',
            borderRadius: '0.75rem',
            background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #7c3aed))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px var(--accent-ring)',
          }}>
            <BarChart3 size={isMobile ? 16 : 20} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: isMobile ? '1.25rem' : '2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Visão Geral
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '2px' }}>
              Métricas em tempo real — {today}
            </p>
          </div>
        </div>
        <motion.button
          whileHover={{ x: 2 }}
          onClick={() => navigate('/stock')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--accent-ring)',
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <Package size={16} />
          Inventário
          <ArrowUpRight size={14} />
        </motion.button>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: isMobile ? '1rem' : '1.5rem',
        marginBottom: '2rem',
      }}>
        {statsCards.map((card, idx) => (
          <StatsCard key={idx} {...card} index={idx} isMobile={isMobile} />
        ))}
      </div>

      {/* Charts + Agora */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 360px',
        gap: isMobile ? '1rem' : '1.5rem',
        alignItems: 'start',
      }}>
        {/* Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '1rem' : '1.5rem' }}>
          <ChartContainer title="Reservas por Dia" subtitle="Próxima semana" isMobile={isMobile}>
            <div style={{ height: isMobile ? '140px' : '200px', width: '100%', marginBottom: isMobile ? '0.5rem' : '1.5rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyUsageData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }} />
                  {labsDisponiveis.map((lab, i) => (
                    <Bar key={lab} dataKey={lab} fill={OCC_COLORS[i % OCC_COLORS.length]} radius={[6, 6, 0, 0]} maxBarSize={24} />
                  ))}
                  <Bar dataKey="Tablets" fill={tabletColor} radius={[6, 6, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartContainer>

          <ChartContainer title="Ocupação da Semana" subtitle="Horas reservadas vs. disponíveis (7h–22h)" isMobile={isMobile}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', padding: '0.25rem 0' }}>
              {labOccupancy.map((o, i) => (
                <div key={o.lab}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{o.label}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: OCC_COLORS[i % OCC_COLORS.length] }}>
                      {o.pct}%{o.horas > 0 ? ` · ${o.horas}h` : ''}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${o.pct}%` }}
                      transition={{ duration: 0.8, delay: 0.15 + i * 0.08, ease: 'easeOut' }}
                      style={{ height: '100%', borderRadius: '4px', background: OCC_COLORS[i % OCC_COLORS.length] }}
                    />
                  </div>
                </div>
              ))}
              {labOccupancy.length === 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sem dados de reserva para esta semana</p>
              )}
            </div>
          </ChartContainer>

          <ChartContainer title="Distribuição por Horário" subtitle="Horários mais solicitados" isMobile={isMobile}>
            <div style={{ height: isMobile ? '140px' : '200px', width: '100%', marginBottom: isMobile ? '0.5rem' : '1.5rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeDistributionData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorOcupacao" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={lab01Color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={lab01Color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} dy={10} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }} />
                  <Area type="monotone" dataKey="ocupacao" stroke={lab01Color} strokeWidth={2.5} fillOpacity={1} fill="url(#colorOcupacao)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartContainer>
        </div>

        {/* Agora - Live Occupancy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          style={{
            background: 'color-mix(in srgb, var(--bg-card) 85%, transparent)',
            backdropFilter: 'blur(12px)',
            borderRadius: '1rem',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-card)',
            padding: isMobile ? '1rem' : '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={20} color="var(--accent)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Agora</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <motion.span
                animate={totalGeralNow > 0 ? { opacity: [1, 0.3, 1] } : { opacity: 0.4 }}
                transition={totalGeralNow > 0 ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: totalGeralNow > 0 ? '#22c55e' : 'var(--text-muted)',
                  display: 'block',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {totalGeralNow > 0 ? 'Ao vivo' : 'Vazio'}
              </span>
            </div>
          </div>

          {totalGeralNow > 0 ? (
            <>
              {isLabHours && (
                <>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Lab 01</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent)' }}>{lab1Now}</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(lab1Now / maxNow) * 100}%` }}
                        transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
                        style={{ height: '100%', borderRadius: '4px', background: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #7c3aed))' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Lab 02</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f59e0b' }}>{lab2Now}</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(lab2Now / maxNow) * 100}%` }}
                        transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
                        style={{ height: '100%', borderRadius: '4px', background: 'linear-gradient(90deg, #f59e0b, #f97316)' }}
                      />
                    </div>
                  </div>
                </>
              )}

              {tabletAgora > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem' }}>
                    <Monitor size={14} color="#10b981" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Tablets
                    </span>
                  </div>
                  {tabletAgoraList.map((r) => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'block', flexShrink: 0 }} />
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>{r.sala}</span>
                          {r.finalidade && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '6px' }}>{r.finalidade}</span>}
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                            <User size={8} style={{ display: 'inline', marginRight: '2px', verticalAlign: 'middle' }} />
                            {r.reservado_por}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981', flexShrink: 0, marginLeft: '8px' }}>
                        {r.quantidade_tablets || 1} un
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {String(currentHour).padStart(2, '0')}h — {String(currentHour + 1).padStart(2, '0')}h
                </span>
                <div style={{ display: 'flex', gap: '16px', textAlign: 'right' }}>
                  <div>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {lab1Now + lab2Now}
                    </span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '4px' }}>labs</span>
                  </div>
                  {tabletAgora > 0 && (
                    <div>
                      <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{tabletAgora}</span>
                      <span style={{ fontSize: '0.65rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '4px' }}>{tabletAgora === 1 ? 'sala' : 'salas'}</span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '4px' }}>({tabletUnidadesAgora} {tabletUnidadesAgora === 1 ? 'tablet' : 'tablets'})</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
              <Clock size={32} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
              <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>Nenhuma reserva ativa</p>
              <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                {isLabHours ? 'Sem atividades no momento' : 'Fora do horário de funcionamento'}
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}
