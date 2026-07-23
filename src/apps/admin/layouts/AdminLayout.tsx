import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { icons } from '../../../lib/icons'
import { useAuth } from '../../../core/auth/AuthContext'

const NAV_ITEMS = [
  { path: '/admin', label: 'Dashboard', icon: icons.nav.dashboard },
  { path: '/admin/users', label: 'Usuários', icon: icons.ui.user },
  { path: '/admin/workspaces', label: 'Workspaces', icon: icons.ui.home },
  { path: '/admin/settings', label: 'Configurações', icon: icons.nav.settings },
]

export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-fg">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-xl">
        <Link
          to="/"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
          aria-label="Voltar ao LabHub"
        >
          <icons.ui.back size={20} />
        </Link>

        <div className="flex flex-col">
          <h1 className="text-[17px] font-semibold tracking-tight text-fg leading-tight">Administração</h1>
          <p className="text-[11px] font-medium leading-tight bg-gradient-to-r from-slate-500 to-slate-400 bg-clip-text text-transparent">LabHub Admin</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {user && (
            <span className="text-xs text-fg-muted">{user.name?.split(' ')[0]}</span>
          )}
          <button
            type="button"
            onClick={signOut}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-red-500/10 hover:text-red-500"
            title="Sair"
          >
            <icons.ui.close size={18} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="mx-auto max-w-lg p-4">
          <Outlet />
        </div>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-lg items-center justify-around py-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                isActive(item.path) ? 'text-slate-500' : 'text-fg-muted hover:text-fg'
              }`}
            >
              <item.icon size={20} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
