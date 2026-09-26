import { useEffect, useId, useRef, useState, type ElementRef } from 'react'
import { icons } from '../../../lib/icons'
import { TabsList, TabsTrigger } from '../../../lib/components/ui/tabs'
import { cn } from '../../../lib/components/ui/utils'
import { COORDINATOR_TABS, type CoordinatorTabId } from '../coordinatorTabs'

/**
 * Navegação mobile da Central do Coordenador (PR2 — PR D via RPC). Substitui o
 * trilho horizontal por um botão hamburger animado (SVG ☰ → X) que abre um menu
 * compacto com as sete abas. As entradas são `TabsTrigger` do mesmo `<Tabs>`
 * Radix do shell → quando o usuário seleciona, o fluxo nativo `onValueChange`
 * atualiza a URL e o `activeTab` (nenhum estado duplicado).
 *
 * A11y: button real com aria-expanded/aria-controls/aria-haspopup, Escape
 * devolve foco ao botão, clique fora fecha. Animação respeita
 * prefers-reduced-motion (classes motion-reduce + CSS).
 */
interface CoordinatorMobileMenuProps {
  activeTab: CoordinatorTabId
}

export function CoordinatorMobileMenu({ activeTab }: CoordinatorMobileMenuProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<ElementRef<typeof TabsList>>(null)

  const activeDef = COORDINATOR_TABS.find((tab) => tab.id === activeTab) ?? COORDINATOR_TABS[0]
  const ActiveIcon = activeDef.icon

  // Fecha o menu assim que a aba muda (seleção via mouse, teclado ou URL) e
  // devolve o foco ao botão para quem navega por teclado.
  const prevActive = useRef(activeTab)
  useEffect(() => {
    if (prevActive.current !== activeTab) {
      prevActive.current = activeTab
      setOpen(false)
      buttonRef.current?.focus()
    }
  }, [activeTab])

  useEffect(() => {
    if (!open) return

    listRef.current?.focus()

    function onPointerDown(ev: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) {
        setOpen(false)
      }
    }
    // jsdom não emite PointerEvent → duplicar em mouseDown (idempotente).
    function onMouseDown(ev: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const burger = (line: 'top' | 'mid' | 'bottom') => {
    const closing = open
    const isTop = line === 'top'
    const isBottom = line === 'bottom'
    const y = isTop ? 7 : isBottom ? 17 : 12
    return (
      <line
        className="coordinator-burger-line text-current"
        x1="4"
        y1={y}
        x2="20"
        y2={y}
        pathLength={1}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={isTop || isBottom ? (closing ? '0.5 0.5' : '1 1') : '1 1'}
        strokeDashoffset={closing && isTop ? '0.5' : '0'}
        style={{
          transformBox: 'fill-box',
          transformOrigin: 'center',
          transform: closing
            ? isTop
              ? 'translateY(5px) rotate(-45deg)'
              : isBottom
                ? 'translateY(-5px) rotate(45deg)'
                : 'none'
            : 'none',
          opacity: !isTop && !isBottom && closing ? 0 : 1,
        }}
      />
    )
  }

  return (
    <div ref={rootRef} className="relative lg:hidden">
      <div className="flex h-12 items-center justify-between gap-2 rounded-2xl border border-line bg-card p-1.5 pl-4 shadow-[var(--shadow-card)]">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
          <ActiveIcon size={14} className="shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="truncate">{activeDef.label}</span>
        </span>

        <button
          ref={buttonRef}
          type="button"
          data-testid="coordinator-mobile-menu-button"
          aria-label={
            open ? 'Fechar menu da Central do Coordenador' : 'Abrir menu da Central do Coordenador'
          }
          aria-expanded={open}
          aria-controls={panelId}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
          className={cn(
            'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            'transition-colors duration-200',
            'hover:bg-violet-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40',
            'active:bg-violet-500/10',
            open ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' : 'text-fg',
          )}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" focusable="false">
            {burger('top')}
            {burger('mid')}
            {burger('bottom')}
          </svg>
        </button>
      </div>

      {open && (
        <div
          id={panelId}
          data-testid="coordinator-mobile-menu"
          className="coordinator-menu-anchor absolute right-0 top-full z-50 mt-2 w-60 min-w-56 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-card p-1.5 shadow-[var(--shadow-elevated)] animate-[coordinator-menu-show_200ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none"
        >
          <TabsList
            ref={listRef}
            data-testid="coordinator-mobile-tablist"
            aria-label="Central do Coordenador"
            className="flex w-full flex-col items-stretch gap-0.5 rounded-xl bg-transparent p-0 text-fg"
          >
            {COORDINATOR_TABS.map((tab, index) => {
              const Icon = tab.icon
              const active = tab.id === activeTab
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  onClick={() => setOpen(false)}
                  style={{ animationDelay: `${index * 24}ms` }}
                  className={cn(
                    'w-full justify-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-fg-muted',
                    'transition-all duration-200',
                    'hover:bg-violet-500/5 hover:text-fg',
                    'data-[state=active]:bg-violet-500/10 data-[state=active]:font-semibold data-[state=active]:text-violet-600 dark:data-[state=active]:text-violet-400',
                    'active:scale-[0.99]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40',
                    'animate-[coordinator-menu-item-show_220ms_ease-out_both] motion-reduce:animate-none',
                  )}
                >
                  <Icon
                    size={16}
                    className={cn('shrink-0', active && 'text-violet-600 dark:text-violet-400')}
                  />
                  <span className="flex-1">{tab.label}</span>
                  <icons.ui.check
                    size={15}
                    className={cn(
                      'shrink-0 transition-opacity duration-150',
                      active ? 'opacity-100 text-violet-600 dark:text-violet-400' : 'opacity-0',
                    )}
                  />
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>
      )}
    </div>
  )
}