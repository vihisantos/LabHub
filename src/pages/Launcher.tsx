import { useEffect } from 'react'
import { appRegistry } from '../appRegistry'
import { useNavigateWithTransition } from '../lib/useNavigateWithTransition'

export function Launcher() {
  const navigate = useNavigateWithTransition()

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    if (mq.matches) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  return (
    <div className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-surface text-fg">
      {/* Animated wallpaper blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="wallpaper-blob -left-32 -top-32 h-[500px] w-[500px] bg-emerald-500/20"
          style={{ animation: 'blob-float 20s ease-in-out infinite' }}
        />
        <div
          className="wallpaper-blob -bottom-40 -right-32 h-[400px] w-[400px] bg-blue-500/15"
          style={{ animation: 'blob-float-2 25s ease-in-out infinite' }}
        />
        <div
          className="wallpaper-blob left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 bg-violet-500/10"
          style={{ animation: 'blob-float-3 18s ease-in-out infinite' }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex w-full flex-col items-center px-4 pb-6 pt-12">
        <img src="/logo-192.png" alt="Lab Hub" className="mb-2 h-16 w-16 rounded-2xl" />
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-blue-400 to-violet-400 bg-[length:200%_200%] bg-clip-text text-transparent animate-gradient">
          Lab Hub
        </h1>
        <p className="mt-1 text-sm text-fg-muted">Seus aplicativos</p>
      </header>

      {/* Apps */}
      <main className="relative z-10 flex w-full max-w-md flex-1 flex-col gap-3 px-5 pb-8">
        <div className="grid grid-cols-2 gap-3">
          {appRegistry.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => navigate(app.route)}
              className="group flex flex-col items-center gap-3 rounded-2xl bg-card p-5 text-center shadow-[var(--shadow-card)] transition-all duration-300 hover:shadow-[var(--shadow-elevated)] btn-interactive"
            >
              <span
                className="flex h-14 w-14 items-center justify-center rounded-xl transition-all duration-300"
                style={{ backgroundColor: app.color + '15', color: app.color }}
              >
                <app.icon size={28} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-fg">{app.name}</h2>
                <p className="mt-0.5 text-xs text-fg-muted leading-relaxed">{app.description}</p>
              </div>
            </button>
          ))}

          {/* Placeholder for future apps */}
          {appRegistry.length > 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line/30 p-5 opacity-30">
              <span className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl text-fg-muted">
                +
              </span>
              <div>
                <h2 className="text-sm font-semibold text-fg-muted">Em breve</h2>
                <p className="mt-0.5 text-xs text-fg-dim">Novo app</p>
              </div>
            </div>
          )}
        </div>

        {appRegistry.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <span className="text-5xl text-fg-muted">+</span>
            <p className="text-sm text-fg-muted">Nenhum app instalado ainda.</p>
            <p className="text-xs text-fg-dim">Seus aplicativos aparecerão aqui</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 flex flex-col items-center gap-2 pb-6">
        <button
          type="button"
          onClick={() => navigate('/roadmap')}
          className="text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          Roadmap
        </button>
        <p className="text-[10px] text-fg-dim">Lab Hub v1.0</p>
      </footer>
    </div>
  )
}
