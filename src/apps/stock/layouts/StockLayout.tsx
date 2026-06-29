import { Link, Outlet, useLocation } from 'react-router-dom'
import { useRef } from 'react'
import { StockBottomNav } from '../components/StockBottomNav'
import { useTheme } from '../../../lib/ThemeContext'
import { useSwipeBack } from '../../pcare/hooks/useSwipeBack'
import { useKioskMode, KioskProvider, KioskExitPill } from '../../../lib/useKioskMode'
import { icons } from '../../../lib/icons'

const mainRoutes = new Set(['/stock', '/stock/items', '/stock/movements', '/stock/kits', '/stock/entry-exit'])

function isDetailPage(pathname: string) {
  return !mainRoutes.has(pathname)
}

function getPageTitle(pathname: string): string {
  if (pathname === '/stock') return 'Dashboard'
  if (pathname === '/stock/items' || pathname.startsWith('/stock/items/')) return 'Estoque'
  if (pathname.startsWith('/stock/movements')) return 'Movimentações'
  if (pathname.startsWith('/stock/entry-exit')) return 'Entrada/Saída'
  if (pathname.startsWith('/stock/kits')) return 'Kits'
  return 'Estoque'
}

function getBackPath(pathname: string): string {
  if (pathname.startsWith('/stock/items/')) return '/stock/items'
  if (pathname.startsWith('/stock/kits/')) return '/stock/kits'
  return '/stock'
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
    <div className="flex min-h-dvh flex-col bg-surface text-fg">
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
              aria-label={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark' ? <icons.ui.sun size={18} /> : <icons.ui.moon size={18} />}
            </button>
          </div>
        </header>
      )}

      <main ref={mainRef} className={`flex-1 overflow-y-auto ${kioskMode ? 'pb-4' : 'pb-24'}`} style={{ paddingBottom: kioskMode ? '1rem' : 'max(6rem, calc(3.5rem + env(safe-area-inset-bottom)))' }}>
        <div key={location.pathname} className="mx-auto max-w-lg page-transition p-4">
          <Outlet />
        </div>
      </main>

      {!kioskMode && <StockBottomNav />}
      {kioskMode && <KioskExitPill />}
    </div>
  )
}
