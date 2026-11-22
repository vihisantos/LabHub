import { useEffect, useState, type CSSProperties } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { MemoryRouter } from 'react-router-dom'
import { Settings, RefreshCw, LogOut } from 'lucide-react'
import { ToastProvider } from '../lib/ToastContext'
import { ProgrammingProvider } from '../apps/tv/contexts/ProgrammingContext'
import { ScreenRenderer } from './ScreenRenderer'
import { workspaceStore } from '../core/workspaces/store'
import type { DeviceConfig } from './config'

interface DisplayShellProps {
  config: DeviceConfig
  onReconfigure: () => void
}

/**
 * Shell do display desktop: providers + scoping de workspace + manutenção.
 * Atalho mestre: Ctrl+Alt+K abre o menu de manutenção.
 *
 * A cadeia não usa `window.desktop`: o encerramento usa a API oficial do
 * Tauri 2 e não há watchdog, updates ou painel administrativo na TV.
 */
export function DisplayShell({ config, onReconfigure }: DisplayShellProps) {
  // Log sem deviceId, workspace ou URL — o config completo é dado sensível.
  console.info('[LabHub TV DisplayShell] configuracao carregada:', config?.name ?? 'desconhecida')

  // PROTEÇÃO: Se config for null, mostrar tela de erro
  if (!config) {
    console.error('[LabHub TV DisplayShell] ERRO: config é null!')
    return (
      <div style={{
        width: '100vw', height: '100vh',
        background: '#080a14',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#ef4444', fontFamily: 'system-ui, sans-serif',
        flexDirection: 'column', gap: '1rem',
      }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>LabHub TV</span>
        <span style={{ fontSize: '1rem' }}>Erro de inicialização - reinicie o aplicativo</span>
      </div>
    )
  }

  const [maintenanceOpen, setMaintenanceOpen] = useState(false)

  /* Escopo de workspace estritamente local: a TV institucional usa a
   * identidade criada pela ativação por pendrive. Não há sessão Supabase,
   * não há heartbeat e não há nenhum dado de Chamados nesta cadeia. */
  useEffect(() => {
    const workspace = config.workspace
    if (!workspace?.id) return
    workspaceStore.set(workspace, false, [workspace.id])
    console.info('[LabHub TV] escopo local definido')
  }, [config.workspace])

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

  const closeWindow = async () => {
    try {
      await getCurrentWindow().close()
    } catch (e) {
      console.warn('[LabHub TV] nao foi possivel encerrar a janela:', e)
    }
  }

  return (
    <>
      <ToastProvider>          {/* Programming context for TV display - local media discovery */}
        <ProgrammingProvider>
          <MemoryRouter initialEntries={['/display']}>
            <ScreenRenderer config={config} />
          </MemoryRouter>
        </ProgrammingProvider>      </ToastProvider>

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
              background: '#ffffff', border: '1px solid rgba(15,23,42,0.10)',
              padding: '1.5rem', color: '#0f172a', boxShadow: '0 24px 60px rgba(15,23,42,0.18)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <Settings size={18} color="#475569" />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Manutenção</h3>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#64748b' }}>{config.name}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                style={{ ...mainButtonStyle, color: '#b91c1c' }}
                onClick={() => void closeWindow()}
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
  background: '#f8fafc', border: '1px solid rgba(15,23,42,0.10)',
  color: '#0f172a', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
}
