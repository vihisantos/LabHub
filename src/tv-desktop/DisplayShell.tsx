import { useEffect, useState, type CSSProperties } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Settings, RefreshCw, ExternalLink, LogOut } from 'lucide-react'
import { ToastProvider } from '../lib/ToastContext'
import { MusicPlayerProvider } from '../apps/tv/contexts/MusicPlayerContext'
import { TvDisplay } from '../apps/tv/pages/TvDisplay'
import { workspaceStore } from '../core/workspaces/store'
import { startHeartbeat, openAdminPanel } from './deviceService'
import type { DeviceConfig } from './config'

interface DisplayShellProps {
  config: DeviceConfig
  onReconfigure: () => void
}

/**
 * Shell do display desktop: providers + scoping de workspace + manutenção.
 * Atalho mestre: Ctrl+Alt+K abre o menu de manutenção.
 */
export function DisplayShell({ config, onReconfigure }: DisplayShellProps) {
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)

  /* Scope TV data to the device's workspace (also used by tv services) */
  useEffect(() => {
    workspaceStore.set(config.workspace, false, [config.workspace.id])
    console.log('[LabHub TV] Workspace scope:', config.workspace.id, '|', config.workspace.name)
  }, [config.workspace])

  /* Heartbeat: mantém last_seen atualizado no banco */
  useEffect(() => {
    return startHeartbeat(config.deviceId)
  }, [config.deviceId])

  /* Atalho mestre de manutenção */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setMaintenanceOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <ToastProvider>
        <MusicPlayerProvider>
          <MemoryRouter initialEntries={['/display']}>
            <TvDisplay deviceName={config.name} />
          </MemoryRouter>
        </MusicPlayerProvider>
      </ToastProvider>

      {maintenanceOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
          onClick={() => setMaintenanceOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 360, maxWidth: '90vw', borderRadius: 18,
              background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
              padding: '1.5rem', color: '#f1f5f9',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <Settings size={18} color="#94a3b8" />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Manutenção</h3>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#64748b' }}>{config.name}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button style={mainButtonStyle} onClick={openAdminPanel}>
                <ExternalLink size={15} /> Abrir painel de controle
              </button>
              <button
                style={mainButtonStyle}
                onClick={() => {
                  setMaintenanceOpen(false)
                  onReconfigure()
                }}
              >
                <RefreshCw size={15} /> Reconfigurar esta TV
              </button>
              <button
                style={{ ...mainButtonStyle, color: '#fca5a5' }}
                onClick={() => window.desktop?.quit?.()}
              >
                <LogOut size={15} /> Encerrar aplicativo
              </button>
            </div>
            <p style={{ fontSize: '0.68rem', color: '#475569', margin: '1rem 0 0', textAlign: 'center' }}>
              Atalho: Ctrl + Alt + K
            </p>
          </div>
        </div>
      )}
    </>
  )
}

const mainButtonStyle: CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
  padding: '0.7rem 0.9rem', borderRadius: 12,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
  color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
}
