import { useEffect, useState, type CSSProperties } from 'react'
import { loadConfig, saveConfig, type DeviceConfig } from './config'
import { UsbAuthScreen, type UsbAuthReason } from './components/UsbAuthScreen'
import { DisplayShell } from './DisplayShell'
import { KioskErrorBoundary } from './KioskErrorBoundary'
import {
  classifyLocalAuthFailure,
  getLocalUsbAuth,
  isLocalUsbAuthValid,
} from './usbAuthApi'
import type { Workspace } from '../core/workspaces/types'

type BootState =
  | { phase: 'loading' }
  | { phase: 'usb-auth'; reason: UsbAuthReason }
  | { phase: 'ready'; config: DeviceConfig }
  | { phase: 'error'; message: string }

/**
 * Workspace local usado somente depois de uma ativação USB real. Não é uma
 * identidade remota nem um dado fictício de sucesso: o id deriva do deviceId
 * gravado pelo backend e serve apenas para isolar a configuração na TV.
 */
function createLocalWorkspace(deviceId: string): Workspace {
  const now = Date.now()
  return {
    id: `local-${deviceId}`,
    name: 'LabHub TV Local',
    slug: 'local',
    location: '%APPDATA%\\LabHub TV',
    spreadsheet_url: '',
    lab_count: 1,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  }
}

function hasValidConfig(value: DeviceConfig | null): value is DeviceConfig {
  return !!value?.deviceId && !!value?.workspace?.id
}

export function DesktopApp() {
  const [state, setState] = useState<BootState>({ phase: 'loading' })
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let active = true

    void (async () => {
      setState({ phase: 'loading' })
      try {
        const authValid = await isLocalUsbAuthValid()
        if (!active) return

        if (!authValid) {
          // get_local_usb_auth discrimina ausência, expiração e corrupção sem
          // apagar nada. Erros de leitura viram estado recuperável.
          try {
            await getLocalUsbAuth()
            if (active) setState({ phase: 'usb-auth', reason: 'invalid' })
          } catch (error) {
            if (!active) return
            const failure = classifyLocalAuthFailure(error)
            if (failure.kind === 'transient') {
              setState({ phase: 'error', message: failure.message })
              return
            }
            const reason: UsbAuthReason =
              failure.kind === 'expired'
                ? 'expired'
                : failure.kind === 'invalid'
                  ? 'invalid'
                  : 'first-run'
            setState({ phase: 'usb-auth', reason })
          }
          return
        }

        const stored = await loadConfig()
        if (!active) return

        if (hasValidConfig(stored)) {
          setState({ phase: 'ready', config: stored })
          return
        }

        // Autorização válida, mas configuração ausente/inválida: mantém a
        // autenticação e oferece reativação, nunca uma página estática.
        setState({ phase: 'usb-auth', reason: 'corrupt' })
      } catch {
        if (active) {
          setState({
            phase: 'error',
            message:
              'Não foi possível ler o estado local do LabHub TV. Verifique as permissões e tente novamente.',
          })
        }
      }
    })()

    return () => {
      active = false
    }
  }, [retryToken])

  const handleUsbComplete = async () => {
    // Confirma a gravação da autenticação antes de abrir a interface.
    const auth = await getLocalUsbAuth()
    const existing = await loadConfig()
    let config: DeviceConfig

    if (hasValidConfig(existing)) {
      config = existing
    } else {
      const created: DeviceConfig = {
        deviceId: auth.deviceId,
        name: 'LabHub TV Local',
        workspace: createLocalWorkspace(auth.deviceId),
        createdAt: new Date().toISOString(),
        screenApp: 'tv',
      }
      await saveConfig(created)
      const verified = await loadConfig()
      if (!hasValidConfig(verified)) {
        throw new Error('Configuração local não foi confirmada após a gravação')
      }
      config = verified
    }

    setState({ phase: 'ready', config })
  }

  if (state.phase === 'loading') {
    return (
      <div data-testid="desktop-loading" style={darkCenteredStyle}>
        <div style={spinnerStyle} />
        <span style={loadingTextStyle}>Preparando o LabHub TV...</span>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div data-testid="desktop-recoverable-error" style={darkCenteredStyle}>
        <span style={brandTextStyle}>LabHub TV</span>
        <span style={errorTextStyle}>{state.message}</span>
        <button
          type="button"
          onClick={() => setRetryToken((value) => value + 1)}
          style={retryButtonStyle}
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (state.phase === 'usb-auth') {
    return (
      <UsbAuthScreen
        reason={state.reason}
        onComplete={handleUsbComplete}
        onError={(message) => {
          // Diagnóstico apenas: a tela de ativação continua interativa.
          console.warn('[LabHub TV] USB:', message)
        }}
      />
    )
  }

  if (state.phase === 'ready' && hasValidConfig(state.config)) {
    return (
      <KioskErrorBoundary>
        <DisplayShell
          config={state.config}
          onReconfigure={() => setState({ phase: 'usb-auth', reason: 'reactivation' })}
        />
      </KioskErrorBoundary>
    )
  }

  // Estado inesperado: volta ao fluxo interativo em vez de texto estático.
  return <UsbAuthScreen reason="invalid" onComplete={handleUsbComplete} />
}

const darkCenteredStyle: CSSProperties = {
  width: '100vw',
  height: '100vh',
  position: 'fixed',
  inset: 0,
  zIndex: 20,
  background: '#0B1220',
  color: '#F4F7FB',
  fontFamily: 'system-ui, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1rem',
  padding: '2rem',
  textAlign: 'center',
}

const spinnerStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 14,
  border: '3px solid rgba(76,195,255,0.18)',
  borderTopColor: '#4CC3FF',
  animation: 'spin 0.9s linear infinite',
}

const loadingTextStyle: CSSProperties = { color: '#94A3B8', fontSize: '0.9rem' }
const brandTextStyle: CSSProperties = { fontSize: '1.4rem', fontWeight: 750 }
const errorTextStyle: CSSProperties = { maxWidth: 520, color: '#CBD5E1', fontSize: '0.95rem', lineHeight: 1.6 }

const retryButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 1.25rem',
  borderRadius: 12,
  border: 0,
  background: 'linear-gradient(90deg, #1E6FA8, #4CC3FF)',
  color: '#071426',
  fontWeight: 700,
  cursor: 'pointer',
}

/** Helper usado apenas pelo modo dev/preview; não participa do boot de produção. */
export function devScreenApp(persisted?: string | null): string {
  const envScreen =
    typeof import.meta.env.VITE_DEV_SCREEN_APP === 'string'
      ? import.meta.env.VITE_DEV_SCREEN_APP
      : undefined
  const candidate = envScreen?.trim() || persisted?.trim()

  if (candidate === 'tv' || candidate === 'tv-ambiente') return candidate
  return 'tv-ambiente'
}
