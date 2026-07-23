import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTheme } from '../../../lib/ThemeContext'
import { useOnlineSync } from '../../../lib/useOnlineSync'
import { icons } from '../../../lib/icons'

function getPageTitle(pathname: string): string {
  if (pathname === '/chamados' || pathname.startsWith('/chamados/dashboard')) return 'Dashboard'
  if (pathname.startsWith('/chamados/tickets')) return 'Chamados'
  if (pathname.startsWith('/chamados/rooms')) return 'Salas'
  if (pathname.startsWith('/chamados/settings')) return 'Configurações'
  return 'Chamados'
}

function isDetailPage(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  return segments.length > 2
}

const TABS = [
  { path: '/chamados', icon: icons.nav.dashboard, label: 'Dashboard' },
  { path: '/chamados/tickets', icon: icons.ui.inbox, label: 'Chamados' },
  { path: '/chamados/rooms', icon: icons.ui.home, label: 'Salas' },
  { path: '/chamados/settings', icon: icons.nav.settings, label: 'Config' },
]

function ChamadosPageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto max-w-lg"
    >
      {children}
    </motion.div>
  )
}

export function ChamadosLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const title = getPageTitle(location.pathname)
  const detail = isDetailPage(location.pathname)
  const mainRef = useRef<HTMLDivElement>(null)
  const { theme, toggle } = useTheme()

  useOnlineSync()

  const activeTab = TABS.findIndex((t) => {
    if (t.path === '/chamados') return location.pathname === '/chamados'
    return location.pathname.startsWith(t.path)
  })

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-fg">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/80 px-4 py-3.5 backdrop-blur-xl">
        {detail && (
          <Link
            to="/chamados"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
            aria-label="Voltar"
            viewTransition
          >
            <icons.ui.back size={20} />
          </Link>
        )}

        <div className="flex flex-col">
          <h1 className="text-[17px] font-semibold tracking-tight text-fg leading-tight">{title}</h1>
          <p className="text-[11px] font-medium leading-tight bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">Chamados</p>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={toggle}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
            aria-label="Alternar tema"
          >
            {theme === 'light' ? <icons.ui.moon size={18} /> : <icons.ui.sun size={18} />}
          </button>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto pb-24">
        <AnimatePresence mode="wait" initial={false}>
          <ChamadosPageTransition key={location.pathname}>
            <div className="p-4">
              <Outlet />
            </div>
          </ChamadosPageTransition>
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-lg items-center justify-around py-2">
          {TABS.map((tab, i) => (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                activeTab === i ? 'text-amber-500' : 'text-fg-muted hover:text-fg'
              }`}
            >
              <tab.icon size={20} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
