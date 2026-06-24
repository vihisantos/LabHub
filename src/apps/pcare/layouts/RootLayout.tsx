import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useRef } from 'react'
import { BottomNav } from '../components/BottomNav'
import { OnlineBanner } from '../components/OnlineBanner'
import { useSwipeBack } from '../hooks/useSwipeBack'
import { useTheme } from '../../../lib/ThemeContext'

const mainRoutes = new Set([
  '/pcare', '/pcare/pcs', '/pcare/parts', '/pcare/maintenance',
  '/pcare/reports', '/pcare/checklists', '/pcare/scanner', '/pcare/asset-scanner', '/pcare/settings',
])

function isDetailPage(pathname: string) {
  return !mainRoutes.has(pathname)
}

function getPageTitle(pathname: string): string {
  if (pathname === '/pcare') return 'Dashboard'
  if (pathname.startsWith('/pcare/pcs')) {
    if (pathname.endsWith('/new')) return 'Novo PC'
    if (pathname.endsWith('/edit')) return 'Editar PC'
    if (pathname.match(/\/pcare\/pcs\/[\w-]+$/)) return 'Detalhes do PC'
    return 'PCs'
  }
  if (pathname.startsWith('/pcare/parts')) return 'Estoque'
  if (pathname.startsWith('/pcare/maintenance')) return 'Manutenção'
  if (pathname.startsWith('/pcare/reports')) return 'Relatórios'
  if (pathname.startsWith('/pcare/checklists')) return 'Checklists'
  if (pathname.startsWith('/pcare/scanner')) return 'QR Code'
  if (pathname.startsWith('/pcare/asset-scanner')) return 'Patrimônio'
  if (pathname.startsWith('/pcare/qr')) return 'Gerar QR'
  if (pathname.startsWith('/pcare/settings')) return 'Configurações'
  return 'PCare'
}

function getBackPath(pathname: string): string {
  if (pathname.startsWith('/pcare/pcs')) return '/pcare/pcs'
  if (pathname.startsWith('/pcare/qr')) return '/pcare/pcs'
  if (pathname.startsWith('/pcare/settings')) return '/pcare'
  return '/pcare'
}

export function RootLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const title = getPageTitle(location.pathname)
  const detail = isDetailPage(location.pathname)
  const mainRef = useRef<HTMLDivElement>(null)

  useSwipeBack()
  const { theme, toggle } = useTheme()

  function scrollToTop() {
    if (mainRef.current && mainRef.current.scrollTop > 0) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950">
      <OnlineBanner />

      <header className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-2.5 backdrop-blur-xl">
        {detail ? (
          <button
            type="button"
            onClick={() => navigate(getBackPath(location.pathname))}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            ←
          </button>
        ) : (
          <Link
            to="/"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            title="Início"
          >
            ⌂
          </Link>
        )}

        <button
          type="button"
          onClick={scrollToTop}
          className="flex items-center gap-2 overflow-hidden text-left"
        >
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold text-white leading-tight">{title}</h1>
            <p className="text-[10px] text-slate-500 leading-tight">PCare {detail ? '' : '· ⌂ Início'}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={toggle}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto pb-24">
        <div key={location.pathname} className="animate-[fade-in-up_0.3s_ease-out] p-4">
          <Outlet />
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
