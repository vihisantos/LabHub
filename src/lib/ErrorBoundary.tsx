import { Component, type ReactNode, type ErrorInfo } from 'react'
import { icons } from './icons'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20">
          <icons.ui.alertTriangle size={40} />
          <p className="text-sm font-medium text-slate-300">Algo deu errado</p>
          <p className="text-xs text-slate-500 text-center max-w-xs">{this.state.error?.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
