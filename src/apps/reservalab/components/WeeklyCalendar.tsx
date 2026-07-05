import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import type { WeekDayData } from '../types'
import { diasSemana, parseHorario } from '../utils/timeUtils'

interface WeeklyCalendarProps {
  weekData: WeekDayData[]
}

const Clock = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
)

const User = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)

const BookOpen = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
)

function parseTimeToISO(time: string, date: string): { start: string | null; end: string | null } {
  const [dia, mes, ano] = date.split('/').map(Number)
  const toISODate = (minutes: number) => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return new Date(ano, mes - 1, dia, h, m).toISOString()
  }

  // Lab format: "07h30 às 09h20"
  const labMatch = time.match(/(\d+)h(\d*)\s*(?:às|à)\s*(\d+)h(\d*)/)
  if (labMatch) {
    const start = parseInt(labMatch[1]) * 60 + parseInt(labMatch[2] || '0')
    const end = parseInt(labMatch[3]) * 60 + parseInt(labMatch[4] || '0')
    return { start: toISODate(start), end: toISODate(end) }
  }

  // Tablet format: "HH:MM - HH:MM"
  const tabletMatch = time.match(/(\d+):(\d+)\s*-\s*(\d+):(\d+)/)
  if (tabletMatch) {
    const start = parseInt(tabletMatch[1]) * 60 + parseInt(tabletMatch[2])
    const end = parseInt(tabletMatch[3]) * 60 + parseInt(tabletMatch[4])
    return { start: toISODate(start), end: toISODate(end) }
  }

  // Single time: just "07h30" or "19h"
  const singleMatch = time.match(/(\d+)h(\d*)/)
  if (singleMatch) {
    const start = parseInt(singleMatch[1]) * 60 + parseInt(singleMatch[2] || '0')
    return { start: toISODate(start), end: null }
  }

  return { start: null, end: null }
}

function buildTvUrl(subject: string, professor: string, time: string, date: string, observacao: string): string {
  const params = new URLSearchParams()
  params.set('tab', 'events')
  params.set('title', subject || observacao || 'Reserva')
  const description = [`Professor: ${professor}`, observacao].filter(Boolean).join(' | ')
  if (description) params.set('description', description)
  const iso = parseTimeToISO(time, date)
  if (iso.start) params.set('start_date', iso.start)
  if (iso.end) params.set('end_date', iso.end)
  return `/tv?${params.toString()}`
}

export function WeeklyCalendar({ weekData }: WeeklyCalendarProps) {
  const navigate = useNavigate()
  const [selectedDay, setSelectedDay] = useState<WeekDayData | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<'lab' | 'tablet' | 'todas'>('todas')
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos')

  const periodos = [
    { id: 'todos', label: 'Todos' },
    { id: 'manha', label: 'Manhã' },
    { id: 'tarde', label: 'Tarde' },
    { id: 'noite', label: 'Noite' },
  ]

  const getPeriodoFromTime = (horario: string): string => {
    const p = parseHorario(horario)
    if (p.inicio === null) return 'noite'
    if (p.inicio >= 7 * 60 && p.inicio < 12 * 60) return 'manha'
    if (p.inicio >= 12 * 60 && p.inicio < 17 * 60) return 'tarde'
    return 'noite'
  }

  const reservasFiltradas = selectedDay
    ? selectedDay.reservations
        .filter((r) => {
          if (filtroTipo !== 'todas' && r.tipo !== filtroTipo) return false
          if (filtroPeriodo === 'todos') return true
          return getPeriodoFromTime(r.time) === filtroPeriodo
        })
        .sort((a, b) => {
          const ha = parseHorario(a.time).inicio || 0
          const hb = parseHorario(b.time).inicio || 0
          return ha - hb
        })
    : []

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', color: '#0a0a0a' }}>
        Próximos 7 Dias
      </h3>

      <div
        className="calendar-grid-7"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))',
          gap: '1rem',
          alignItems: 'start',
          overflowX: 'auto',
          paddingBottom: '0.5rem',
          scrollbarWidth: 'thin',
        }}
      >
        {weekData.map((day, i) => {
          const [dia, mes, ano] = day.date.split('/').map(Number)
          const date = new Date(ano, mes - 1, dia)
          const diaSemana = diasSemana[date.getDay()]

          return (
            <motion.button
              key={day.date}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
              onClick={() => setSelectedDay(day)}
              style={{
                padding: '1rem',
                borderRadius: '0.75rem',
                border: '1px solid #e4e4e7',
                background: '#ffffff',
                cursor: 'pointer',
                textAlign: 'left',
                minHeight: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ borderBottom: '1px solid #e4e4e7', paddingBottom: '10px', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                  {diaSemana}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#0a0a0a', display: 'flex', alignItems: 'baseline', gap: '2px', lineHeight: 1 }}>
                  {dia}
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#a1a1aa' }}>/{String(mes).padStart(2, '0')}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {day.reservations.slice(0, 3).map((r, j) => (
                  <div key={j} style={{ fontSize: '12px', padding: '8px', borderRadius: '4px', background: '#f5f5f5' }}>
                    <div style={{ fontWeight: 600, color: '#0a0a0a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: r.tipo === 'tablet' ? '#6366f1' : '#0a0a0a', flexShrink: 0 }} />
                      {r.lab}
                    </div>
                    <div style={{ color: '#71717a' }}>{r.time}</div>
                  </div>
                ))}
                {day.reservations.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#a1a1aa' }}>0 reservas</div>
                )}
                {day.reservations.length > 3 && (
                  <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 500 }}>
                    +{day.reservations.length - 3} mais
                  </div>
                )}
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Day Detail Modal */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedDay(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 200, padding: '1rem',
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff', borderRadius: '1rem', padding: '1.5rem',
                maxWidth: '600px', width: '100%', maxHeight: '85vh', overflow: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a0a0a' }}>{selectedDay.date}</h2>
                  <p style={{ fontSize: '14px', color: '#6366f1', textTransform: 'uppercase' }}>{selectedDay.dayName}</p>
                </div>
                <button onClick={() => setSelectedDay(null)} style={{ padding: '10px', borderRadius: '50%', border: 'none', background: '#f5f5f5', cursor: 'pointer', minHeight: '44px', minWidth: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
                </button>
              </div>

              {/* Filters */}
              <div className="filter-segmented" style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'todas' as const, label: 'Todas' },
                  { id: 'lab' as const, label: 'Labs' },
                  { id: 'tablet' as const, label: 'Tablets' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setFiltroTipo(t.id)}
                    style={{
                      padding: '8px 18px', borderRadius: '9999px', border: 'none',
                      fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                      background: filtroTipo === t.id ? '#6366f1' : '#f5f5f5',
                      color: filtroTipo === t.id ? '#ffffff' : '#52525b',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="filter-segmented" style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {periodos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setFiltroPeriodo(p.id)}
                    style={{
                      padding: '8px 14px', borderRadius: '9999px', border: 'none',
                      fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                      background: filtroPeriodo === p.id ? '#0a0a0a' : '#f5f5f5',
                      color: filtroPeriodo === p.id ? '#ffffff' : '#52525b',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', background: '#fafafa', borderRadius: '0.5rem', flexWrap: 'wrap' }}>
                <LegendItem color="#0a0a0a" label="Lab" />
                <LegendItem color="#6366f1" label="Tablet" />
                <LegendItem icon={<Clock size={12} />} label="Horário" />
                <LegendItem icon={<User size={12} />} label="Professor" />
              </div>

              {/* Reservations List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <AnimatePresence>
                  {reservasFiltradas.map((r, i) => (
                    <motion.div
                      key={r.time + r.lab + i}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.35 }}
                      style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e4e4e7', background: '#ffffff' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: r.tipo === 'tablet' ? '#6366f1' : '#0a0a0a', display: 'block' }} />
                          <span style={{ fontWeight: 600, color: '#0a0a0a', fontSize: '14px' }}>{r.lab}</span>
                          {r.tipo === 'tablet' && (
                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                              Tablet
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#71717a', fontSize: '14px' }}>
                          <Clock size={14} /> {r.time}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                        <span style={{ color: '#71717a', display: 'flex' }}><User size={14} /></span>
                        <span style={{ fontSize: '13px', color: '#71717a' }}>Professor:</span>
                        <span style={{ fontSize: '13px', color: '#0a0a0a', fontWeight: 500 }}>{r.professor || '—'}</span>
                      </div>

                      {r.reservaFeitaPor && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '0.5rem' }}>
                          <span style={{ color: '#71717a', marginTop: '2px', display: 'flex' }}><User size={14} /></span>
                          <div>
                            <span style={{ fontSize: '13px', color: '#71717a' }}>Reservado por:</span>
                            <span style={{ fontSize: '13px', color: '#0a0a0a', fontWeight: 500, marginLeft: '4px' }}>{r.reservaFeitaPor}</span>
                          </div>
                        </div>
                      )}

                      {r.observacao && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', paddingTop: '0.5rem', borderTop: '1px solid #f5f5f5' }}>
                          <span style={{ color: '#71717a', marginTop: '2px', display: 'flex' }}><BookOpen size={14} /></span>
                          <div>
                            <span style={{ fontSize: '13px', color: '#71717a' }}>{r.tipo === 'tablet' ? 'Finalidade:' : 'Disciplina:'}</span>
                            <span style={{ fontSize: '13px', color: '#0a0a0a', fontWeight: 500, marginLeft: '4px' }}>{r.observacao}</span>
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => { setSelectedDay(null); navigate(buildTvUrl(r.subject, r.professor, r.time, selectedDay.date, r.observacao)) }}
                        style={{
                          marginTop: '0.5rem',
                          display: 'flex', alignItems: 'center', gap: '4px',
                          padding: '4px 8px', borderRadius: '6px',
                          border: '1px solid #e2e8f0', background: '#fff',
                          cursor: 'pointer', color: '#6366f1',
                          fontSize: '11px', fontWeight: 500,
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>
                        </svg>
                        Criar evento na TV
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {reservasFiltradas.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#71717a', padding: '2rem' }}>
                    {filtroPeriodo === 'todos' ? 'Nenhuma reserva neste dia' : `Nenhuma reserva no período ${filtroPeriodo}`}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function LegendItem({ color, label, icon }: { color?: string; label: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {icon ? icon : <span style={{ width: '12px', height: '12px', borderRadius: '2px', background: color, display: 'inline-block' }} />}
      <span style={{ fontSize: '12px', color: '#52525b' }}>{label}</span>
    </div>
  )
}
