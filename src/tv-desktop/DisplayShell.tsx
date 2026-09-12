import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { Settings, RefreshCw, ExternalLink, LogOut, Download } from 'lucide-react'
import { ToastProvider } from '../lib/ToastContext'
import { MusicPlayerProvider } from '../apps/tv/contexts/MusicPlayerContext'
import { ScreenRenderer } from './ScreenRenderer'
import { workspaceStore } from '../core/workspaces/store'
import { startHeartbeat, openAdminPanel } from './deviceService'
import type { UpdateStatus } from './desktop.d'
import { SCREEN_APP_OPTIONS, resolveScreenApp, screenAppLabel, saveConfig, type DeviceConfig, type ScreenAppId } from './config'

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
  const [appVersion, setAppVersion] = useState('')
  const [updPhase, setUpdPhase] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'uptodate' | 'error'>('idle')
  const [updVersion, setUpdVersion] = useState('')
  const [updPercent, setUpdPercent] = useState(0)
  const [updMessage, setUpdMessage] = useState('')
  const availableRef = useRef('')
  const [screenApp, setScreenApp] = useState<ScreenAppId>(() => resolveScreenApp(config))

  /* Troca de módulo de exibição: persiste e re-renderiza a tela na hora */
  const changeScreenApp = async (id: ScreenAppId) => {
    setScreenApp(id)
    await saveConfig({ ...config, screenApp: id }).catch(() => {})
  }

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

  /* Auto-update: assina o fluxo do main e checa na inicialização */
  useEffect(() => {
    const api = window.desktop?.updates
    if (!api) return
    api.getVersion().then(setAppVersion).catch(() => {})

    const off = api.onStatus((status: UpdateStatus) => {
      switch (status.type) {
        case 'checking':
          setUpdPhase('checking'); break
        case 'available':
          availableRef.current = status.version || ''
          setUpdVersion(status.version || ''); setUpdPhase('available'); break
        case 'not-available':
          setUpdPhase('uptodate'); break
        case 'progress':
          setUpdVersion(availableRef.current)
          if (status.percent != null) setUpdPercent(status.percent)
          setUpdPhase('downloading'); break
        case 'downloaded':
          availableRef.current = status.version || availableRef.current
          setUpdVersion(availableRef.current); setUpdPhase('ready'); break
        case 'error':
          setUpdMessage(status.message || 'Falha na atualização'); setUpdPhase('error'); break
      }
    })

    // Checagem automática após o display estabilizar (~20s)
    const timer = setTimeout(() => { api.check().catch(() => {}) }, 20000)
    return () => { off(); clearTimeout(timer) }
  }, [])

  const requestUpdateCheck = () => {
    setUpdPhase('checking')
    window.desktop?.updates?.check().catch(() => setUpdPhase('idle'))
  }
  const requestUpdateDownload = () => {
    window.desktop?.updates?.download().catch(() => setUpdPhase('available'))
  }
  const requestUpdateInstall = () => {
    window.desktop?.updates?.install()
  }

  return (
    <>
      <ToastProvider>
        <MusicPlayerProvider>
          <MemoryRouter initialEntries={['/display']}>
            <ScreenRenderer config={{ ...config, screenApp }} />
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

            <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '0 0 0.35rem' }}>
                App de exibição — atual: {screenAppLabel(screenApp)}
              </p>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {SCREEN_APP_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    style={{
                      ...mainButtonStyle,
                      padding: '0.45rem 0.6rem',
                      fontSize: '0.75rem',
                      justifyContent: 'center',
                      background: screenApp === opt.id
                        ? 'rgba(239,68,68,0.18)'
                        : 'rgba(255,255,255,0.05)',
                      borderColor: screenApp === opt.id
                        ? 'rgba(239,68,68,0.5)'
                        : 'rgba(255,255,255,0.08)',
                      color: screenApp === opt.id ? '#fecaca' : '#e2e8f0',
                    }}
                    title={opt.description}
                    onClick={() => changeScreenApp(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {window.desktop?.updates && (
              <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginBottom: '0.4rem' }}>
                  <span>Versão instalada</span>
                  <span>v{appVersion || '…'}</span>
                </div>
                {updPhase === 'available' && (
                  <p style={{ fontSize: '0.75rem', color: '#fbbf24', margin: '0 0 0.4rem' }}>
                    Nova versão disponível: v{updVersion}
                  </p>
                )}
                {updPhase === 'downloading' && (
                  <p style={{ fontSize: '0.75rem', color: '#60a5fa', margin: '0 0 0.4rem' }}>
                    Baixando atualização… {updPercent}%
                  </p>
                )}
                {updPhase === 'uptodate' && (
                  <p style={{ fontSize: '0.75rem', color: '#34d399', margin: '0 0 0.4rem' }}>
                    Você já está na versão mais recente
                  </p>
                )}
                {updPhase === 'error' && (
                  <p style={{ fontSize: '0.75rem', color: '#fca5a5', margin: '0 0 0.4rem' }}>{updMessage}</p>
                )}
                <button
                  style={mainButtonStyle}
                  disabled={updPhase === 'downloading'}
                  onClick={() => {
                    if (updPhase === 'ready') return requestUpdateInstall()
                    if (updPhase === 'available') return requestUpdateDownload()
                    return requestUpdateCheck()
                  }}
                >
                  <Download size={15} />
                  {updPhase === 'checking' ? 'Verificando…'
                    : updPhase === 'downloading' ? 'Baixando…'
                    : updPhase === 'available' ? `Baixar atualização v${updVersion}`
                    : updPhase === 'ready' ? 'Reiniciar e instalar'
                    : 'Verificar atualizações'}
                </button>
              </div>
            )}

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
