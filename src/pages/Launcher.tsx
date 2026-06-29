import { appRegistry } from '../appRegistry'
import { useNavigateWithTransition } from '../lib/useNavigateWithTransition'
import { icons } from '../lib/icons'

export function Launcher() {
  const navigate = useNavigateWithTransition()

  return (
    <div className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-surface text-fg">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.07] blur-[80px]" />
        <div className="absolute -bottom-40 -right-32 h-[400px] w-[400px] rounded-full bg-blue-500/[0.05] blur-[80px]" />
        <div className="absolute left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-violet-500/[0.04] blur-[80px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex w-full flex-col items-center px-4 pb-6 pt-12">
        <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
          <icons.ui.flaskConical size={28} className="text-emerald-500" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-fg">
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
      <footer className="relative z-10 pb-6 text-center">
        <p className="text-[10px] text-fg-dim">Lab Hub v1.0</p>
      </footer>
    </div>
  )
}
