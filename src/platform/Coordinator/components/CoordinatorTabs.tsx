import { TabsList, TabsTrigger } from '../../../lib/components/ui/tabs'
import { cn } from '../../../lib/components/ui/utils'
import { useBreakpoint } from '../../../responsive'
import {
  COORDINATOR_TABS,
  type CoordinatorTabId,
} from '../coordinatorTabs'
import { CoordinatorMobileMenu } from './CoordinatorMobileMenu'

/**
 * Faixa de abas da Central do Coordenador (PR C). É só apresentação: o estado
 * ativo vem do `<Tabs value>` do shell (Radix) e as trocas de aba são emitidas
 * via `onValueChange`. A lista rola horizontalmente em telas estreitas
 * (`overflow-x-auto` com `w-max`) e mantém semântica de tablist/tab + aria-selected.
 *
 * PR1 — trilho premium: trilho em card com sombra sutil e aba ativa "elevada"
 * (bg-card + ring) com texto no accent; coincorre os testids e o label do aria.
 *
 * PR2 — navegação mobile animada: em telas < lg o trilho fica montado porém
 * oculto (CSS) e a navegação passa para o `CoordinatorMobileMenu` (hamburger
 * animado + menu compacto de abas do mesmo `<Tabs>` Radix, sem estado duplicado).
 * Isso preserva os testids/contratos existentes e o `aria` único por viewport.
 */
interface CoordinatorTabsProps {
  className?: string
  activeTab?: CoordinatorTabId
}

export function CoordinatorTabs({ className, activeTab = 'overview' }: CoordinatorTabsProps) {
  const { isCompact, isTablet } = useBreakpoint()
  const showMobileNav = isCompact || isTablet

  return (
    <div className={cn(className)}>
      {showMobileNav && <CoordinatorMobileMenu activeTab={activeTab} />}

      <div className="hidden lg:block">
        <TabsList
          data-testid="coordinator-tabs"
          aria-label="Central do Coordenador"
          className={cn(
            'h-12 w-full max-w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-line bg-card p-1.5',
            'shadow-[var(--shadow-card)]',
            'scrollbar-none',
          )}
        >
          {COORDINATOR_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  'w-auto shrink-0 gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold text-fg-muted transition-all duration-200',
                  'data-[state=active]:bg-card data-[state=active]:text-violet-600 data-[state=active]:shadow-[var(--shadow-card)] data-[state=active]:ring-1 data-[state=active]:ring-line dark:data-[state=active]:text-violet-400',
                  'hover:text-fg',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40',
                )}
              >
                <Icon size={13} />
                {tab.label}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </div>
    </div>
  )
}