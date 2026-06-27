import { appRegistry } from '../appRegistry'
import { useTheme } from '../lib/ThemeContext'
import { useNavigateWithTransition } from '../lib/useNavigateWithTransition'
import { icons } from '../lib/icons'

export function Launcher() {
  const navigate = useNavigateWithTransition()
  const { theme, toggle } = useTheme()

  return (
    <div className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-neutral-950 text-white">
      {/* Animated wallpaper blobs */}
      <div className="absolute inset-0">
        <div
          className="wallpaper-blob -left-32 -top-32 h-[550px] w-[550px] bg-cyan-500/25"
          style={{ animation: 'blob-float 20s ease-in-out infinite' }}
        />
        <div
          className="wallpaper-blob -bottom-40 -right-32 h-[500px] w-[500px] bg-blue-500/20"
          style={{ animation: 'blob-float-2 25s ease-in-out infinite' }}
        />
        <div
          className="wallpaper-blob left-1/3 top-1/2 h-[400px] w-[400px] bg-violet-500/15"
          style={{ animation: 'blob-float-3 18s ease-in-out infinite' }}
        />
        <div
          className="wallpaper-blob -bottom-20 left-1/4 h-[300px] w-[300px] bg-emerald-500/15"
          style={{ animation: 'blob-float-4 22s ease-in-out infinite' }}
        />
        <div
          className="wallpaper-blob -right-20 top-1/4 h-[350px] w-[350px] bg-amber-500/12"
          style={{ animation: 'blob-float-5 28s ease-in-out infinite' }}
        />
        <div
          className="wallpaper-blob left-2/3 top-1/3 h-[250px] w-[250px] bg-rose-500/12"
          style={{ animation: 'blob-float-6 16s ease-in-out infinite' }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex w-full flex-col items-center px-4 pb-6 pt-12">
        <button
          type="button"
          onClick={toggle}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-sm text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <icons.ui.sun size={16} /> : <icons.ui.moon size={16} />}
        </button>
        <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 ring-1 ring-cyan-500/30 backdrop-blur-sm">
          <icons.ui.flaskConical size={28} />
        </div>
        <h1 className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-3xl font-bold text-transparent">
          Lab Hub
        </h1>
        <p className="mt-1 text-sm text-slate-500">Seus aplicativos</p>
      </header>

      {/* Apps */}
      <main className="relative z-10 flex w-full max-w-md flex-1 flex-col gap-3 px-5 pb-8">
        <div className="grid grid-cols-2 gap-3">
          {appRegistry.map((app, i) => (
            <button
              key={app.id}
              type="button"
              onClick={() => navigate(app.route)}
              style={{ animationDelay: `${i * 100}ms` }}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-700/50 bg-slate-800/60 p-5 text-center backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-600 hover:bg-slate-800/80 hover:shadow-xl hover:shadow-slate-900/50 animate-[fade-in-up_0.5s_ease-out_both]"
            >
              <span
                className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl transition-shadow duration-300 group-hover:animate-[glow-pulse_2s_ease-in-out_infinite]"
                style={{
                  backgroundColor: app.color + '15',
                  boxShadow: `0 0 0 0 ${app.color}20`,
                }}
              >
                  <app.icon size={32} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-white">{app.name}</h2>
                <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{app.description}</p>
              </div>
            </button>
          ))}

          {/* Placeholder for future apps */}
          {appRegistry.length > 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-700/30 p-5 opacity-40">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl text-slate-600">
                +
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-600">Em breve</h2>
                <p className="mt-0.5 text-xs text-slate-700">Novo app</p>
              </div>
            </div>
          )}
        </div>

        {appRegistry.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <span className="text-5xl text-slate-700">+</span>
            <p className="text-sm text-slate-500">Nenhum app instalado ainda.</p>
            <p className="text-xs text-slate-600">Seus aplicativos aparecerão aqui</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 pb-6 text-center">
        <p className="text-[10px] text-slate-700">Lab Hub v1.0</p>
      </footer>
    </div>
  )
}
