import { Link, Outlet, useLocation } from 'react-router-dom'
import { useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { StockBottomNav } from '../components/StockBottomNav'
import { useTheme } from '../../../lib/ThemeContext'
import { useSwipeBack } from '../../pcare/hooks/useSwipeBack'
import { useKioskMode, KioskProvider, KioskExitPill } from '../../../lib/useKioskMode'
import { icons } from '../../../lib/icons'

const PREFIXES = ['/stock', '/general-stock'] as const

function p(pathname: string, suffix: string) {
  return PREFIXES.some((pre) => pathname === pre + suffix || pathname.startsWith(pre + suffix + '/'))
}

function m(pathname: string) {
  return PREFIXES.some((pre) => pathname === pre)
}

function mainRoute(pathname: string) {
  return m(pathname) || p(pathname, '/items') || p(pathname, '/movements') || p(pathname, '/kits') || p(pathname, '/entry-exit')
}

function isDetailPage(pathname: string) {
  return !mainRoute(pathname)
}

function prefix(pathname: string) {
  return PREFIXES.find((pre) => pathname.startsWith(pre)) || '/stock'
}

function getPageTitle(pathname: string): string {
  if (m(pathname)) return 'Dashboard'
  if (p(pathname, '/items')) return 'Estoque'
  if (p(pathname, '/movements')) return 'Movimentações'
  if (p(pathname, '/entry-exit')) return 'Entrada/Saída'
  if (p(pathname, '/kits')) return 'Kits'
  return 'Estoque'
}

function getBackPath(pathname: string): string {
  const pre = prefix(pathname)
  if (p(pathname, '/items')) return pre + '/items'
  if (p(pathname, '/kits')) return pre + '/kits'
  return pre
}

export function StockLayout() {
  const location = useLocation()
  const title = getPageTitle(location.pathname)
  const detail = isDetailPage(location.pathname)
  const mainRef = useRef<HTMLDivElement>(null)
  const { theme, toggle } = useTheme()

  useSwipeBack()

  function scrollToTop() {
    if (mainRef.current && mainRef.current.scrollTop > 0) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <KioskProvider>
      <StockLayoutInner
        location={location}
        title={title}
        detail={detail}
        mainRef={mainRef}
        theme={theme}
        toggle={toggle}
        scrollToTop={scrollToTop}
      />
    </KioskProvider>
  )
}

function StockLayoutInner({
  location, title, detail, mainRef, theme, toggle, scrollToTop,
}: {
  location: ReturnType<typeof useLocation>
  title: string
  detail: boolean
  mainRef: React.RefObject<HTMLDivElement | null>
  theme: ReturnType<typeof useTheme>['theme']
  toggle: ReturnType<typeof useTheme>['toggle']
  scrollToTop: () => void
}) {
  const { kioskMode, enterKiosk } = useKioskMode()

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-fg overflow-x-hidden">
      {!kioskMode && (
        <header className="sticky top-0 z-30 flex items-center gap-2 bg-surface px-4 py-3.5 shadow-sm shadow-black/5 dark:shadow-black/20">
          {detail ? (
            <Link
              to={getBackPath(location.pathname)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
              aria-label="Voltar"
              viewTransition
            >
              <icons.ui.back size={20} />
            </Link>
          ) : (
            <Link
              to="/"
              viewTransition
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
              aria-label="Início"
            >
              <icons.ui.home size={20} />
            </Link>
          )}

          <button
            type="button"
            onClick={scrollToTop}
            className="flex items-center gap-2 overflow-hidden text-left"
          >
            <div className="flex flex-col">
              <h1 className="text-[17px] font-semibold tracking-tight text-fg leading-tight">{title}</h1>
              <p className="text-[11px] text-fg-muted leading-tight">Estoque {detail ? '' : '· ⌂ Início'}</p>
            </div>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={enterKiosk}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
              aria-label="Modo quiosque"
              title="Modo quiosque"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 15V9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6"/></svg>
            </button>
            <button
              type="button"
              onClick={toggle}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
              aria-label="Alternar tema"
              title={theme === 'dark' ? 'Escuro → Suave' : theme === 'dim' ? 'Suave → Claro' : 'Claro → Escuro'}
            >
              {theme === 'light' ? <icons.ui.moon size={18} /> : <icons.ui.sun size={18} />}
            </button>
          </div>
        </header>
      )}

      <main ref={mainRef} className={`flex-1 overflow-y-auto ${kioskMode ? 'pb-4' : 'pb-28'}`} style={{ paddingBottom: kioskMode ? '1rem' : 'max(7rem, calc(4rem + env(safe-area-inset-bottom)))' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto max-w-lg p-4"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {!kioskMode && <StockBottomNav />}
      {kioskMode && <KioskExitPill />}
    </div>
  )
}
