import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useRef, useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { StockBottomNav } from '../components/StockBottomNav'
import { useTheme } from '../../../lib/ThemeContext'
import { useSwipeBack } from '../../pcare/hooks/useSwipeBack'
import { useOnlineSync } from '../../../lib/useOnlineSync'
import { icons } from '../../../lib/icons'
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from '../../../lib/components/ui'
import { PushNotificationButton } from '../../reservalab/components/PushNotificationButton'

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

function StockPageTransition({ direction, children }: { direction: 'left' | 'right'; children: React.ReactNode }) {
  const x = direction === 'left' ? 36 : -36
  return (
    <motion.div
      initial={{ opacity: 0, x, filter: 'blur(1.5px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: -x, filter: 'blur(1.5px)' }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto max-w-lg p-4"
    >
      {children}
    </motion.div>
  )
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

function normalizeRoute(pathname: string): string {
  for (const pre of PREFIXES) {
    if (pathname.startsWith(pre)) {
      return '/stock' + pathname.slice(pre.length)
    }
  }
  return pathname
}

const ROUTE_ORDER: Record<string, number> = {
  '/stock': 0,
  '/stock/items': 10,
  '/stock/entry-exit': 20,
  '/stock/movements': 30,
  '/stock/kits': 40,
  '/stock/pipeline': 50,
  '/stock/maintenance': 60,
  '/stock/qr': 70,
  '/stock/inventory': 80,
}

function getBaseRoute(pathname: string): string {
  const normal = normalizeRoute(pathname)
  const segments = normal.split('/').filter(Boolean)
  if (segments.length > 2) return `/${segments.slice(0, 2).join('/')}`
  return normal
}

function getSlideDirection(prev: string, curr: string): 'left' | 'right' {
  if (prev === curr) return 'left'
  const prevNorm = normalizeRoute(prev)
  const currNorm = normalizeRoute(curr)
  const prevSegments = prevNorm.split('/').filter(Boolean).length
  const currSegments = currNorm.split('/').filter(Boolean).length
  if (prevSegments > currSegments) return 'right'
  if (prevSegments < currSegments) return 'left'
  const prevBase = getBaseRoute(prevNorm)
  const currBase = getBaseRoute(currNorm)
  const prevOrder = ROUTE_ORDER[prevBase] ?? 50
  const currOrder = ROUTE_ORDER[currBase] ?? 50
  return currOrder > prevOrder ? 'left' : 'right'
}

export function StockLayout() {
  const location = useLocation()
  const title = getPageTitle(location.pathname)
  const detail = isDetailPage(location.pathname)
  const mainRef = useRef<HTMLDivElement>(null)
  const { theme, toggle } = useTheme()

  useSwipeBack()
  useOnlineSync()

  function scrollToTop() {
    if (mainRef.current && mainRef.current.scrollTop > 0) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <StockLayoutInner
      location={location}
      title={title}
      detail={detail}
      mainRef={mainRef}
      theme={theme}
      toggle={toggle}
      scrollToTop={scrollToTop}
    />
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
  const navigate = useNavigate()
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

  const STOCK_TABS = ['/stock', '/stock/items', '/stock/entry-exit', '/stock/movements', '/stock/kits', '/stock/maintenance', '/stock/qr']

  function handleSwipeStart(e: React.TouchEvent) {
    swipeStartX.current = e.touches[0].clientX
    swipeStartY.current = e.touches[0].clientY
    swipeStartTime.current = Date.now()
  }

  function handleSwipeEnd(e: React.TouchEvent) {
    if (detail) return
    const dx = e.changedTouches[0].clientX - swipeStartX.current
    const dy = e.changedTouches[0].clientY - swipeStartY.current
    const dt = Date.now() - swipeStartTime.current
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || dt > 350) return
    const currentBase = getBaseRoute(location.pathname)
    const currentIndex = STOCK_TABS.indexOf(currentBase)
    if (currentIndex === -1) return
    if (dx < 0 && currentIndex < STOCK_TABS.length - 1) {
      navigate(STOCK_TABS[currentIndex + 1])
    } else if (dx > 0 && currentIndex > 0) {
      navigate(STOCK_TABS[currentIndex - 1])
    }
  }

  return (
    <div
      className="flex min-h-dvh flex-col bg-surface text-fg overflow-x-hidden"
      onTouchStart={handleSwipeStart}
      onTouchEnd={handleSwipeEnd}
    >
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-surface/80 px-4 py-3.5 backdrop-blur-xl border-b border-line">
        {detail && (
          <Link
            to={getBackPath(location.pathname)}
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
            <p className="text-[11px] font-medium leading-tight bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">Estoque</p>
          </div>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggle}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-fg-dim transition-colors hover:bg-input hover:text-fg"
                  aria-label="Alternar tema"
                >
                  {theme === 'light' ? <icons.ui.moon size={18} /> : <icons.ui.sun size={18} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {theme === 'dark' ? 'Escuro → Suave' : theme === 'dim' ? 'Suave → Claro' : 'Claro → Escuro'}
              </TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto pb-28" style={{ paddingBottom: 'max(7rem, calc(4rem + env(safe-area-inset-bottom)))' }}>
        <AnimatePresence mode="wait" initial={false}>
          <StockPageTransition key={location.pathname} direction={direction}>
            <Outlet />
          </StockPageTransition>
        </AnimatePresence>
      </main>

      <StockBottomNav />
      <PushNotificationButton />
    </div>
  )
}
