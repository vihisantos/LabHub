import { useState, useCallback, useMemo } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { icons } from '../../../lib/icons'
import { useAuth } from '../../../core/auth/AuthContext'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { WorkspaceSelectionPage } from '../pages/WorkspaceSelectionPage'

const NAV_ITEMS = [
  { path: '/admin', label: 'Dashboard', icon: icons.nav.dashboard },
  { path: '/admin/users', label: 'Usuários', icon: icons.ui.user },
  { path: '/admin/roles', label: 'Permissões', icon: icons.ui.sliders },
  { path: '/admin/workspaces', label: 'Workspaces', icon: icons.ui.home },
  { path: '/admin/settings', label: 'Configurações', icon: icons.nav.settings },
]

const WS_BG_GRADIENTS = [
  'from-indigo-500/10 via-purple-500/5 to-transparent',
  'from-emerald-500/10 via-teal-500/5 to-transparent',
  'from-amber-500/10 via-orange-500/5 to-transparent',
  'from-rose-500/10 via-pink-500/5 to-transparent',
  'from-cyan-500/10 via-blue-500/5 to-transparent',
  'from-violet-500/10 via-purple-500/5 to-transparent',
]

export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { workspace, workspaces } = useWorkspace()
  // Always start with workspace selection — user MUST choose
  const [showSelector, setShowSelector] = useState(true)

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin'
    return location.pathname.startsWith(path)
  }

  const handleSelect = useCallback(() => {
    setShowSelector(false)
  }, [])

  const handleChangeWorkspace = useCallback(() => {
    setShowSelector(true)
  }, [])

  const gradientIndex = useMemo(() => {
    if (!workspace) return 0
    return workspaces.findIndex((w) => w.id === workspace.id) % WS_BG_GRADIENTS.length
  }, [workspace, workspaces])

  // Show workspace selection page until user picks one
  if (showSelector) {
    return <WorkspaceSelectionPage onSelect={handleSelect} />
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-fg">
      {/* Header with big workspace name */}
      <header className="relative overflow-hidden border-b border-line bg-surface/80 backdrop-blur-xl">
        {/* Gradient background */}
        <div className={`absolute inset-0 bg-gradient-to-br ${WS_BG_GRADIENTS[gradientIndex]} pointer-events-none`} />

        <div className="relative z-10 px-4 pt-4 pb-3">
          {/* Top bar */}
          <div className="flex items-center gap-2 mb-2">
            <Link
              to="/"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-all hover:bg-input hover:text-fg"
              aria-label="Voltar ao LabHub"
            >
              <icons.ui.back size={18} />
            </Link>

            <div className="flex items-center gap-2 ml-auto">
              {user && (
                <button
                  type="button"
                  onClick={() => navigate('/admin/profile')}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-input hover:text-fg"
                >
                  <div
                    className="h-5 w-5 rounded-lg overflow-hidden"
                    style={{ backgroundColor: (user.accent === 'emerald' ? '#10b981' : user.accent === 'cyan' ? '#06b6d4' : user.accent === 'blue' ? '#3b82f6' : '#a855f7') + '20' }}
                  >
                    {user.avatar ? (
                      <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <icons.ui.user size={12} className="p-0.5" style={{ color: user.accent === 'emerald' ? '#10b981' : user.accent === 'cyan' ? '#06b6d4' : user.accent === 'blue' ? '#3b82f6' : '#a855f7' }} />
                    )}
                  </div>
                  {user.name?.split(' ')[0]}
                </button>
              )}
              <button
                type="button"
                onClick={signOut}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-red-500/10 hover:text-red-500"
                title="Sair"
              >
                <icons.ui.close size={16} />
              </button>
            </div>
          </div>

          {/* Big artistic workspace name */}
          <div className="flex items-end justify-between">
            <div className="min-w-0 flex-1">
              {workspace && (
              <motion.button
                onClick={handleChangeWorkspace}
                className="group relative inline-flex items-center gap-3 cursor-pointer"
                whileHover={{ x: 2 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                <div>
                  <motion.h1
                    key={workspace.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-3xl md:text-4xl font-black text-fg tracking-tight leading-tight"
                  >
                    {workspace.name}
                  </motion.h1>
                  {workspace.location && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="text-[11px] text-fg-muted mt-0.5 flex items-center gap-1.5"
                    >
                      <icons.ui.mapPin size={10} />
                      {workspace.location}
                    </motion.p>
                  )}
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-input/50 text-fg-dim opacity-0 group-hover:opacity-100 transition-all group-hover:bg-indigo-500/10 group-hover:text-indigo-500">
                  <icons.ui.chevronDown size={14} />
                </div>
              </motion.button>
              )}
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-[10px] text-fg-dim hidden md:block"
            >
              Admin Panel
            </motion.p>
          </div>
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
                isActive(item.path) ? 'text-indigo-500' : 'text-fg-muted hover:text-fg'
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
