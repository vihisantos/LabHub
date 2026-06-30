import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { Users, BookOpen, Clock, Activity, ArrowUpRight, BarChart3, Package, Zap, Monitor } from 'lucide-react'
import StatsCard from '../components/StatsCard'
import ChartContainer from '../components/ChartContainer'
import useIsMobile from '../hooks/useIsMobile'
import { normalizeLabName } from '../utils/labUtils'
import { parseHorario } from '../utils/timeUtils'
import { supabase } from '../lib/supabaseClient'

export default function DashboardView({ data, onNavigate }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })

  const [tabletReservas, setTabletReservas] = useState([])
  const [tabletSemana, setTabletSemana] = useState([])
  const [tabletsLoaded, setTabletsLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    const fetchTablets = async () => {
      try {
        const hoje = new Date()
        hoje.setHours(0, 0, 0, 0)
        const amanha = new Date(hoje)
        amanha.setDate(amanha.getDate() + 1)
        const daqui7 = new Date(hoje)
        daqui7.setDate(daqui7.getDate() + 7)

        const { data } = await supabase.from('tablet_reservations').select({
          select: '*',
          order: 'horario_inicio.asc',
          filters: [
            { field: 'horario_inicio', op: 'gte', value: hoje.toISOString() },
            { field: 'horario_inicio', op: 'lt', value: daqui7.toISOString() },
            { field: 'status', op: 'eq', value: 'ativa' },
          ],
        })
        if (mounted) {
          const rows = data || []
          setTabletReservas(rows.filter(r => {
            const d = new Date(r.horario_inicio)
            return d >= hoje && d < amanha
          }))
          setTabletSemana(rows)
          setTabletsLoaded(true)
        }
      } catch {
        if (mounted) setTabletsLoaded(true)
      }
    }

    fetchTablets()
    const interval = setInterval(fetchTablets, 15000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const lab1Today = data?.lab1_reservas?.length || 0
  const lab2Today = data?.lab2_reservas?.length || 0
  const reservasToday = lab1Today + lab2Today
  const totalWeek = data?.reservas_semana?.length || 0

  const lab1Week = data.reservas_semana?.filter(r =>
    r.labs?.includes('LAB01') || normalizeLabName(r.lab) === 'LAB01'
  ).length || 0

  const lab2Week = data.reservas_semana?.filter(r =>
    r.labs?.includes('LAB02') || normalizeLabName(r.lab) === 'LAB02'
  ).length || 0

  const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  const weekDaysMap = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' }

  const weeklyUsageData = weekDays.map(day => {
    const dayReservas = data.reservas_semana?.filter(r => {
      if (!r.data) return false
      const [d, m, y] = r.data.split('/').map(Number)
      const date = new Date(y, m - 1, d)
      const dayName = weekDaysMap[date.getDay()]
      return dayName === day
    }) || []
    return {
      name: day,
      Lab01: dayReservas.filter(r => r.labs?.includes('LAB01') || normalizeLabName(r.lab) === 'LAB01').length,
      Lab02: dayReservas.filter(r => r.labs?.includes('LAB02') || normalizeLabName(r.lab) === 'LAB02').length,
      Tablets: tabletSemana.filter(r => {
        const date = new Date(r.horario_inicio)
        return weekDaysMap[date.getDay()] === day
      }).length
    }
  })

  const allReservas = [
    ...(data.lab1_reservas?.map(r => ({ ...r, lab: 'Lab01' })) || []),
    ...(data.lab2_reservas?.map(r => ({ ...r, lab: 'Lab02' })) || [])
  ]

  const timeDistributionData = Array.from({ length: 24 }, (_, i) => {
    const hour = i
    const labCount = allReservas.filter(r => {
      if (!r.horario) return false
      const match = String(r.horario).match(/(\d{1,2})/)
      return match && parseInt(match[1]) === hour
    }).length
    const tabletCount = tabletReservas.filter(r => {
      return new Date(r.horario_inicio).getHours() === hour
    }).length
    return { time: `${hour}h`, ocupacao: labCount + tabletCount }
  })

  const timeDistributionFiltered = timeDistributionData.filter(item => {
    const hour = parseInt(item.time)
    return hour >= 7 && hour <= 22
  })

  const totalAlunos = data.reservas_semana?.reduce((sum, r) => sum + (parseInt(r.alunos) || 0), 0) || 0

  const peakHourData = timeDistributionData.reduce((max, curr) =>
    curr.ocupacao > max.ocupacao ? curr : max
  , { time: 'N/A', ocupacao: 0 })

  const currentHour = new Date().getHours()
  const isHoraAtiva = (horario, agora) => {
    const p = parseHorario(horario)
    if (p.inicio === null) return false
    const agoraMin = agora.getHours() * 60 + agora.getMinutes()
    return agoraMin >= p.inicio && agoraMin < p.fim
  }

  const lab1Now = data.lab1_reservas?.filter(r => isHoraAtiva(r.horario, new Date())).length || 0
  const lab2Now = data.lab2_reservas?.filter(r => isHoraAtiva(r.horario, new Date())).length || 0
  const isLabHours = currentHour >= 7 && currentHour <= 22

  const tabletHoje = tabletReservas.length
  const tabletAgoraList = tabletReservas.filter(r => {
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
      title: t('dashboard.reservasHoje'),
      value: reservasToday,
      subtitle: `Lab01: ${lab1Today} • Lab02: ${lab2Today}${tabletsLoaded ? ` • Tablet: ${tabletHoje}` : ''}`,
      icon: <Users size={20} color="#6366f1" />,
      color: '#6366f1'
    },
    {
      title: t('dashboard.totalSemana'),
      value: totalWeek,
      subtitle: `Lab01: ${lab1Week} • Lab02: ${lab2Week}${tabletsLoaded ? ` • Tablet: ${tabletSemana.length}` : ''}`,
      icon: <BookOpen size={20} color="#0ea5e9" />,
      color: '#0ea5e9'
    },
    {
      title: t('dashboard.alunosProgramados'),
      value: totalAlunos,
      subtitle: 'Previsão de público',
      icon: <Activity size={20} color="#10b981" />,
      color: '#10b981'
    },
    {
      title: t('dashboard.horarioPico'),
      value: peakHourData.time,
      subtitle: `${peakHourData.ocupacao} reservas simultâneas`,
      icon: <Clock size={20} color="#f59e0b" />,
      color: '#f59e0b'
    }
  ]

  const lab01Color = '#6366f1'
  const lab02Color = '#f59e0b'
  const tabletColor = '#10b981'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        maxWidth: '80rem',
        margin: '0 auto',
        padding: isMobile ? '6rem 1.5rem 5rem' : '9rem 1.5rem 6rem',
        background: 'transparent',
        minHeight: '100vh',
        color: '#0a0a0a',
        position: 'relative',
        zIndex: 1
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '3rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '3rem',
            height: '3rem',
            borderRadius: '0.75rem',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
          }}>
            <BarChart3 size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.2 }}>
              {t('dashboard.title')}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '2px' }}>
              {t('dashboard.subtitle', { date: today })}
            </p>
          </div>
        </div>
        <motion.button
          whileHover={{ x: 2 }}
          onClick={() => onNavigate?.('inventario')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            background: 'rgba(99, 102, 241, 0.05)',
            color: '#6366f1',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap'
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
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        {statsCards.map((card, idx) => (
          <StatsCard
            key={idx}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            icon={card.icon}
            color={card.color}
            index={idx}
          />
        ))}
      </div>

      {/* Charts + Agora */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 360px',
        gap: '1.5rem',
        alignItems: 'start'
      }}>
        {/* Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <ChartContainer
            title={t('dashboard.reservasPorDia')}
            subtitle={t('dashboard.reservasPorDiaSubtitle')}
          >
            <div style={{ height: '200px', width: '100%', marginBottom: '1.5rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyUsageData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                  />
                  <Bar dataKey="Lab01" fill={lab01Color} radius={[6, 6, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="Lab02" fill={lab02Color} radius={[6, 6, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="Tablets" fill={tabletColor} radius={[6, 6, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartContainer>

          <ChartContainer
            title={t('dashboard.distribuicaoHorario')}
            subtitle={t('dashboard.distribuicaoHorarioSubtitle')}
          >
            <div style={{ height: '200px', width: '100%', marginBottom: '1.5rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeDistributionFiltered} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorOcupacao" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={lab01Color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={lab01Color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                  />
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
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            borderRadius: '1rem',
            border: '1px solid rgba(99, 102, 241, 0.15)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            padding: '1.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={20} color="#6366f1" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Agora</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <motion.span
                animate={totalGeralNow > 0 ? { opacity: [1, 0.3, 1] } : { opacity: 0.4 }}
                transition={totalGeralNow > 0 ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: totalGeralNow > 0 ? '#22c55e' : '#94a3b8',
                  display: 'block'
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
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
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>Lab 01</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#6366f1' }}>{lab1Now}</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(lab1Now / maxNow) * 100}%` }}
                        transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
                        style={{ height: '100%', borderRadius: '4px', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>Lab 02</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f59e0b' }}>{lab2Now}</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
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
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Tablets
                    </span>
                  </div>
                  {tabletAgoraList.map(r => (
                    <div key={r.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.35rem 0',
                      borderBottom: '1px solid #f8fafc'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: '#10b981',
                          display: 'block',
                          flexShrink: 0
                        }} />
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1e293b' }}>{r.sala}</span>
                          {r.finalidade && (
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: '6px' }}>{r.finalidade}</span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981', flexShrink: 0, marginLeft: '8px' }}>
                        {r.quantidade_tablets || 1} un
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{
                marginTop: '1.5rem',
                paddingTop: '1rem',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {String(currentHour).padStart(2, '0')}h — {String(currentHour + 1).padStart(2, '0')}h
                </span>
                <div style={{ display: 'flex', gap: '16px', textAlign: 'right' }}>
                  <div>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                      {lab1Now + lab2Now}
                    </span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 500, color: '#94a3b8', marginLeft: '4px' }}>
                      labs
                    </span>
                  </div>
                  {tabletAgora > 0 && (
                    <div>
                      <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                        {tabletAgora}
                      </span>
                      <span style={{ fontSize: '0.65rem', fontWeight: 500, color: '#94a3b8', marginLeft: '4px' }}>
                        {tabletAgora === 1 ? 'sala' : 'salas'}
                      </span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 400, color: '#cbd5e1', marginLeft: '4px' }}>
                        ({tabletUnidadesAgora} {tabletUnidadesAgora === 1 ? 'tablet' : 'tablets'})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem 0',
              color: '#94a3b8'
            }}>
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
