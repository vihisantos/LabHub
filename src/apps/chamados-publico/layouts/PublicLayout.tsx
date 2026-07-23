import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { icons } from '../../../lib/icons'

function PublicPageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function PublicLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const isRoot = location.pathname === '/chamados-publico' || location.pathname === '/chamados-publico/'

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-fg">
      {!isRoot && (
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
            aria-label="Voltar"
          >
            <icons.ui.back size={20} />
          </button>
          <h1 className="text-sm font-semibold text-fg">Abrir Chamado</h1>
        </header>
      )}

      <main className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <PublicPageTransition key={location.pathname}>
            <Outlet />
          </PublicPageTransition>
        </AnimatePresence>
      </main>
    </div>
  )
}
