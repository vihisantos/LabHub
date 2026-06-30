import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#ef4444',
          background: 'rgba(239, 68, 68, 0.05)',
          borderRadius: '1rem',
          margin: '1rem',
        }}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
            {this.props.fallback || 'Erro ao carregar componente'}
          </p>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            {this.state.error?.message}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
