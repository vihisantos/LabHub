import { Link, Outlet, useLocation } from 'react-router-dom'
import { useRef, useState, useMemo } from 'react'
import { BottomNav } from '../components/BottomNav'
import { OnlineBanner } from '../components/OnlineBanner'
import { SyncStatusBadge } from '../components/SyncStatusBadge'
import { ToastContainer } from '../components/ToastContainer'
import { useSwipeBack } from '../hooks/useSwipeBack'
import { useSyncToasts } from '../hooks/useSyncToasts'
import { useOnlineSync } from '../hooks/useOnlineSync'
import { useTheme } from '../../../lib/ThemeContext'
import { useNavigateWithTransition } from '../../../lib/useNavigateWithTransition'
import { useFocusMode, FocusModeProvider } from '../hooks/useFocusMode'
import { useKioskMode, KioskProvider, KioskExitPill } from '../../../lib/useKioskMode'
import { useActiveLab } from '../../../lib/useLabContext'
import { usePCs } from '../hooks/usePCs'
import { AnimatePresence, motion } from 'framer-motion'
import { icons } from '../../../lib/icons'

const mainRoutes = new Set([
  '/pcare', '/pcare/pcs', '/pcare/parts', '/pcare/maintenance',
  '/pcare/reports', '/pcare/checklists', '/pcare/settings',
  '/pcare/parts/consolidado',
])

function isDetailPage(pathname: string) {
  return !mainRoutes.has(pathname)
}

function getPageTitle(pathname: string): string {
  if (pathname === '/pcare') return 'Dashboard'
  if (pathname.startsWith('/pcare/pcs')) {
    if (pathname.endsWith('/edit')) return 'Editar PC'
    if (pathname.match(/\/pcare\/pcs\/[\w-]+$/)) return 'Detalhes do PC'
    return 'PCs'
  }
  if (pathname.startsWith('/pcare/parts/consolidado')) return 'Consolidado'
  if (pathname.startsWith('/pcare/parts')) return 'Estoque'
  if (pathname.startsWith('/pcare/maintenance')) return 'Manutenção'
  if (pathname.startsWith('/pcare/reports')) return 'Relatórios'
  if (pathname.startsWith('/pcare/checklists')) return 'Checklists'
  if (pathname.startsWith('/pcare/qr')) return 'QR Code'
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
  const navigate = useNavigateWithTransition()
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
    <FocusModeProvider>
      <KioskProvider>
        <RootLayoutInner
          location={location}
          navigate={navigate}
          title={title}
          detail={detail}
          theme={theme}
          toggle={toggle}
          mainRef={mainRef}
          scrollToTop={scrollToTop}
        />
      </KioskProvider>
    </FocusModeProvider>
  )
}

function RootLayoutInner({
  location, navigate, title, detail, theme, toggle, mainRef, scrollToTop,
}: {
  location: ReturnType<typeof useLocation>
  navigate: ReturnType<typeof useNavigateWithTransition>
  title: string
  detail: boolean
  theme: ReturnType<typeof useTheme>['theme']
  toggle: ReturnType<typeof useTheme>['toggle']
  mainRef: React.RefObject<HTMLDivElement | null>
  scrollToTop: () => void
}) {
  const { focusMode, toggleFocusMode } = useFocusMode()
  const { kioskMode, enterKiosk } = useKioskMode()
  const { activeLab, setActiveLab } = useActiveLab()
  const { pcs } = usePCs()
  const labs = useMemo(() => {
    const unique = new Set(pcs.map((p) => p.labName))
    return Array.from(unique).sort()
  }, [pcs])
  const [showLabPicker, setShowLabPicker] = useState(false)
  useSyncToasts()

  return (
    <div className="flex h-screen flex-col bg-surface overflow-x-hidden">
      <OnlineBanner />

      {!kioskMode && (
        <header className="flex items-center gap-2 border-b border-line bg-card/80 px-3 py-2.5 backdrop-blur-xl">
          {detail ? (
            <button
              type="button"
              onClick={() => navigate(getBackPath(location.pathname))}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg"
              aria-label="Voltar"
            >
              <icons.ui.back size={18} />
            </button>
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
              <p className="text-[10px] text-fg-muted leading-tight">PCare {detail ? '' : '· ⌂ Início'}</p>
            </div>
          </button>

          {labs.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLabPicker((v) => !v)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-fg-muted transition-colors hover:bg-input hover:text-fg"
              >
                <icons.ui.flaskConical size={12} />
                <span>{activeLab || 'Todos'}</span>
                <icons.ui.chevronDown size={10} />
              </button>
              {showLabPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLabPicker(false)} />
                  <div className="absolute left-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-xl shadow-black/30 animate-[fade-in-up_0.15s_ease-out]">
                    <button
                      type="button"
                      onClick={() => { setActiveLab(null); setShowLabPicker(false) }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-input ${
                        !activeLab ? 'text-cyan-600 dark:text-cyan-400' : 'text-fg-dim'
                      }`}
                    >
                      <icons.ui.check size={12} className={!activeLab ? 'opacity-100' : 'opacity-0'} />
                      Todos os laboratórios
                    </button>
                    {labs.map((lab) => (
                      <button
                        key={lab}
                        type="button"
                        onClick={() => { setActiveLab(lab); setShowLabPicker(false) }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-input ${
                          activeLab === lab ? 'text-cyan-600 dark:text-cyan-400' : 'text-fg-dim'
                        }`}
                      >
                        <icons.ui.check size={12} className={activeLab === lab ? 'opacity-100' : 'opacity-0'} />
                        {lab}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-1">
            <SyncNowButton />
            <SyncStatusBadge />
            <button
              type="button"
              onClick={toggleFocusMode}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-input ${
                focusMode
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'text-fg-dim hover:text-fg'
              }`}
              aria-label={focusMode ? 'Sair do modo foco' : 'Modo foco'}
              title={focusMode ? 'Sair do modo foco' : 'Modo foco'}
            >
              {focusMode ? <icons.ui.focusActive size={16} /> : <icons.ui.focus size={16} />}
            </button>
            <button
              type="button"
              onClick={enterKiosk}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg"
              aria-label="Modo quiosque"
              title="Modo quiosque"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 15V9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6"/></svg>
            </button>
          <button
            type="button"
            onClick={toggle}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg"
            aria-label="Alternar tema"
            title={theme === 'dark' ? 'Escuro → Suave' : theme === 'dim' ? 'Suave → Claro' : 'Claro → Escuro'}
          >
            {theme === 'light' ? <icons.ui.moon size={16} /> : <icons.ui.sun size={16} />}
          </button>
          </div>
        </header>
      )}

      <main ref={mainRef} className={`flex-1 overflow-y-auto ${kioskMode ? 'pb-4' : focusMode ? 'pb-4' : 'pb-24'}`} style={{ paddingBottom: kioskMode ? '1rem' : focusMode ? '1rem' : 'max(6rem, calc(3.5rem + env(safe-area-inset-bottom)))' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="p-4"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {!kioskMode && !focusMode && <BottomNav />}
      {kioskMode && <KioskExitPill />}
      <ToastContainer />
    </div>
  )
}

function SyncNowButton() {
  const { online, syncing, triggerSync } = useOnlineSync()
  if (!online) return null
  return (
    <button
      type="button"
      onClick={triggerSync}
      disabled={syncing}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg disabled:opacity-50"
      aria-label="Sincronizar agora"
      title="Sincronizar agora"
    >
      <icons.ui.refresh size={16} className={syncing ? 'animate-spin' : ''} />
    </button>
  )
}
