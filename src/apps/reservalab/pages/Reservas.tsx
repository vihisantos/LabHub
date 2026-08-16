import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tablet as TabletIcon } from 'lucide-react'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { ReservationCard } from '../components/ReservationCard'
import { ReservationModal } from '../components/ReservationModal'
import { TabletReservationCard } from '../components/TabletReservationCard'
import { TabletModal } from '../components/TabletModal'
import { WeeklyCalendar } from '../components/WeeklyCalendar'
import { fetchReservas } from '../services/api'
import { fetchTabletReservas } from '../services/supabase'
import { diasSemana, getPeriodo, isReservaAtiva, isReservaEmBreve, isReservaEncerrada } from '../utils/timeUtils'
import { getLabDisplayName } from '../utils/labUtils'
import type { ReservasAPIResponse, TabletReserva, TransformedReservation, WeekDayData } from '../types'

function FigmaLabSection({
  labName,
  reservations,
  missingSpreadsheet = false,
}: {
  labName: string
  reservations: TransformedReservation[]
  missingSpreadsheet?: boolean
}) {
  const [filter, setFilter] = useState('todos')
  const [selectedReserva, setSelectedReserva] = useState<TransformedReservation | null>(null)

  const filteredReservations = reservations.filter(
    (res) => filter === 'todos' || res.period === filter
  )

  const periods = ['todos', 'manhã', 'tarde', 'noite']

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{ position: 'relative', width: '100%', marginBottom: '5rem' }}
    >
      {/* Smoky Background Text */}
      <div style={{
        position: 'absolute', top: '-40px', left: 0, zIndex: 0,
        width: '100%', height: '100%', overflow: 'hidden',
        pointerEvents: 'none', userSelect: 'none',
      }}>
        <motion.h2
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 0.15, x: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="smoky-bg-text"
          style={{
            fontSize: 'clamp(3.5rem, 12vw, 10rem)', fontWeight: 900, lineHeight: 1,
            color: '#0a0a0a', letterSpacing: '-0.05em',
            filter: 'blur(3px)', whiteSpace: 'nowrap',
          }}
        >
          {labName}
        </motion.h2>
      </div>

      <div className="lab-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1rem', position: 'relative', zIndex: 1, flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: 'clamp(1.25rem, 5vw, 1.875rem)', fontWeight: 700, letterSpacing: '-0.025em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#1e293b' }}>
            {labName}
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'block' }} />
          </h3>
          <p style={{ color: '#71717a', fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)' }}>Reservas do dia para este laboratório</p>
        </div>

        {/* Segmented Control Filter */}
        <div className="filter-segmented" style={{ display: 'flex', padding: '3px', background: 'rgba(255,255,255,0.7)', borderRadius: '9999px', border: '1px solid rgba(99,102,241,0.15)', backdropFilter: 'blur(8px)', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          {periods.map((period) => (
            <motion.button
              key={period}
              onClick={() => setFilter(period)}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: '6px 12px', borderRadius: '9999px', border: 'none',
                fontSize: 'clamp(12px, 3.5vw, 14px)', fontWeight: 500, cursor: 'pointer',
                background: 'transparent', color: filter === period ? '#ffffff' : '#64748b',
                position: 'relative', zIndex: 1, transition: 'color 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {filter === period && (
                <motion.div
                  layoutId={`labFilter-${labName}`}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  style={{ position: 'absolute', inset: 0, background: '#6366f1', borderRadius: '9999px', zIndex: -1 }}
                />
              )}
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Horizontal List */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: '1.25rem', overflowX: 'auto', paddingBottom: '2rem', paddingTop: '0.5rem' }}>
          {filteredReservations.length > 0 ? (
            <AnimatePresence>
              {filteredReservations.map((reservation) => (
                <motion.div
                  key={reservation.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.35 }}
                >
                  <ReservationCard
                    reservation={reservation}
                    onClick={() => setSelectedReserva(reservation)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          ) : missingSpreadsheet ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                width: '100%', padding: '2rem', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                border: '1.5px dashed rgba(245,158,11,0.5)', borderRadius: '1rem',
                background: 'rgba(245,158,11,0.06)', color: '#b45309',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.7, marginBottom: '0.5rem' }}>
                <path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>
              </svg>
              <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Planilha deste campus não configurada</p>
              <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.8 }}>
                Adicione o link em Configurar workspace → Apps do workspace para ver as reservas.
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                width: '100%', padding: '3rem', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                border: '2px dashed #e4e4e7', borderRadius: '1rem', color: '#a1a1aa',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5, marginBottom: '0.5rem' }}>
                <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
              </svg>
              <p>Nenhuma reserva encontrada</p>
            </motion.div>
          )}
        </div>

        {selectedReserva && (
          <ReservationModal
            reservation={selectedReserva}
            onClose={() => setSelectedReserva(null)}
          />
        )}
      </div>
    </motion.div>
  )
}

export function ReservasView() {
  const { workspace } = useWorkspace()
  const [data, setData] = useState<ReservasAPIResponse>({ lab1_reservas: [], lab2_reservas: [], reservas_semana: [] })
  const [tabletReservas, setTabletReservas] = useState<TabletReserva[]>([])
  const [tabletWeekData, setTabletWeekData] = useState<WeekDayData[]>([])
  const [loadingTablets, setLoadingTablets] = useState(true)
  const [selectedTablet, setSelectedTablet] = useState<TabletReserva | null>(null)
  const [error, setError] = useState('')

  const atualizadoEm = data.cache_info?.timestamp
    ? new Date(data.cache_info.timestamp * 1000)
    : null

  const buscarTablets = useCallback(async () => {
    try {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const daqui7 = new Date(hoje)
      daqui7.setDate(daqui7.getDate() + 7)

      const rows = await fetchTabletReservas(hoje, daqui7, workspace?.id)

      if (rows.length > 0) {
        const ativas = rows

        const amanha = new Date(hoje)
        amanha.setDate(amanha.getDate() + 1)
        setTabletReservas(ativas.filter((r) => {
          const d = new Date(r.horario_inicio)
          return d >= hoje && d < amanha
        }))

        const grouped: Record<string, any[]> = {}
        ativas.forEach((r) => {
          const d = new Date(r.horario_inicio)
          const key = d.toLocaleDateString('pt-BR')
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(r)
        })
        setTabletWeekData(
          Object.entries(grouped).map(([date, reservas]) => {
            const [dia, mes, ano] = date.split('/').map(Number)
            const d = new Date(ano, mes - 1, dia)
            return {
              date,
              dayName: diasSemana[d.getDay()],
              reservations: reservas.map((r: TabletReserva) => {
                const inicio = new Date(r.horario_inicio)
                const fim = new Date(r.horario_fim)
                const fmt = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                return {
                  tipo: 'tablet' as const,
                  lab: r.sala,
                  time: `${fmt(inicio)} - ${fmt(fim)}`,
                  subject: r.finalidade || '',
                  professor: r.professor,
                  reservaFeitaPor: r.reservado_por,
                  observacao: r.finalidade || '',
                }
              }),
            }
          })
        )
      }
    } catch (err) {
      console.error('Erro ao buscar reservas de tablets:', err)
    } finally {
      setLoadingTablets(false)
    }
  }, [workspace?.id])

  const carregarReservas = useCallback(async () => {
    try {
      const res = await fetchReservas(workspace?.slug)
      if (res) {
        setData(res as ReservasAPIResponse)
        setError('')
      }
    } catch (err) {
      console.error('Erro ao buscar reservas da planilha:', err)
      setError('Não foi possível carregar as reservas. Verifique a conexão e tente novamente.')
    }
  }, [workspace?.slug])

  useEffect(() => {
    const tick = () => {
      carregarReservas()
      buscarTablets()
    }
    tick()
    // Polling a cada 15s para manter o badge "ao vivo" fiel ao que é exibido
    const timer = setInterval(tick, 15000)
    return () => clearInterval(timer)
  }, [carregarReservas, buscarTablets])

  const transformReservations = (reservas: any[] | undefined): TransformedReservation[] => {
    if (!reservas || !Array.isArray(reservas)) return []

    const transformed = reservas.map((r) => ({
      // Chave estável derivada do conteúdo (o id da planilha muda a cada linha)
      id: `${r.lab || 'lab'}|${r.horario}|${r.responsavel}|${r.data || ''}`,
      time: r.horario,
      period: getPeriodo(r.horario),
      subject: r.observacao || 'Disciplina',
      professor: r.responsavel,
      reservaFeitaPor: r.reserva_feita_por,
      isLive: isReservaAtiva(r.horario),
      isEmBreve: isReservaEmBreve(r.horario),
      isEnded: isReservaEncerrada(r.horario),
      combined: r.labs?.length > 1,
      alunos: r.alunos || 12,
      data: r.data,
      horario_inicio: r.horario_inicio != null ? Number(r.horario_inicio) : null,
      horario_fim: r.horario_fim != null ? Number(r.horario_fim) : null,
    }))

    return transformed.sort((a, b) => {
      if (a.isLive && !b.isLive) return -1
      if (!a.isLive && b.isLive) return 1
      if (a.isEmBreve && !b.isEmBreve) return -1
      if (!a.isEmBreve && b.isEmBreve) return 1
      if (a.isEnded && !b.isEnded) return 1
      if (!a.isEnded && b.isEnded) return -1
      return 0
    })
  }

  // Seções de lab dinâmicas: a API manda lab_reservas (LAB01..LAB0N conforme o
  // lab_count do workspace); fallback para Lab 01/02 quando a API antiga não manda.
  const labSections = useMemo(() => {
    const map = data.lab_reservas
    if (map && Object.keys(map).length > 0) {
      return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([lab, res]) => ({
          labName: `Lab ${String(lab.replace(/\D/g, '')).padStart(2, '0')}`,
          reservations: transformReservations(res),
        }))
    }
    return [
      { labName: 'Lab 01', reservations: transformReservations(data.lab1_reservas) },
      { labName: 'Lab 02', reservations: transformReservations(data.lab2_reservas) },
    ]
  }, [data])

  const transformWeeklyData = (): WeekDayData[] => {
    if (!data.reservas_semana) return []

    const grouped: Record<string, any[]> = {}
    data.reservas_semana.forEach((r) => {
      if (!grouped[r.data]) grouped[r.data] = []
      grouped[r.data].push({ ...r, tipo: 'lab' })
    })

    tabletWeekData.forEach((day) => {
      if (!grouped[day.date]) grouped[day.date] = []
      day.reservations.forEach((r) => {
        grouped[day.date].push({
          tipo: 'tablet',
          lab: r.lab,
          time: r.time,
          subject: r.subject,
          professor: r.professor,
          reservaFeitaPor: r.reservaFeitaPor,
          observacao: r.observacao || '',
        })
      })
    })

    return Object.entries(grouped)
      .map(([date, reservas]) => {
        const [dia, mes, ano] = date.split('/').map(Number)
        const d = new Date(ano, mes - 1, dia)
        return {
          date,
          dayName: diasSemana[d.getDay()],
          reservations: reservas.map((r: any) => ({
            tipo: r.tipo,
            lab: r.tipo === 'lab' ? getLabDisplayName(r.lab) || r.lab : r.lab,
            time: r.tipo === 'lab' ? r.horario : r.time,
            subject: r.tipo === 'lab' ? (r.responsavel || r.observacao || 'Disciplina') : r.subject,
            professor: r.responsavel || r.professor,
            reservaFeitaPor: r.reservaFeitaPor,
            observacao: r.observacao || '',
          })),
        }
      })
      .slice(0, 7)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        maxWidth: '80rem',
        margin: '0 auto',
        paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
        paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))',
        paddingTop: 'calc(5rem + env(safe-area-inset-top))',
        background: 'transparent',
        minHeight: '100vh',
        color: '#0a0a0a',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Page Hero Title */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ maxWidth: '42rem', marginBottom: '5rem' }}
      >
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '6px 12px', borderRadius: '9999px',
          background: '#f5f5f5', border: '1px solid #e4e4e7',
          fontSize: '14px', fontWeight: 500, marginBottom: '1.5rem',
        }}>
          <span style={{ position: 'relative', display: 'flex', width: '10px', height: '10px' }}>
            <span style={{
              position: 'absolute', width: '100%', height: '100%', borderRadius: '50%',
              background: '#0a0a0a', opacity: 0.75,
              animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
            }} />
            <span style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', background: '#0a0a0a' }} />
          </span>
          Sistema de reservas atualizado ao vivo
          {atualizadoEm && (
            <span style={{ color: '#71717a', fontWeight: 400 }}>
              · Atualizado às{' '}
              {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <h2 className="hero-title" style={{ fontSize: 'clamp(1.5rem, 6vw, 3rem)', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.2, color: '#1e293b' }}>
          Gestão inteligente de laboratórios
        </h2>
        <p className="hero-subtitle" style={{ fontSize: 'clamp(0.875rem, 3vw, 1.125rem)', color: '#71717a', marginTop: '1.5rem', lineHeight: 1.625 }}>
          Consulte a disponibilidade em tempo real e verifique os agendamentos. Filtre por período ou visualize toda a grade da semana.
        </p>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginTop: '1rem',
            padding: '10px 14px', borderRadius: '0.75rem',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            color: '#dc2626', fontSize: '0.85rem', fontWeight: 500,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
            {error}
          </div>
        )}

        {!error && data.spreadsheet === 'missing' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginTop: '1rem',
            padding: '10px 14px', borderRadius: '0.75rem',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            color: '#b45309', fontSize: '0.85rem', fontWeight: 500,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>
            </svg>
            Este campus ainda não tem planilha configurada. Adicione o link em Configurar workspace → Apps do workspace.
          </div>
        )}
      </motion.div>

      {/* Lab Sections */}
      {labSections.map((section) => (
        <FigmaLabSection
          key={section.labName}
          labName={section.labName}
          reservations={section.reservations}
          missingSpreadsheet={data.spreadsheet === 'missing'}
        />
      ))}

      {/* Tablets Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ position: 'relative', width: '100%', marginBottom: '5rem' }}
      >
        <div style={{
          position: 'absolute', top: '-40px', left: 0, zIndex: 0,
          width: '100%', height: '100%', overflow: 'hidden',
          pointerEvents: 'none', userSelect: 'none',
        }}>
          <motion.h2
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 0.15, x: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="smoky-bg-text"
            style={{
              fontSize: 'clamp(3.5rem, 12vw, 10rem)', fontWeight: 900, lineHeight: 1,
              color: '#0a0a0a', letterSpacing: '-0.05em',
              filter: 'blur(3px)', whiteSpace: 'nowrap',
            }}
          >
            Tablets
          </motion.h2>
        </div>

        <div className="lab-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1rem', position: 'relative', zIndex: 1, flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: 'clamp(1.25rem, 5vw, 1.875rem)', fontWeight: 700, letterSpacing: '-0.025em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#1e293b' }}>
              Reserva de Tablets
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'block' }} />
            </h3>
            <p style={{ color: '#71717a', fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)' }}>
              {tabletReservas.length} reserva{tabletReservas.length !== 1 ? 's' : ''} hoje
            </p>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: '1.25rem', overflowX: 'auto', paddingBottom: '2rem', paddingTop: '0.5rem' }}>
            {loadingTablets ? (
              <div style={{ padding: '2rem', color: '#71717a' }}>Carregando...</div>
            ) : tabletReservas.length > 0 ? (
              <AnimatePresence>
                {tabletReservas.map((r) => (
                  <TabletReservationCard key={r.id} reservation={r} onClick={setSelectedTablet} />
                ))}
              </AnimatePresence>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  width: '100%', padding: '3rem', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  border: '2px dashed #e4e4e7', borderRadius: '1rem', color: '#a1a1aa',
                }}
              >
                <TabletIcon size={32} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
                <p>Nenhuma reserva de tablets hoje</p>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {selectedTablet && (
        <TabletModal reservation={selectedTablet} onClose={() => setSelectedTablet(null)} />
      )}

      <WeeklyCalendar weekData={transformWeeklyData()} />
    </motion.div>
  )
}
