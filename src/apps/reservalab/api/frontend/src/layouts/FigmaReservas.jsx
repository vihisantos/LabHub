import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Tablet } from 'lucide-react'
import DashboardView from './Dashboard'
import ReservationCard from '../components/ReservationCard'
import ReservationModal from '../components/ReservationModal'
import TabletReservationCard from '../components/TabletReservationCard'
import TabletModal from '../components/TabletModal'
import { supabase, cleanupOldCancelledTablets } from '../lib/supabaseClient'
import { diasSemana, getPeriodo, parseHorario, isReservaAtiva, isReservaEmBreve, isReservaEncerrada } from '../utils/timeUtils'
import { getLabDisplayName } from '../utils/labUtils'

const Clock = ({ size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
)

const BookOpen = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
)

const User = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)

const XCircle = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
  </svg>
)

const RefreshCw = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
    <path d="M16 16h5v5"/>
  </svg>
)

const Maximize = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
  </svg>
)

const LayoutGrid = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
)

const ClipboardList = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
  </svg>
)

const HelpCircle = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <path d="M12 17h.01"/>
  </svg>
)

function FigmaLabSection({ labName, reservations }) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('todos')
  const [selectedReserva, setSelectedReserva] = useState(null)

  const filteredReservations = reservations.filter(
    (res) => filter === 'todos' || res.period === filter
  )

  const getStatusColor = (isLive) => {
    if (isLive) {
      return { 
        border: '1px solid rgba(239,68,68,0.5)',
        background: 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 0 20px rgba(239,68,68,0.12)'
      }
    }
    return { 
      border: '1px solid rgba(99,102,241,0.15)',
      background: 'rgba(255,255,255,0.55)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)'
    }
  }

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
        position: 'absolute', 
        top: '-40px', 
        left: 0, 
        zIndex: 0, 
        width: '100%', 
        height: '100%', 
        overflow: 'hidden',
        pointerEvents: 'none',
        userSelect: 'none'
      }}>
        <motion.h2 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 0.15, x: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="smoky-bg-text"
          style={{
            fontSize: '10rem',
            fontWeight: 900,
            lineHeight: 1,
            color: '#0a0a0a',
            letterSpacing: '-0.05em',
            filter: 'blur(3px)',
            whiteSpace: 'nowrap'
          }}
        >
          {labName}
        </motion.h2>
      </div>

      <div className="lab-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
        <div>
          <h3 style={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#1e293b' }}>
            {labName}
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
          </h3>
          <p style={{ color: '#71717a', fontSize: '0.875rem' }}>{t('reservas.reservasDoDia')}</p>
        </div>

        {/* Segmented Control Filter */}
          <div className="filter-segmented" style={{ display: 'flex', padding: '4px', background: 'rgba(255,255,255,0.7)', borderRadius: '9999px', border: '1px solid rgba(99,102,241,0.15)', backdropFilter: 'blur(8px)', position: 'relative' }}>
          {periods.map((period) => (
            <motion.button
              key={period}
              onClick={() => setFilter(period)}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: '8px 24px',
                borderRadius: '9999px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                background: 'transparent',
                color: filter === period ? '#ffffff' : '#64748b',
                position: 'relative',
                zIndex: 1,
                transition: 'color 0.2s'
              }}
            >
              {filter === period && (
                <motion.div
                  layoutId={`labFilter-${labName}`}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: '#6366f1',
                    borderRadius: '9999px',
                    zIndex: -1
                  }}
                />
              )}
              {period}
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
           ) : (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               style={{ 
                 width: '100%', 
                 padding: '3rem', 
                 display: 'flex', 
                 flexDirection: 'column', 
                 alignItems: 'center', 
                 justifyContent: 'center', 
                 border: '2px dashed #e4e4e7', 
                 borderRadius: '1rem', 
                 color: '#a1a1aa'
               }}
             >
               <XCircle size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
               <p>{t('reservas.semReservas')}</p>
             </motion.div>
           )}
       </div>
         
       {/* Modal de Reserva - Mesas 3D */}
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

function FigmaWeeklyCalendar({ weekData }) {
  const { t } = useTranslation()
  const [selectedDay, setSelectedDay] = useState(null)
  const [filtroTipo, setFiltroTipo] = useState('lab')
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos')

  const getPeriodoFromTime = (horario) => {
    if (!horario) return 'noite'
    const p = parseHorario(horario)
    if (p.inicio === null) return 'noite'
    if (p.inicio >= 7 * 60 && p.inicio < 12 * 60) return 'manha'
    if (p.inicio >= 12 * 60 && p.inicio < 17 * 60) return 'tarde'
    return 'noite'
  }
  
  const reservasFiltradas = selectedDay ? selectedDay.reservations.filter(r => {
    if (filtroTipo !== 'todas' && r.tipo !== filtroTipo) return false
    if (filtroPeriodo === 'todos') return true
    return getPeriodoFromTime(r.time) === filtroPeriodo
  }).sort((a, b) => {
    const periodoOrdem = {manha: 1, tarde: 2, noite: 3}
    const pa = getPeriodoFromTime(a.time)
    const pb = getPeriodoFromTime(b.time)
    if (periodoOrdem[pa] !== periodoOrdem[pb]) {
      return periodoOrdem[pa] - periodoOrdem[pb]
    }
    const ha = parseHorario(a.time).inicio || 0
    const hb = parseHorario(b.time).inicio || 0
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
                <XCircle size={24} />
              </button>
            </div>

            {/* Filtro Labs / Tablets */}
            <div className="filter-segmented" style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              {[
                { id: 'lab', label: 'Labs' },
                { id: 'tablet', label: 'Tablets' },
              ].map(t => (
                <motion.button
                  key={t.id}
                  onClick={() => setFiltroTipo(t.id)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '9999px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: filtroTipo === t.id ? '#6366f1' : '#f5f5f5',
                    color: filtroTipo === t.id ? '#ffffff' : '#52525b',
                    minHeight: '36px',
                  }}
                >
                  {t.label}
                </motion.button>
              ))}
            </div>

            {/* Filtros de Período */}
            <div className="filter-segmented" style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {periodos.map(p => (
                <motion.button
                  key={p.id}
                  onClick={() => setFiltroPeriodo(p.id)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '9999px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: filtroPeriodo === p.id ? '#0a0a0a' : '#f5f5f5',
                    color: filtroPeriodo === p.id ? '#ffffff' : '#52525b',
                    minHeight: '36px',
                    position: 'relative'
                  }}
                >
                  {p.label}
                </motion.button>
              ))}
            </div>

            {/* Legenda */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', background: '#fafafa', borderRadius: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#0a0a0a' }} />
                <span style={{ fontSize: '12px', color: '#52525b' }}>Lab</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: '#6366f1' }} />
                <span style={{ fontSize: '12px', color: '#52525b' }}>Tablet</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={12} />
                <span style={{ fontSize: '12px', color: '#52525b' }}>Horário</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={12} />
                <span style={{ fontSize: '12px', color: '#52525b' }}>Professor</span>
              </div>
            </div>

            {/* Lista de Reservas */}
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
                  style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e4e4e7', background: '#ffffff' }}>
                  {/* Linha 1: Lab + Horário */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: r.tipo === 'tablet' ? '#6366f1' : '#0a0a0a' }} />
                      <span style={{ fontWeight: 600, color: '#0a0a0a', fontSize: '14px' }}>{r.lab}</span>
                      {r.tipo === 'tablet' && (
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                          Tablet
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#71717a', fontSize: '14px' }}>
                      <Clock size={14} />
                      {r.time}
                    </div>
                  </div>
                  
                  {/* Linha 2: Professor */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                    <User size={14} style={{ color: '#71717a' }} />
                    <span style={{ fontSize: '13px', color: '#71717a' }}>Professor:</span>
                    <span style={{ fontSize: '13px', color: '#0a0a0a', fontWeight: 500 }}>{r.professor || '—'}</span>
                  </div>
                  
                  {/* Linha 3: Quem reservou */}
                  {r.reservaFeitaPor && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '0.5rem' }}>
                      <User size={14} style={{ color: '#71717a', marginTop: '2px' }} />
                      <div>
                        <span style={{ fontSize: '13px', color: '#71717a' }}>Reservado por:</span>
                        <span style={{ fontSize: '13px', color: '#0a0a0a', fontWeight: 500, marginLeft: '4px' }}>{r.reservaFeitaPor}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Linha 4: Disciplina / Finalidade */}
                  {r.observacao && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', paddingTop: '0.5rem', borderTop: '1px solid #f5f5f5' }}>
                      <BookOpen size={14} style={{ color: '#71717a', marginTop: '2px' }} />
                      <div>
                        <span style={{ fontSize: '13px', color: '#71717a' }}>{r.tipo === 'tablet' ? 'Finalidade:' : 'Disciplina:'}</span>
                        <span style={{ fontSize: '13px', color: '#0a0a0a', fontWeight: 500, marginLeft: '4px' }}>{r.observacao}</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
              </AnimatePresence>
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

export default function FigmaReservas({ data, carregando, onRefresh, statusAPI, telaCheia, onToggleTelaCheia, activeTab = 'reservas', onNavigate }) {
  const { t } = useTranslation()
  const [tabletReservas, setTabletReservas] = useState([])
  const [tabletWeekData, setTabletWeekData] = useState([])
  const [loadingTablets, setLoadingTablets] = useState(true)
  const [selectedTablet, setSelectedTablet] = useState(null)

  const buscarTablets = async () => {
    cleanupOldCancelledTablets()
    try {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const daqui7 = new Date(hoje)
      daqui7.setDate(daqui7.getDate() + 7)

      const { data: rows } = await supabase.from('tablet_reservations').select({
        select: '*',
        order: 'horario_inicio.asc',
        filters: [
          { field: 'horario_inicio', op: 'gte', value: hoje.toISOString() },
          { field: 'horario_inicio', op: 'lt', value: daqui7.toISOString() },
          { field: 'status', op: 'eq', value: 'ativa' },
        ],
      })
      if (rows) {
        const ativas = rows

        // hoje
        const amanha = new Date(hoje)
        amanha.setDate(amanha.getDate() + 1)
        setTabletReservas(ativas.filter(r => {
          const d = new Date(r.horario_inicio)
          return d >= hoje && d < amanha
        }))

        // semana
        const grouped = {}
        ativas.forEach(r => {
          const d = new Date(r.horario_inicio)
          const key = d.toLocaleDateString('pt-BR')
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(r)
        })
        setTabletWeekData(Object.entries(grouped).map(([date, reservas]) => ({
          date,
          reservations: reservas.map(r => {
            const inicio = new Date(r.horario_inicio)
            const fim = new Date(r.horario_fim)
            const fmt = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            return {
              tipo: 'tablet',
              lab: r.sala,
              time: `${fmt(inicio)} - ${fmt(fim)}`,
              subject: r.finalidade || '',
              professor: r.professor,
              reservaFeitaPor: r.reservado_por,
              finalidade: r.finalidade,
            }
          })
        })))
      }
    } catch (err) {
      console.error('Erro ao buscar reservas de tablets:', err)
    } finally {
      setLoadingTablets(false)
    }
  }

  useEffect(() => {
    buscarTablets()
  }, [])

  if (!data) return null

  const transformReservations = (reservas) => {
    if (!reservas || !Array.isArray(reservas)) return []
    
  const transformed = (reservas || []).map((r, i) => ({
    id: i,
    time: r.horario,
    period: getPeriodo(r.horario),
    subject: r.observacao || 'Disciplina',
    professor: r.responsavel,
    reservaFeitaPor: r.reserva_feita_por,
    isLive: isReservaAtiva(r.horario),
    isEmBreve: isReservaEmBreve(r.horario),
    isEnded: isReservaEncerrada(r.horario),
    combined: r.labs?.length > 1,
    alunos: r.alunos || 12
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

  const transformWeeklyData = () => {
    if (!data.reservas_semana) return []
    
    const grouped = {}
    data.reservas_semana.forEach(r => {
      if (!grouped[r.data]) grouped[r.data] = []
      grouped[r.data].push({ ...r, tipo: 'lab' })
    })
    
    tabletWeekData.forEach(day => {
      if (!grouped[day.date]) grouped[day.date] = []
      day.reservations.forEach(r => {
        grouped[day.date].push({
          tipo: 'tablet',
          lab: r.lab,
          time: r.time,
          subject: r.subject,
          professor: r.professor,
          reservaFeitaPor: r.reservaFeitaPor,
          observacao: r.finalidade || '',
        })
      })
    })
    
    return Object.entries(grouped).map(([date, reservas]) => {
      const [dia, mes, ano] = date.split('/').map(Number)
      const d = new Date(ano, mes - 1, dia)
      return {
        date,
        dayName: diasSemana[d.getDay()],
        reservations: reservas.map(r => ({
            tipo: r.tipo,
            lab: r.lab,
            time: r.tipo === 'lab' ? r.horario : r.time,
            subject: r.tipo === 'lab' ? (r.responsavel || r.observacao || 'Disciplina') : r.subject,
            professor: r.responsavel || r.professor,
            reservaFeitaPor: r.reservaFeitaPor,
            observacao: r.observacao || r.finalidade || ''
        }))
      }
    }).slice(0, 7)
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
        zIndex: 1
      }}
      className="max-w-7xl"
    >
      {/* Page Hero Title */}
      {activeTab === 'reservas' && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ maxWidth: '42rem', marginBottom: '5rem' }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '9999px', background: '#f5f5f5', border: '1px solid #e4e4e7', fontSize: '14px', fontWeight: 500, marginBottom: '1.5rem' }}>
            <span style={{ position: 'relative', display: 'flex', width: '10px', height: '10px' }}>
              <span style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: '#0a0a0a', opacity: 0.75, animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
              <span style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', background: '#0a0a0a' }} />
            </span>
            {t('nav.subtitle')}
          </div>
          
           <h2 className="hero-title" style={{ fontSize: '3rem', fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.2, color: '#1e293b' }}>
             {t('reservas.title')}
           </h2>
           <p className="hero-subtitle" style={{ fontSize: '1.125rem', color: '#71717a', marginTop: '1.5rem', lineHeight: 1.625 }}>
             {t('reservas.subtitle')}
           </p>
        </motion.div>
      )}

      {activeTab === 'dashboard' && (
        <DashboardView data={data} />
      )}

      {activeTab === 'reservas' && (
        <>
          <FigmaLabSection 
            labName={t('common.lab01')} 
            reservations={transformReservations(data.lab1_reservas)} 
          />
          <FigmaLabSection 
            labName={t('common.lab02')} 
            reservations={transformReservations(data.lab2_reservas)} 
          />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ position: 'relative', width: '100%', marginBottom: '5rem' }}
          >
            <div style={{
              position: 'absolute', top: '-40px', left: 0, zIndex: 0,
              width: '100%', height: '100%', overflow: 'hidden',
              pointerEvents: 'none', userSelect: 'none'
            }}>
              <motion.h2
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 0.15, x: 0 }}
                transition={{ duration: 1, delay: 0.2 }}
                className="smoky-bg-text"
                style={{
                  fontSize: '10rem', fontWeight: 900, lineHeight: 1,
                  color: '#0a0a0a', letterSpacing: '-0.05em',
                  filter: 'blur(3px)', whiteSpace: 'nowrap'
                }}
              >
                Tablets
              </motion.h2>
            </div>

            <div className="lab-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
              <div>
                <h3 style={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#1e293b' }}>
                  Reserva de Tablets
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                </h3>
                <p style={{ color: '#71717a', fontSize: '0.875rem' }}>
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
                    {tabletReservas.map(r => (
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
                      border: '2px dashed #e4e4e7', borderRadius: '1rem', color: '#a1a1aa'
                    }}
                  >
                    <Tablet size={32} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
                    <p>Nenhuma reserva de tablets hoje</p>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>

          {selectedTablet && (
            <TabletModal reservation={selectedTablet} onClose={() => setSelectedTablet(null)} />
          )}

          <FigmaWeeklyCalendar weekData={transformWeeklyData()} />
        </>
      )}
    </motion.div>
  )
}
