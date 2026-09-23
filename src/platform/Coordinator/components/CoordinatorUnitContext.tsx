import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'
import { cn } from '../../../lib/components/ui/utils'

/**
 * Seletor de CONTEXTO DE EXIBIÇÃO da Central do Coordenador (PR C, C1).
 *
 * Mudar aqui NÃO altera o workspace global ativo, nem cargos, nem autorização:
 * o estado é puramente visual/local à Central e as unidades listadas são
 * EXCLUSIVAMENTE as do escopo de coordenação (passadas por props pelo shell via
 * `useCoordinator`). Nunca invoca `setWorkspace()` nem dispara RPC — é um
 * componente puramente apresentacional, fail-closed: com nenhuma unidade não
 * renderiza nada e o valor ativo só considera ids do escopo informado.
 *
 * Contratos de teste:
 *   - raiz: `data-testid="coordinator-unit-context"`
 *   - opção "Todas as unidades": `data-testid="unit-context-all"`
 *   - opção por unidade: `data-testid="unit-context-{unitId}"`
 *   - estado selecionado via `aria-pressed` (false = Todas).
 */
export function CoordinatorUnitContext({
  units,
  activeUnitId,
  onSelect,
}: {
  units: CoordinatedUnit[]
  activeUnitId: string | null
  onSelect: (unitId: string | null) => void
}) {
  if (units.length === 0) {
    return null
  }

  const validActive = units.some((unit) => unit.unitId === activeUnitId)
  const current = validActive ? activeUnitId : null

  const base =
    'rounded-lg border border-line bg-card px-3 py-2 text-[11px] font-semibold text-fg-muted transition-all duration-200 hover:bg-input hover:text-fg active:scale-[0.98]'
  const active =
    'border-violet-500/40 bg-violet-500/15 text-violet-600 hover:bg-violet-500/15 hover:text-violet-600 shadow-[var(--shadow-card)] dark:text-violet-400'

  return (
    <div
      data-testid="coordinator-unit-context"
      role="group"
      aria-label="Contexto de exibição"
      className="flex w-full flex-wrap items-center gap-2"
    >
      <button
        type="button"
        data-testid="unit-context-all"
        aria-pressed={current === null}
        onClick={() => onSelect(null)}
        className={cn(base, current === null && active)}
      >
        Todas as unidades
      </button>
      {units.map((unit) => {
        const isActive = current === unit.unitId
        return (
          <button
            key={unit.unitId}
            type="button"
            data-testid={`unit-context-${unit.unitId}`}
            aria-pressed={isActive}
            onClick={() => onSelect(unit.unitId)}
            className={cn(base, isActive && active)}
          >
            {unit.unitName}
          </button>
        )
      })}
    </div>
  )
}