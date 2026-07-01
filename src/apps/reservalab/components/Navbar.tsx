import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import { icons } from '../../../lib/icons'

interface NavbarProps {
  statusAPI?: string
}

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: icons.nav.dashboard },
  { id: 'reservas', label: 'Reservas', icon: icons.ui.clock },
  { id: 'tablets', label: 'Tablets', icon: icons.nav.pcs },
]

export function Navbar({ statusAPI = 'online' }: NavbarProps) {
  const isMobile = useIsMobile()
  const location = useLocation()
  const navigate = useNavigate()

  const currentPath = location.pathname
  const isRoot = currentPath === '/reservalab' || currentPath === '/reservalab/'
  const activeTab = isRoot ? 'reservas' : (currentPath.split('/').pop() || '')

  const handleNavigate = (tabId: string) => {
    if (tabId === 'reservas') {
      navigate('/reservalab')
    } else {
      navigate(`/reservalab/${tabId}`)
    }
  }

  if (isMobile) {
    return (
      <div
        className="bottom-navbar"
        style={{
          position: 'fixed',
          bottom: 'max(1rem, env(safe-area-inset-bottom))',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '4px 6px',
          maxWidth: '90vw',
          overflow: 'hidden',
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '9999px',
          boxShadow: '0 4px 32px rgba(0, 0, 0, 0.15)',
          gap: '2px',
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
                padding: '8px 8px',
                borderRadius: '9999px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '10px',
                fontWeight: 500,
                transition: 'color 0.2s',
                minHeight: '36px',
                flexShrink: 0,
              }}
              title="Início"
            >
              <icons.ui.home size={16} />
          <span>Início</span>
        </button>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => handleNavigate(tab.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1px',
                padding: '6px 10px',
                borderRadius: '9999px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: isActive ? '#6366f1' : 'rgba(255,255,255,0.7)',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                position: 'relative',
                transition: 'color 0.2s',
                minHeight: '36px',
                flexShrink: 0,
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(99, 102, 241, 0.2)',
                    borderRadius: '9999px',
                  }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 1 }}>
                <tab.icon size={16} />
              </span>
              <span style={{ position: 'relative', zIndex: 1 }}>{tab.label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // Desktop: top navbar
  return (
    <nav
      className="navbar-fixed"
      style={{
        position: 'fixed',
        top: 'max(0.75rem, env(safe-area-inset-top))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '6px 12px',
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '9999px',
        boxShadow: '0 4px 32px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Home */}
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px',
          borderRadius: '9999px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.5)',
          transition: 'color 0.2s',
          marginRight: '4px',
        }}
        title="Início"
      >
        <icons.ui.home size={18} />
      </button>

      {/* Logo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 12px',
        marginRight: '8px',
      }}>
        <span className="logo-text" style={{
          fontSize: '14px',
          fontWeight: 700,
          color: '#ffffff',
          letterSpacing: '-0.02em',
        }}>
          ReservasLab
        </span>
      </div>

      <div className="nav-separator" style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.15)' }} />

      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => handleNavigate(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '9999px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: isActive ? 600 : 500,
              whiteSpace: 'nowrap',
              position: 'relative',
            }}
          >
            {isActive && (
              <motion.div
                layoutId="desktopActiveTab"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(99, 102, 241, 0.6)',
                  borderRadius: '9999px',
                }}
              />
            )}
            <span style={{ position: 'relative', zIndex: 1 }}>
              <tab.icon size={16} />
            </span>
            <span style={{ position: 'relative', zIndex: 1 }}>{tab.label}</span>
          </button>
        )
      })}

      {/* Status API indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginLeft: '12px',
        padding: '4px 12px',
        borderRadius: '9999px',
        background: 'rgba(0,0,0,0.2)',
      }}>
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: statusAPI === 'online' ? '#22c55e' : '#ef4444',
        }} />
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
          {statusAPI === 'online' ? 'Online' : statusAPI === 'offline' ? 'Offline' : '...'}
        </span>
      </div>
    </nav>
  )
}
