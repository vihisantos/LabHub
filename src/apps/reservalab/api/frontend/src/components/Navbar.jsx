import { useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Maximize, LayoutGrid, ClipboardList, HelpCircle, Tablet } from 'lucide-react'
import useIsMobile from '../hooks/useIsMobile'

const Navbar = ({ 
  activeTab, 
  setActiveTab, 
  telaCheia, 
  setTelaCheia, 
  statusAPI,
  onNavigate
}) => {
  const isMobile = useIsMobile()

  const toggleTelaCheia = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setTelaCheia(true)
    } else {
      document.exitFullscreen()
      setTelaCheia(false)
    }
  }

  if (isMobile) {
    const tabs = [
      { key: 'dashboard', icon: LayoutGrid, label: 'Dash' },
      { key: 'reservas', icon: ClipboardList, label: 'Reservas' },
      { key: 'tablets', icon: Tablet, label: 'Tablets' },
    ]

    return (
      <div className="bottom-navbar">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <motion.button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                onNavigate?.(tab.key)
              }}
              whileTap={{ scale: 0.9 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1px',
                padding: '2px 12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: isActive ? '#6366f1' : '#71717a',
                transition: 'color 0.2s ease',
                position: 'relative',
                minWidth: '56px',
                minHeight: '36px',
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '20%',
                    right: '20%',
                    height: '3px',
                    background: '#6366f1',
                    borderRadius: '0 0 3px 3px',
                  }}
                />
              )}
              <Icon size={20} />
              <span style={{ fontSize: '11px', fontWeight: isActive ? 700 : 500, lineHeight: 1 }}>
                {tab.label}
              </span>
            </motion.button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="navbar-fixed" style={{
      position: 'fixed',
      top: 'calc(0.75rem + env(safe-area-inset-top))',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '4px 8px',
      background: 'rgba(255, 255, 255, 0.75)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.5)',
      borderRadius: '9999px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
    }}>
      <div style={{
        display: isMobile ? 'none' : 'flex',
        alignItems: 'center',
        gap: '4px',
        paddingRight: '8px',
        borderRight: '1px solid rgba(0,0,0,0.08)',
      }}>
        <BookOpen size={16} />
        <span className="logo-text" style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Reservas Lab</span>
      </div>

      <div style={{ display: 'flex', gap: '2px' }}>
        <motion.button 
          onClick={() => {
            setActiveTab('dashboard')
            onNavigate?.('dashboard')
          }}
          whileTap={{ scale: 0.95 }}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 12px', borderRadius: '9999px', border: 'none',
            cursor: 'pointer', fontSize: '12px',
            fontWeight: activeTab === 'dashboard' ? 600 : 500,
            background: activeTab === 'dashboard' ? '#6366f1' : 'transparent',
            color: activeTab === 'dashboard' ? '#ffffff' : '#475569',
            transition: 'all 0.2s ease'
          }}
        >
          <LayoutGrid size={14} /> {isMobile ? 'Dash' : 'Dashboard'}
        </motion.button>

        <motion.button 
          onClick={() => {
            setActiveTab('reservas')
            onNavigate?.('reservas')
          }}
          whileTap={{ scale: 0.95 }}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 12px', borderRadius: '9999px', border: 'none',
            cursor: 'pointer', fontSize: '12px',
            fontWeight: activeTab === 'reservas' ? 600 : 500,
            background: activeTab === 'reservas' ? '#6366f1' : 'transparent',
            color: activeTab === 'reservas' ? '#ffffff' : '#475569',
            transition: 'all 0.2s ease'
          }}
        >
          <ClipboardList size={14} /> {isMobile ? 'Reservas' : 'Reservas'}
        </motion.button>

        <motion.button 
          onClick={() => {
            setActiveTab('tablets')
            onNavigate?.('tablets')
          }}
          whileTap={{ scale: 0.95 }}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 12px', borderRadius: '9999px', border: 'none',
            cursor: 'pointer', fontSize: '12px',
            fontWeight: activeTab === 'tablets' ? 600 : 500,
            background: activeTab === 'tablets' ? '#6366f1' : 'transparent',
            color: activeTab === 'tablets' ? '#ffffff' : '#475569',
            transition: 'all 0.2s ease'
          }}
        >
          <Tablet size={14} /> Tablets
        </motion.button>
      </div>

      {!isMobile && <div className="nav-separator" style={{ width: '1px', height: '16px', background: '#e4e4e7', margin: '0 2px' }} />}

      <button 
        onClick={toggleTelaCheia}
        title={telaCheia ? 'Sair Tela Cheia' : 'Tela Cheia'}
        style={{
          padding: '6px', borderRadius: '50%', border: 'none',
          cursor: 'pointer', display: isMobile ? 'none' : 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'transparent', color: '#52525b'
        }}
      >
        <Maximize size={14} />
      </button>
    </div>
  )
}

export default Navbar