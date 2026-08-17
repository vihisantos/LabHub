import { Link, Outlet, useLocation } from 'react-router-dom'
import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChamadosBottomNav } from '../components/ChamadosBottomNav'
import { useTheme } from '../../../lib/ThemeContext'
import { useOnlineSync } from '../../../lib/useOnlineSync'
import { useFastSync } from '../../../lib/useFastSync'
import { icons } from '../../../lib/icons'
import { isAlertsMuted, setAlertsMuted } from '../services/ticketAlerts'

function getPageTitle(pathname: string): string {
  if (pathname === '/chamados' || pathname.startsWith('/chamados/dashboard')) return 'Dashboard'
  if (pathname.startsWith('/chamados/tickets')) return 'Chamados'
  if (pathname.startsWith('/chamados/qr')) return 'QR Code'
  if (pathname.startsWith('/chamados/reports')) return 'Relatórios'
  if (pathname.startsWith('/chamados/ranking')) return 'Ranking de Salas'
  if (pathname.startsWith('/chamados/settings')) return 'Configurações'
  return 'Chamados'
}

function isDetailPage(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  return segments.length > 2
}

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
  const title = getPageTitle(location.pathname)
  const detail = isDetailPage(location.pathname)
  const mainRef = useRef<HTMLDivElement>(null)
  const { theme, toggle } = useTheme()
  const [alertsMuted, setAlertsMutedState] = useState(() => isAlertsMuted())

  const toggleAlertsMuted = () => {
    const next = !alertsMuted
    setAlertsMuted(next)
    setAlertsMutedState(next)
  }

  useOnlineSync()
  useFastSync(['chamados', 'rooms', 'problem_templates'], 10000)

  function scrollToTop() {
    if (mainRef.current && mainRef.current.scrollTop > 0) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

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

        <button
          type="button"
          onClick={scrollToTop}
          className="flex items-center gap-2 overflow-hidden text-left"
        >
          <div className="flex flex-col">
            <h1 className="text-[17px] font-semibold tracking-tight text-fg leading-tight">{title}</h1>
            <p className="text-[11px] font-medium leading-tight bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">Chamados</p>
          </div>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={toggleAlertsMuted}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-input ${
              alertsMuted ? 'text-fg-muted' : 'text-amber-500'
            }`}
            aria-label={alertsMuted ? 'Ativar alertas sonoros' : 'Silenciar alertas sonoros'}
            title={alertsMuted ? 'Ativar alertas sonoros' : 'Silenciar alertas sonoros'}
          >
            {alertsMuted ? <icons.ui.volumeX size={18} /> : <icons.ui.volume2 size={18} />}
          </button>
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

      <main ref={mainRef} className="flex-1 overflow-y-auto pb-28" style={{ paddingBottom: 'max(7rem, calc(4rem + env(safe-area-inset-bottom)))' }}>
        <AnimatePresence mode="wait" initial={false}>
          <ChamadosPageTransition key={location.pathname}>
            <div className="p-4">
              <Outlet />
            </div>
          </ChamadosPageTransition>
        </AnimatePresence>
      </main>

      <ChamadosBottomNav />
    </div>
  )
}
