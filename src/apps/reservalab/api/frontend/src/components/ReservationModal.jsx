import { motion } from 'framer-motion'
import useIsMobile from '../hooks/useIsMobile'

export default function ReservationModal({ reservation, onClose }) {
  if (!reservation) return null

  const isMobile = useIsMobile()
  const alunos = reservation.alunos || 30
  const mesaSize = isMobile ? 34 : 42
  const gap = isMobile ? 6 : 10

  const renderMesa = (mesaNum) => {
    const ocupada = mesaNum <= alunos
    return (
      <motion.div
        key={mesaNum}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: mesaNum * 0.02 }}
        style={{
          width: `${mesaSize}px`,
          height: `${mesaSize}px`,
          borderRadius: '8px',
          background: ocupada 
            ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' 
            : 'linear-gradient(135deg, #e5e7eb, #f3f4f6)',
          boxShadow: ocupada 
            ? '0 4px 12px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255,255,255,0.3)' 
            : '0 2px 4px rgba(0,0,0,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: ocupada ? '#ffffff' : '#9ca3af',
          fontSize: '11px',
          fontWeight: 600,
          transform: ocupada ? 'perspective(500px) rotateX(8deg)' : 'none',
          transition: 'all 0.3s ease'
        }}
      >
        {mesaNum}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '1rem',
          padding: isMobile ? '1rem' : '2rem',
          maxWidth: '900px',
          width: '95%',
          maxHeight: '85vh',
          overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: isMobile ? '1rem' : '2rem'
        }}
        className="modal-grid-2"
      >
        {/* Lado Esquerdo - Informações */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? '0.75rem' : '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 700, color: '#0a0a0a' }}>Lab</h3>
              <p style={{ color: '#6366f1', fontSize: '14px', fontWeight: 500 }}>{reservation.time}</p>
            </div>
            <button
              onClick={onClose}
              style={{ padding: '8px', borderRadius: '50%', border: 'none', background: '#f5f5f5', cursor: 'pointer' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M15 9l-6 6M9 9l6 6"/>
              </svg>
            </button>
          </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '0.5rem' : '1rem' }}>
            <div style={{ padding: isMobile ? '0.75rem' : '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Disciplina</div>
              <div style={{ fontWeight: 600, color: '#0a0a0a', fontSize: isMobile ? '14px' : 'inherit' }}>{reservation.subject}</div>
            </div>
            <div style={{ padding: isMobile ? '0.75rem' : '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Professor</div>
              <div style={{ fontWeight: 600, color: '#0a0a0a' }}>{reservation.professor}</div>
            </div>
            {reservation.reservaFeitaPor && (
              <div style={{ padding: isMobile ? '0.75rem' : '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Reservado por</div>
                <div style={{ fontWeight: 600, color: '#0a0a0a' }}>{reservation.reservaFeitaPor}</div>
              </div>
            )}
            <div style={{ padding: isMobile ? '0.75rem' : '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Status</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {reservation.isLive ? (
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>Agora</span>
                ) : reservation.isEnded ? (
                  <span style={{ color: '#6b7280' }}>Encerrada</span>
                ) : (
                  <span style={{ color: '#f59e0b' }}>Ocupado</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Lado Direito - Mesas 3D */}
        <div>
          <h4 style={{ fontSize: isMobile ? '0.875rem' : '1rem', fontWeight: 600, color: '#374151', marginBottom: isMobile ? '0.75rem' : '1rem' }}>Ocupação das Mesas (55 lugares)</h4>
          <div style={{
            padding: isMobile ? '0.75rem' : '1.5rem',
            background: '#f9fafb',
            borderRadius: '0.5rem',
            maxHeight: '400px',
            overflowY: 'auto',
            overflowX: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: `${gap}px`,
            alignItems: 'flex-start'
          }}>
            {/* Fileira 1 - 1 PCD + 6 mesas */}
            <div style={{ display: 'flex', gap: `${gap}px`, justifyContent: 'center' }}>
              {/* Mesa PCD */}
              <motion.div
                key="pcd"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02 }}
                style={{
                  width: `${mesaSize}px`,
                  height: `${mesaSize}px`,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3), inset 0 1px 0 rgba(255,255,255,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 600,
                  transform: 'perspective(500px) rotateX(8deg)',
                  transition: 'all 0.3s ease'
                }}
                title="Mesa PCD"
              >
                <svg width={isMobile ? 16 : 20} height={isMobile ? 16 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4m0 4h.01"/>
                </svg>
              </motion.div>
              {Array.from({ length: 6 }, (_, i) => renderMesa(i + 1))}
            </div>
            {/* Fileira 2 - 6 mesas */}
            <div style={{ display: 'flex', gap: `${gap}px`, justifyContent: 'center' }}>
              {Array.from({ length: 6 }, (_, i) => renderMesa(i + 7))}
            </div>
            {/* Fileiras 3 a 8 - 7 mesas cada (6 fileiras) */}
            {Array.from({ length: 6 }, (_, rowIndex) => {
              const baseNum = 13 + rowIndex * 7
              return (
                <div key={rowIndex} style={{ display: 'flex', gap: `${gap}px`, justifyContent: 'center' }}>
                  {Array.from({ length: 7 }, (_, i) => renderMesa(baseNum + i))}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: isMobile ? '0.5rem' : '1rem', marginTop: '1rem', fontSize: isMobile ? '11px' : '12px', color: '#6b7280' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }} />
              Ocup. ({alunos})
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: '#e5e7eb' }} />
              Livres ({55 - alunos})
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
