import { Link, Outlet, useLocation } from 'react-router-dom'
import { useRef } from 'react'
import { StockBottomNav } from '../components/StockBottomNav'
import { useTheme } from '../../../lib/ThemeContext'
import { icons } from '../../../lib/icons'

const mainRoutes = new Set(['/stock', '/stock/movements', '/stock/kits'])

function isDetailPage(pathname: string) {
  return !mainRoutes.has(pathname)
}

function getPageTitle(pathname: string): string {
  if (pathname === '/stock' || pathname.startsWith('/stock/items/')) return 'Estoque'
  if (pathname.startsWith('/stock/movements')) return 'Movimentações'
  if (pathname.startsWith('/stock/kits')) return 'Kits'
  return 'Estoque'
}

function getBackPath(pathname: string): string {
  if (pathname.startsWith('/stock/items/')) return '/stock'
  if (pathname.startsWith('/stock/kits/')) return '/stock/kits'
  return '/stock'
}

export function StockLayout() {
  const location = useLocation()
  const title = getPageTitle(location.pathname)
  const detail = isDetailPage(location.pathname)
  const mainRef = useRef<HTMLDivElement>(null)
  const { theme, toggle } = useTheme()

  function scrollToTop() {
    if (mainRef.current && mainRef.current.scrollTop > 0) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-fg">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/80 px-3 py-2.5 backdrop-blur-xl">
        {detail ? (
          <Link
            to={getBackPath(location.pathname)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg"
            aria-label="Voltar"
            viewTransition
          >
            <icons.ui.back size={18} />
          </Link>
        ) : (
          <Link
            to="/"
            viewTransition
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg"
            aria-label="Início"
          >
            <icons.ui.home size={18} />
          </Link>
        )}

        <button
          type="button"
          onClick={scrollToTop}
          className="flex items-center gap-2 overflow-hidden text-left"
        >
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold text-fg leading-tight">{title}</h1>
            <p className="text-[10px] text-fg-muted leading-tight">Estoque {detail ? '' : '· ⌂ Início'}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={toggle}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg"
          aria-label={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <icons.ui.sun size={16} /> : <icons.ui.moon size={16} />}
        </button>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto pb-24" style={{ paddingBottom: 'max(6rem, calc(3.5rem + env(safe-area-inset-bottom)))' }}>
        <div key={location.pathname} className="mx-auto max-w-lg animate-[slide-up_0.25s_ease-out] p-4">
          <Outlet />
        </div>
      </main>

      <StockBottomNav />
    </div>
  )
}
