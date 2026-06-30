import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { BarChart3 } from 'lucide-react'

export default function WeeklyCalendar({ weekData }) {
  const { t } = useTranslation()
  const [selectedDay, setSelectedDay] = useState(null)
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos')
  
  const parseHorarioSimples = (horario) => {
    if (!horario) return { inicio: 0, fim: 0 }
    const h = String(horario).toLowerCase()
    const nums = h.match(/\d+/g)
    if (!nums || nums.length < 2) return { inicio: 0, fim: 0 }
    const inicio = parseInt(nums[0]) * 60
    const fim = parseInt(nums[1]) * 60
    return { inicio, fim }
  }
  
  const getPeriodoFromTime = (horario) => {
    if (!horario) return 'noite'
    const p = parseHorarioSimples(horario)
    if (p.inicio === 0) return 'noite'
    if (p.inicio >= 7 * 60 && p.inicio < 12 * 60) return 'manha'
    if (p.inicio >= 12 * 60 && p.inicio < 17 * 60) return 'tarde'
    return 'noite'
  }
  
  const reservasFiltradas = selectedDay ? selectedDay.reservations.filter(r => {
    if (filtroPeriodo === 'todos') return true
    return getPeriodoFromTime(r.time) === filtroPeriodo
  }).sort((a, b) => {
    const periodoOrdem = {manha: 1, tarde: 2, noite: 3}
    const pa = getPeriodoFromTime(a.time)
    const pb = getPeriodoFromTime(b.time)
    if (periodoOrdem[pa] !== periodoOrdem[pb]) {
      return periodoOrdem[pa] - periodoOrdem[pb]
    }
    const ha = parseHorarioSimples(a.time).inicio
    const hb = parseHorarioSimples(b.time).inicio
    return ha - hb
  }) : []
  
  const periodos = [
    { id: 'todos', label: 'Todos' },
    { id: 'manha', label: 'Manhã' },
    { id: 'tarde', label: 'Tarde' },
    { id: 'noite', label: 'Noite' }
  ]
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      style={{ width: '100%' }}
    >
       <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', color: '#0a0a0a' }}>{t('reservas.proximos7dias')}</h3>
       <div className="calendar-grid-7" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1rem', alignItems: 'start' }}>
        {weekData.map((day, i) => {
          const [dia, mes, ano] = day.date.split('/').map(Number)
          const date = new Date(ano, mes - 1, dia)
          const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
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
                flexDirection: 'column'
              }}
            >
              <div style={{ borderBottom: '1px solid #e4e4e7', paddingBottom: '10px', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                  {diaSemana}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#0a0a0a', display: 'flex', alignItems: 'baseline', gap: '2px', lineHeight: 1 }}>
                  {day.date.split('/')[0]}
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#a1a1aa' }}>/{day.date.split('/')[1]}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {day.reservations.slice(0, 3).map((r, j) => (
                  <div key={j} style={{ fontSize: '12px', padding: '8px', borderRadius: '4px', background: '#f5f5f5' }}>
                    <div style={{ fontWeight: 600, color: '#0a0a0a' }}>{r.lab}</div>
                    <div style={{ color: '#71717a' }}>{r.time}</div>
                  </div>
                ))}
                {day.reservations.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#a1a1aa' }}>0 reservas</div>
                )}
                {day.reservations.length > 3 && (
                  <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 500 }}>+{day.reservations.length - 3} mais</div>
                )}
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Modal de Detalhes do Dia */}
      {selectedDay && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setSelectedDay(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: '1rem'
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '1rem',
              padding: '1.5rem',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '85vh',
              overflow: 'auto'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0a0a0a' }}>{selectedDay.date}</h2>
                <p style={{ fontSize: '14px', color: '#6366f1', textTransform: 'uppercase' }}>{selectedDay.dayName}</p>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                style={{ padding: '10px', borderRadius: '50%', border: 'none', background: '#f5f5f5', cursor: 'pointer', minHeight: '44px', minWidth: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M15 9l-6 6M9 9l6 6"/>
                </svg>
              </button>
            </div>

            {/* Filtros de Período */}
            <div className="filter-segmented" style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {periodos.map(p => (
                <button
                  key={p.id}
                  onClick={() => setFiltroPeriodo(p.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '9999px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: filtroPeriodo === p.id ? '#0a0a0a' : '#f5f5f5',
                    color: filtroPeriodo === p.id ? '#ffffff' : '#52525b',
                    minHeight: '36px'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Legenda */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', background: '#fafafa', borderRadius: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#0a0a0a' }} />
                <span style={{ fontSize: '12px', color: '#52525b' }}>Lab</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
                <span style={{ fontSize: '12px', color: '#52525b' }}>Horário</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <span style={{ fontSize: '12px', color: '#52525b' }}>Professor</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                <span style={{ fontSize: '12px', color: '#52525b' }}>Disciplina</span>
              </div>
            </div>

            {/* Lista de Reservas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {reservasFiltradas.map((r, i) => (
                <div key={i} style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e4e4e7', background: '#ffffff' }}>
                  {/* Linha 1: Lab + Horário */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#0a0a0a' }} />
                      <span style={{ fontWeight: 600, color: '#0a0a0a', fontSize: '14px' }}>{r.lab}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#71717a', fontSize: '14px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                      </svg>
                      {r.time}
                    </div>
                  </div>
                  
                  {/* Linha 2: Professor */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    <span style={{ fontSize: '13px', color: '#71717a' }}>Professor:</span>
                    <span style={{ fontSize: '13px', color: '#0a0a0a', fontWeight: 500 }}>{r.professor || '—'}</span>
                  </div>
                  
                  {/* Linha 3: Quem reservou */}
                  {(r.reservaFeitaPor || r.observacao) && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '0.5rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                      <div>
                        <span style={{ fontSize: '13px', color: '#71717a' }}>Reservado por:</span>
                        <span style={{ fontSize: '13px', color: '#0a0a0a', fontWeight: 500, marginLeft: '4px' }}>{r.reservaFeitaPor || '—'}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Linha 4: Disciplina */}
                  {r.observacao && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', paddingTop: '0.5rem', borderTop: '1px solid #f5f5f5' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                      </svg>
                      <div>
                        <span style={{ fontSize: '13px', color: '#71717a' }}>Disciplina:</span>
                        <span style={{ fontSize: '13px', color: '#0a0a0a', fontWeight: 500, marginLeft: '4px' }}>{r.observacao}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {reservasFiltradas.length === 0 && (
                <p style={{ textAlign: 'center', color: '#71717a', padding: '2rem' }}>
                  {filtroPeriodo === 'todos' ? 'Nenhuma reserva neste dia' : `Nenhuma reserva no período ${filtroPeriodo === 'manha' ? 'Manhã' : filtroPeriodo === 'tarde' ? 'Tarde' : 'Noite'}`}
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}
