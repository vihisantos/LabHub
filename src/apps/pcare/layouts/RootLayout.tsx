import { Outlet, useLocation } from 'react-router-dom'
import { useRef, useState, useMemo, useEffect } from 'react'
import { BottomNav } from '../components/BottomNav'
import { OnlineBanner } from '../components/OnlineBanner'
import { SyncStatusBadge } from '../components/SyncStatusBadge'
import { OnlineUsersPresence } from '../components/OnlineUsersPresence'
import { ToastContainer } from '../components/ToastContainer'
import { useSwipeBack } from '../hooks/useSwipeBack'
import { useSyncToasts } from '../hooks/useSyncToasts'
import { useOnlineSync } from '../hooks/useOnlineSync'
import { useTheme } from '../../../lib/ThemeContext'
import { useNavigateWithTransition } from '../../../lib/useNavigateWithTransition'
import { useFocusMode, FocusModeProvider } from '../hooks/useFocusMode'
import { useActiveLab } from '../../../lib/useLabContext'
import { usePCs } from '../hooks/usePCs'
import { AnimatePresence, motion } from 'framer-motion'
import { icons } from '../../../lib/icons'
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from '../../../lib/components/ui'
import { PushNotificationButton } from '../../reservalab/components/PushNotificationButton'

const ROUTE_ORDER: Record<string, number> = {
  '/pc-care': 0,
  '/pc-care/assets': 10,
  '/pc-care/pcs': 10,
  '/pc-care/parts': 20,
  '/pc-care/maintenance': 30,
  '/pc-care/reports': 40,
  '/pc-care/checklists': 50,
  '/pc-care/scanner': 60,
  '/pc-care/qr': 65,
  '/pc-care/parts/consolidado': 70,
  '/pc-care/settings': 80,
}

function getBaseRoute(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  // /pc-care/pcs/123/edit → /pc-care/pcs
  if (segments.length > 2) return `/${segments.slice(0, 2).join('/')}`
  return pathname
}

function getSlideDirection(prev: string, curr: string): 'left' | 'right' {
  if (prev === curr) return 'left'

  const prevSegments = prev.split('/').filter(Boolean).length
  const currSegments = curr.split('/').filter(Boolean).length

  // Detail → Main (back): slide right
  if (prevSegments > currSegments) return 'right'
  // Main → Detail (forward): slide left
  if (prevSegments < currSegments) return 'left'

  // Same depth: use route order
  const prevBase = getBaseRoute(prev)
  const currBase = getBaseRoute(curr)
  const prevOrder = ROUTE_ORDER[prevBase] ?? 50
  const currOrder = ROUTE_ORDER[currBase] ?? 50

  return currOrder > prevOrder ? 'left' : 'right'
}

const mainRoutes = new Set([
  '/pc-care', '/pc-care/assets', '/pc-care/pcs', '/pc-care/parts', '/pc-care/maintenance',
  '/pc-care/reports', '/pc-care/checklists', '/pc-care/settings',
  '/pc-care/parts/consolidado',
])

function isDetailPage(pathname: string) {
  return !mainRoutes.has(pathname)
}

function getPageTitle(pathname: string): string {
  if (pathname === '/pc-care') return 'Dashboard'
  if (pathname.startsWith('/pc-care/assets') || pathname.startsWith('/pc-care/pcs')) {
    if (pathname.endsWith('/edit')) return 'Editar ativo'
    if (pathname.endsWith('/new')) return 'Novo ativo'
    if (pathname.match(/\/pc-care\/(assets|pcs)\/[\w-]+$/)) return 'Detalhes do ativo'
    return 'Ativos'
  }
  if (pathname.startsWith('/pc-care/parts/consolidado')) return 'Consolidado'
  if (pathname.startsWith('/pc-care/parts')) return 'Estoque'
  if (pathname.startsWith('/pc-care/maintenance')) return 'Manutenção'
  if (pathname.startsWith('/pc-care/reports')) return 'Relatórios'
  if (pathname.startsWith('/pc-care/checklists')) return 'Checklists'
  if (pathname.startsWith('/pc-care/qr')) return 'QR Code'
  if (pathname.startsWith('/pc-care/settings')) return 'Configurações'
  return 'PC Care'
}

function getBackPath(pathname: string): string {
  if (pathname.startsWith('/pc-care/assets') || pathname.startsWith('/pc-care/pcs')) return '/pc-care/assets'
  if (pathname.startsWith('/pc-care/qr')) return '/pc-care/assets'
  if (pathname.startsWith('/pc-care/settings')) return '/pc-care'
  return '/pc-care'
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
  const { activeLab, setActiveLab } = useActiveLab()
  const { pcs } = usePCs()
  const labs = useMemo(() => {
    const unique = new Set(pcs.map((p) => p.labName))
    return Array.from(unique).sort()
  }, [pcs])
  const [showLabPicker, setShowLabPicker] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right'>('left')
  const prevPathRef = useRef(location.pathname)
  const swipeStartX = useRef(0)
  const swipeStartY = useRef(0)
  const swipeStartTime = useRef(0)

  useEffect(() => {
    const prev = prevPathRef.current
    const curr = location.pathname
    prevPathRef.current = curr
    if (prev !== curr) {
      setDirection(getSlideDirection(prev, curr))
    }
  }, [location.pathname])

  useSyncToasts()

  const MAIN_TABS = ['/pc-care', '/pc-care/pcs', '/pc-care/parts', '/pc-care/maintenance']

  function handleSwipeStart(e: React.TouchEvent) {
    swipeStartX.current = e.touches[0].clientX
    swipeStartY.current = e.touches[0].clientY
    swipeStartTime.current = Date.now()
  }

  function handleSwipeEnd(e: React.TouchEvent) {
    if (detail) return
    if (focusMode) return

    const dx = e.changedTouches[0].clientX - swipeStartX.current
    const dy = e.changedTouches[0].clientY - swipeStartY.current
    const dt = Date.now() - swipeStartTime.current

    // Precisa ser horizontal, rápido e não muito vertical
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || dt > 350) return

    const currentBase = getBaseRoute(location.pathname)
    const currentIndex = MAIN_TABS.indexOf(currentBase)
    if (currentIndex === -1) return

    if (dx < 0 && currentIndex < MAIN_TABS.length - 1) {
      navigate(MAIN_TABS[currentIndex + 1])
    } else if (dx > 0 && currentIndex > 0) {
      navigate(MAIN_TABS[currentIndex - 1])
    }
  }

  return (
    <div
      className="flex h-screen flex-col bg-surface overflow-x-hidden"
      onTouchStart={handleSwipeStart}
      onTouchEnd={handleSwipeEnd}
    >
      <OnlineBanner />

      <header className="flex items-center gap-2 border-b border-line bg-card/80 px-3 py-2.5 backdrop-blur-xl">
          {detail && (
            <button
              type="button"
              onClick={() => navigate(getBackPath(location.pathname))}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg"
              aria-label="Voltar"
            >
              <icons.ui.back size={18} />
            </button>
          )}

          <button
            type="button"
            onClick={scrollToTop}
            className="flex items-center gap-2 overflow-hidden text-left"
          >
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold text-fg leading-tight">{title}</h1>
              <p className="text-[10px] font-medium leading-tight bg-gradient-to-r from-violet-500 to-blue-500 bg-clip-text text-transparent">PC Care</p>
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
                        !activeLab ? 'text-violet-600 dark:text-violet-400' : 'text-fg-dim'
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
                          activeLab === lab ? 'text-violet-600 dark:text-violet-400' : 'text-fg-dim'
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
            <OnlineUsersPresence />
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleFocusMode}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-input ${
                      focusMode
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'text-fg-dim hover:text-fg'
                    }`}
                    aria-label={focusMode ? 'Sair do modo foco' : 'Modo foco'}
                  >
                    {focusMode ? <icons.ui.focusActive size={16} /> : <icons.ui.focus size={16} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {focusMode ? 'Sair do modo foco' : 'Modo foco'}
                </TooltipContent>
              </TooltipRoot>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggle}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg"
                    aria-label="Alternar tema"
                  >
                    {theme === 'light' ? <icons.ui.moon size={16} /> : <icons.ui.sun size={16} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {theme === 'dark' ? 'Escuro → Suave' : theme === 'dim' ? 'Suave → Claro' : 'Claro → Escuro'}
                </TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
          </div>
        </header>

      <main ref={mainRef} className={`flex-1 overflow-y-auto ${focusMode ? 'pb-4' : 'pb-24'}`} style={{ paddingBottom: focusMode ? '1rem' : 'max(6rem, calc(3.5rem + env(safe-area-inset-bottom)))' }}>
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={location.pathname} direction={direction}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>

      {!focusMode && <BottomNav />}
      <PushNotificationButton />
      <ToastContainer />
    </div>
  )
}

function PageTransition({ direction, children }: { direction: 'left' | 'right'; children: React.ReactNode }) {
  const x = direction === 'left' ? 36 : -36
  return (
    <motion.div
      initial={{ opacity: 0, x, filter: 'blur(1.5px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: -x, filter: 'blur(1.5px)' }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="p-4"
    >
      {children}
    </motion.div>
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
