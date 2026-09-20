import { TabsList, TabsTrigger } from '../../../lib/components/ui/tabs'
import { cn } from '../../../lib/components/ui/utils'
import { COORDINATOR_TABS } from '../coordinatorTabs'

/**
 * Faixa de abas da Central do Coordenador (PR C). É só apresentação: o estado
 * ativo vem do `<Tabs value>` do shell (Radix) e as trocas de aba são emitidas
 * via `onValueChange`. A lista rola horizontalmente em telas estreitas
 * (`overflow-x-auto` com `w-max`) e mantém semântica de tablist/tab + aria-selected.
 */
export function CoordinatorTabs({ className }: { className?: string }) {
  return (
    <TabsList
      data-testid="coordinator-tabs"
      aria-label="Central do Coordenador"
      className={cn(
        'h-11 w-full max-w-full justify-start gap-0.5 overflow-x-auto rounded-xl border border-line bg-input/40 p-1',
        'scrollbar-none',
        className,
      )}
    >
      {COORDINATOR_TABS.map((tab) => {
        const Icon = tab.icon
        return (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className={cn(
              'w-auto shrink-0 gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-fg-muted transition-colors',
              'data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-600 dark:data-[state=active]:text-violet-400',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40',
            )}
          >
            <Icon size={13} />
            {tab.label}
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}