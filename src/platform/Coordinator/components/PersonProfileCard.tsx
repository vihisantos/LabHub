import { type KeyboardEvent } from 'react'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'
import { initials, peopleStatusLabel, STATUS_DOT, STATUS_TONE, COORDINATOR_LEADER_LABEL } from '../coordinatorHelpers'
import type { AggregatedPerson } from '../coordinatorHelpers'

/**
 * Card de perfil da aba "Pessoal" — representação VISUAL apenas (READ-ONLY).
 *
 * Recebe a PESSOA CONSOLIDADA (`AggregatedPerson`, #363): 1 perfil → 1 card →
 * N unidades autorizadas. A fonte de dados já foi escopada pelo servidor e
 * consolidada por `membership.profile_id` no helper — o componente NÃO decide
 * autorização e NÃO contém regra de negócio.
 *
 * Composição (mobile-first, PWA):
 *  - o BANNER é uma camada de FUNDO posicionada (`relative`); o AVATAR fica
 *    ACIMA dele (`relative z-10` no wrapper), com `-mt` sobrepondo — sem
 *    clipping, porque o banner não tem `overflow` e o avatar sai do overlap
 *    visível por cima do stacking. Também sem `z-index` mágico: o stacking
 *    context do wrapper resolve a ordem no próprio card;
 *  - foto/banner REAIS do perfil (`profiles.avatar`/`profiles.banner`, 089)
 *    com fallbacks locais (iniciais/gradiente) — nunca URLs externas;
 *  - UNIDADES como chips compactos com o ponto de STATUS do vínculo; quando há
 *    muitas, colapsa em `+N` (título/aria-label listam as demais);
 *  - STATUS em selo único SÓ quando todos os vínculos da pessoa concordam;
 *    quando divergem, cada chip carrega o próprio status (nenhuma prioridade
 *    inventada). Cargo e responsável seguem a mesma regra.
 *
 * Status: os mesmos 4 tokens/tons já usados na Central (mapa fechado).
 */

/** Quantas unidades viram chips visíveis antes do colapso `+N`. */
const MAX_UNIT_CHIPS = 3

interface PersonProfileCardProps {
  /** Pessoa consolidada (já autorizada pelo servidor) — fonte única de dados. */
  person: AggregatedPerson
  /** Abre o perfil interativo (#365): o CARD INTEIRO é o alvo (mouse + teclado). */
  onOpen?: () => void
}

export function PersonProfileCard({ person, onOpen = () => {} }: PersonProfileCardProps) {
  const activate = () => onOpen()
  const handleKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    // Teclado no card interativo (role="button"): Enter e Espaço ativam.
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    activate()
  }
  const { units } = person
  // Testid estável por card: o PRIMEIRO vínculo da pessoa na ordem do escopo.
  const pid = units[0]?.membershipId ?? 'unknown'

  const name = person.name
  const email = person.email
  const avatar = person.profile?.avatar
  const banner = person.profile?.banner
  const fallbackInitials = initials(person.profile?.name ?? '')

  // STATUS: selo único SÓ se todos os vínculos concordam; se divergem, cada
  // chip de unidade carrega o próprio ponto de status (sem prioridade).
  const statuses = [...new Set(units.map((u) => u.status))]
  const statusUniform = statuses.length === 1

  // CARGO: rótulo único quando os vínculos concordam; senão, os cargos
  // distintos na ordem do escopo — nenhum vira "principal".
  const roleLabels = [...new Set(units.map((u) => u.roleLabel))]
  const roleLabel = roleLabels.join(' · ')

  // RESPONSÁVEL: resolvedores distintos dos vínculos (sem hierarquia).
  const managerByKey = new Map<string, string>()
  for (const unit of units) {
    if (unit.leader === null) {
      managerByKey.set('none', 'Sem líder definido')
    } else if (unit.leader.isCoordination) {
      managerByKey.set('coordination', COORDINATOR_LEADER_LABEL)
    } else {
      managerByKey.set(unit.leader.membershipId, unit.leader.name)
    }
  }
  const managerLabels = [...managerByKey.values()]
  const managerLabel = managerLabels.length === 1 ? managerLabels[0] : managerLabels.join(' · ')

  // UNIDADES: chips visíveis + colapso `+N` quando houver muitas.
  const visibleUnits = units.slice(0, MAX_UNIT_CHIPS)
  const hiddenUnits = units.slice(MAX_UNIT_CHIPS)
  const hiddenUnitNames = hiddenUnits.map((u) => u.unitName).join(', ')

  return (
    <li
      data-testid={`people-row-${pid}`}
      role="button"
      tabIndex={0}
      aria-label={`Ver perfil de ${name}`}
      onClick={activate}
      onKeyDown={handleKeyDown}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5 focus-visible:border-violet-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none"
    >
      {/* Banner — camada de FUNDO posicionada (avatar fica ACIMA dela). */}
      <div data-testid={`people-banner-${pid}`} className="relative h-16 shrink-0 sm:h-20">
        {banner ? (
          <img
            data-testid={`people-banner-img-${pid}`}
            src={banner}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            data-testid={`people-banner-fallback-${pid}`}
            aria-hidden="true"
            className="h-full w-full bg-gradient-to-br from-violet-500/25 via-violet-500/10 to-transparent"
          />
        )}
        {/* Status sobre o banner — só quando todos os vínculos concordam. */}
        {statusUniform && (
          <span
            data-testid={`people-status-${pid}`}
            className={cn(
              'absolute right-2 top-2 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-semibold ring-1 ring-line backdrop-blur-sm',
              STATUS_TONE[statuses[0]],
            )}
          >
            {peopleStatusLabel(statuses[0])}
          </span>
        )}
      </div>

      {/* Avatar — ACIMA do banner (relative z-10 sobre a camada posicionada), sem clipping. */}
      <div data-testid={`people-avatar-${pid}`} className="relative z-10 -mt-6 px-4">
        {avatar ? (
          <img
            data-testid={`people-avatar-img-${pid}`}
            src={avatar}
            alt={person.profile?.name ?? ''}
            loading="lazy"
            className="h-12 w-12 rounded-full object-cover shadow-sm ring-4 ring-surface sm:h-14 sm:w-14"
          />
        ) : (
          <span
            data-testid={`people-avatar-fallback-${pid}`}
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/15 text-[13px] font-bold text-violet-600 ring-4 ring-surface dark:text-violet-400 sm:h-14 sm:w-14"
          >
            {fallbackInitials}
          </span>
        )}
      </div>

      {/* Nome / cargo / unidades / responsável / e-mail */}
      <div className="flex flex-col gap-1 px-4 pb-3 pt-1.5">
        <p className="truncate text-[13px] font-semibold leading-snug text-fg sm:text-sm">{name}</p>
        <p className="truncate text-[11px] text-fg-muted">{roleLabel}</p>

        <ul
          data-testid={`people-units-${pid}`}
          aria-label={`Unidades de ${name}`}
          className="mt-0.5 flex flex-wrap items-center gap-1"
        >
          {visibleUnits.map((unit) => (
            <li
              key={unit.membershipId}
              title={`${unit.unitName} · ${peopleStatusLabel(unit.status)}`}
            >
              <span
                data-testid={`people-unit-${unit.membershipId}`}
                className="inline-flex max-w-40 items-center gap-1 rounded-full border border-line bg-input/50 px-2 py-0.5 text-[10px] font-medium leading-none text-fg-muted"
              >
                <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[unit.status])} />
                <span className="truncate">{unit.unitName}</span>
              </span>
            </li>
          ))}
          {hiddenUnits.length > 0 && (
            <li title={hiddenUnitNames}>
              <span
                data-testid={`people-units-more-${pid}`}
                aria-label={`Mais ${hiddenUnits.length} unidade${hiddenUnits.length === 1 ? '' : 's'}: ${hiddenUnitNames}`}
                className="inline-flex items-center rounded-full border border-line bg-input/50 px-2 py-0.5 text-[10px] font-medium leading-none text-fg-muted"
              >
                +{hiddenUnits.length}
              </span>
            </li>
          )}
        </ul>

        <p
          data-testid={`people-leader-${pid}`}
          className="flex items-center gap-1 text-[11px] text-fg-muted"
        >
          <icons.ui.userCheck size={12} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 truncate">{managerLabel}</span>
        </p>
        <p className="truncate text-[11px] text-fg-dim">{email}</p>
        {/* CTA discreto — o CARD INTEIRO abre o perfil (#365). */}
        <div
          data-testid={`people-cta-${pid}`}
          className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400"
        >
          Ver perfil
          <icons.ui.chevronRight
            size={12}
            aria-hidden="true"
            className="transition-transform motion-reduce:transition-none group-hover:translate-x-0.5"
          />
        </div>
      </div>
    </li>
  )
}