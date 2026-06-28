import { Link, Outlet, useLocation } from 'react-router-dom'
import { useRef } from 'react'
import { StockBottomNav } from '../components/StockBottomNav'
import { useTheme } from '../../../lib/ThemeContext'
import { useSwipeBack } from '../../pcare/hooks/useSwipeBack'
import { icons } from '../../../lib/icons'

const mainRoutes = new Set(['/stock', '/stock/items', '/stock/movements', '/stock/kits'])

function isDetailPage(pathname: string) {
  return !mainRoutes.has(pathname)
}

function getPageTitle(pathname: string): string {
  if (pathname === '/stock') return 'Dashboard'
  if (pathname === '/stock/items' || pathname.startsWith('/stock/items/')) return 'Estoque'
  if (pathname.startsWith('/stock/movements')) return 'Movimentações'
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
    <div className="flex min-h-dvh flex-col bg-surface text-fg">
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

        <button
          type="button"
          onClick={toggle}
          className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
          aria-label={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <icons.ui.sun size={18} /> : <icons.ui.moon size={18} />}
        </button>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto pb-24" style={{ paddingBottom: 'max(6rem, calc(3.5rem + env(safe-area-inset-bottom)))' }}>
        <div key={location.pathname} className="mx-auto max-w-lg page-transition p-4">
          <Outlet />
        </div>
      </main>

      <StockBottomNav />
    </div>
  )
}
