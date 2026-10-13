import { Outlet, useLocation } from 'react-router-dom'
import { useRef, useState, useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { StockBottomNav } from '../components/StockBottomNav'
import { StockHeader } from '../components/StockHeader'
import { useSwipeBack } from '../../pcare/hooks/useSwipeBack'
import { useOnlineSync } from '../../../lib/useOnlineSync'
import { useExpiryAlerts } from '../hooks/useExpiryAlerts'
import { useWorkspace } from '../../../core/workspaces/WorkspaceContext'
import { PushNotificationButton } from '../../reservalab/components/PushNotificationButton'
import { STOCK_PREFIXES, stockPrefix, normalizeStockPath } from '../utils/stockPath'
import { STOCK_CONTAINER_CLASS } from './stockContainer'

function p(pathname: string, suffix: string) {
  return STOCK_PREFIXES.some((pre) => pathname === pre + suffix || pathname.startsWith(pre + suffix + '/'))
}

function m(pathname: string) {
  return STOCK_PREFIXES.some((pre) => pathname === pre)
}

function mainRoute(pathname: string) {
  return m(pathname) || p(pathname, '/items') || p(pathname, '/equipamentos') || p(pathname, '/movements') || p(pathname, '/entry-exit')
}

function isDetailPage(pathname: string) {
  return !mainRoute(pathname)
}

/**
 * Transição discreta entre páginas: deslocamento curto, sem blur, e
 * desativada quando o usuário pede menos movimento (`prefers-reduced-motion`).
 */
function StockPageTransition({ direction, children }: { direction: 'left' | 'right'; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  const x = direction === 'left' ? 12 : -12
  if (reduceMotion) {
    return <div className={`${STOCK_CONTAINER_CLASS} py-4`}>{children}</div>
  }
  return (
    <motion.div
      initial={{ opacity: 0, x }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -x }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={`${STOCK_CONTAINER_CLASS} py-4`}
    >
      {children}
    </motion.div>
  )
}

function getPageTitle(pathname: string): string {
  if (m(pathname)) return 'Dashboard'
  if (p(pathname, '/items')) return 'Materiais'
  if (p(pathname, '/equipamentos')) return 'Equipamentos'
  if (p(pathname, '/movements')) return 'Movimentações'
  if (p(pathname, '/entry-exit')) return 'Entrada/Saída'
  if (p(pathname, '/maintenance')) return 'Manutenções'
  if (p(pathname, '/inventory')) return 'Inventários'
  return 'Estoque'
}

function getBackPath(pathname: string): string {
  const pre = stockPrefix(pathname)
  if (p(pathname, '/items')) return pre + '/items'
  if (p(pathname, '/equipamentos')) return pre + '/equipamentos'
  if (p(pathname, '/inventory')) return pre + '/inventory'
  return pre
}

function normalizeRoute(pathname: string): string {
  return normalizeStockPath(pathname)
}

const ROUTE_ORDER: Record<string, number> = {
  '/stock': 0,
  '/stock/items': 10,
  '/stock/equipamentos': 15,
  '/stock/entry-exit': 20,
  '/stock/movements': 30,
  '/stock/maintenance': 60,
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
  const { workspace } = useWorkspace()
  // Tema centralizado no perfil do app principal — sem controle local aqui

  useSwipeBack()
  useOnlineSync()
  useExpiryAlerts()

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
      unitName={workspace?.name ?? null}
      mainRef={mainRef}
      scrollToTop={scrollToTop}
    />
  )
}

function StockLayoutInner({
  location, title, detail, unitName, mainRef, scrollToTop,
}: {
  location: ReturnType<typeof useLocation>
  title: string
  detail: boolean
  unitName: string | null
  mainRef: React.RefObject<HTMLDivElement | null>
  scrollToTop: () => void
}) {
  const [direction, setDirection] = useState<'left' | 'right'>('left')
  const prevPathRef = useRef(location.pathname)

  useEffect(() => {
    const prev = prevPathRef.current
    const curr = location.pathname
    prevPathRef.current = curr
    if (prev !== curr) {
      setDirection(getSlideDirection(prev, curr))
    }
  }, [location.pathname])

  return (
    <div
      className="flex min-h-dvh flex-col bg-surface text-fg overflow-x-hidden"
    >
      <StockHeader
        title={title}
        canGoBack={detail}
        backTo={getBackPath(location.pathname)}
        onTitleClick={scrollToTop}
        unitName={unitName}
      />

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
