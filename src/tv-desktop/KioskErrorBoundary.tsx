import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  recoverMs?: number
  /** Callback opcional para testes/hosts que queiram observar a recuperação. */
  onReloadRenderer?: () => void
}

interface State {
  hasError: boolean
  failures: number[]
}

const FAILURE_WINDOW_MS = 120_000
const RELOAD_THRESHOLD = 3
const RELOAD_COOLDOWN_MS = 60_000
const RELOAD_KEY = 'labhub-tv-last-reload'

/**
 * Recuperação de erro de renderização com critérios objetivos:
 *  - erros idênticos repetidos não reiniciam a TV (evita laço determinístico);
 *  - reload somente após 3 falhas distintas em 2 minutos, no máximo 1 por minuto;
 *  - sem bridge `window.desktop`: usa a API web padrão e sempre agenda a
 *    liberação do fallback, mesmo quando o reload não for permitido.
 */
export class KioskErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, failures: [] }
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastSignature = ''

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[KioskErrorBoundary]', error, info)
    const now = Date.now()
    const signature = `${error.message}|${info.componentStack ?? ''}`
    const recent = this.state.failures.filter((t) => now - t < FAILURE_WINDOW_MS)
    const repeated = signature === this.lastSignature
    this.lastSignature = signature

    const failures = repeated ? recent : [...recent, now]
    this.setState({ failures })

    if (!repeated && failures.length >= RELOAD_THRESHOLD) {
      const lastReload = this.readLastReload()
      if (now - lastReload >= RELOAD_COOLDOWN_MS) {
        this.writeLastReload(now)
        this.props.onReloadRenderer?.()
        window.location.reload()
        return
      }
      console.warn('[KioskErrorBoundary] reload em resfriamento — mantendo tela de recuperacao')
    }

    this.scheduleRecovery()
  }

  private readLastReload(): number {
    try {
      return Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    } catch {
      return 0
    }
  }

  private writeLastReload(at: number): void {
    try {
      sessionStorage.setItem(RELOAD_KEY, String(at))
    } catch {
      /* sessão indisponível: o cooldown não pode ser persistido */
    }
  }

  private scheduleRecovery() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.setState({ hasError: false })
    }, this.props.recoverMs ?? 3000)
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          width: '100vw', height: '100vh', background: '#080a14',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#94a3b8', fontFamily: 'system-ui, sans-serif', flexDirection: 'column', gap: '0.5rem',
        }}>
          <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>LabHub TV</span>
          <span style={{ fontSize: '0.9rem' }}>Recuperando…</span>
        </div>
      )
    }
    return this.props.children
  }
}

export function SlideErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <KioskErrorBoundary recoverMs={0} fallback={null}>
      {children}
    </KioskErrorBoundary>
  )
}
