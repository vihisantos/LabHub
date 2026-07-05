import { useEffect, useState } from 'react'
import { initDB } from './lib/db'
import App from './App'

export default function Boot() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initDB()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao inicializar banco'))
  }, [])

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs text-fg-muted">Inicializando...</p>
        </div>
      </div>
    )
  }

  return <App />
}
