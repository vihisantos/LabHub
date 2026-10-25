import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  recoverMs?: number
  onReloadRenderer?: () => void
}

interface State {
  hasError: boolean
  failures: number[]
}

export class KioskErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, failures: [] }
  private timer: ReturnType<typeof setTimeout> | null = null

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[KioskErrorBoundary]', error, info)
    const now = Date.now()
    const failures = [...this.state.failures, now].filter((t) => now - t < 120_000)
    this.setState({ failures })

    if (failures.length >= 3) {
      console.error('[KioskErrorBoundary] 3 falhas em 2 min — solicitando reload do renderer')
      window.desktop?.reloadRenderer?.()
      this.props.onReloadRenderer?.()
      return
    }

    this.timer = setTimeout(() => {
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