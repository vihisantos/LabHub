import type { MembershipStatus } from '../../../core/permissions/membership'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'
import { initials, peopleStatusLabel, COORDINATOR_LEADER_LABEL } from '../coordinatorHelpers'
import type { PeopleRow } from '../coordinatorHelpers'

/**
 * Card de perfil da aba "Pessoal" — representação VISUAL apenas (READ-ONLY).
 *
 * Recebe o `PeopleRow` já autorizado pelo servidor (fonte única de dados) e
 * NÃO decide autorização, NÃO contém regra de negócio. Toda a lógica de
 * RBAC/escopo/filtros/status permanece na aba e nos helpers.
 *
 * Visual (mobile-first, PWA):
 *  - banner REAL do perfil (`profiles.banner`, 014) no topo; sem banner,
 *    gradiente discreto do tema (mesma família violeta da Central);
 *  - foto REAL (`profiles.avatar`, 001/012) sobrepondo o banner; sem foto,
 *    fallback com iniciais (`initials()` do helper existente);
 *  - mobile: banner 64px, avatar 48px, conteúdo enxuto; desktop: banner 80px,
 *    avatar 56px. Nenhuma largura fixa — o card preenche a célula do grid;
 *  - hover discreto (elevação mínima + borda violeta + sombra suave).
 *
 * Status: os mesmos 4 tokens/tons já usados na aba (mapa fechado).
 */

/** Tonalidade do selo de status — mapa fechado nos 4 status reais da membership. */
const STATUS_TONE: Record<MembershipStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  suspended: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  removed: 'bg-red-500/10 text-red-500',
}

interface PersonProfileCardProps {
  row: PeopleRow
  /** true quando o escopo tem mais de uma unidade (unidade vira detalhe secundário). */
  multipleUnits?: boolean
}

export function PersonProfileCard({ row, multipleUnits = false }: PersonProfileCardProps) {
  const name = row.profile?.name ?? 'Perfil não disponível'
  const email = row.profile?.email || 'Sem e-mail registrado'
  const avatar = row.profile?.avatar
  const banner = row.profile?.banner
  const fallbackInitials = initials(row.profile?.name ?? '')

  return (
    <li
      data-testid={`people-row-${row.membership.id}`}
      className="overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5"
    >
      {/* Banner real (profiles.banner) ou gradiente do tema — nunca imagem externa */}
      <div data-testid={`people-banner-${row.membership.id}`} className="relative h-16 shrink-0 sm:h-20">
        {banner ? (
          <img
            data-testid={`people-banner-img-${row.membership.id}`}
            src={banner}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            data-testid={`people-banner-fallback-${row.membership.id}`}
            aria-hidden="true"
            className="h-full w-full bg-gradient-to-br from-violet-500/25 via-violet-500/10 to-transparent"
          />
        )}
        {/* Status sobre o banner, com fundo do card para contraste sobre imagem */}
        <span
          data-testid={`people-status-${row.membership.id}`}
          className={cn(
            'absolute right-2 top-2 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-semibold ring-1 ring-line backdrop-blur-sm',
            STATUS_TONE[row.status],
          )}
        >
          {peopleStatusLabel(row.status)}
        </span>
      </div>

      {/* Foto real (profiles.avatar) ou iniciais, sobrepondo o banner */}
      <div data-testid={`people-avatar-${row.membership.id}`} className="-mt-6 px-3">
        {avatar ? (
          <img
            data-testid={`people-avatar-img-${row.membership.id}`}
            src={avatar}
            alt={row.profile?.name ?? ''}
            loading="lazy"
            className="h-12 w-12 rounded-full object-cover ring-2 ring-surface sm:h-14 sm:w-14"
          />
        ) : (
          <span
            data-testid={`people-avatar-fallback-${row.membership.id}`}
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/15 text-[13px] font-bold text-violet-600 ring-2 ring-surface dark:text-violet-400 sm:h-14 sm:w-14"
          >
            {fallbackInitials}
          </span>
        )}
      </div>

      {/* Nome / cargo / unidade / líder / e-mail */}
      <div className="flex flex-col gap-1 px-3 pb-3 pt-1.5">
        <p className="truncate text-[13px] font-semibold leading-snug text-fg sm:text-sm">{name}</p>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded-full bg-input px-1.5 py-0.5 text-[10px] font-medium leading-none text-fg-muted">
            {row.roleLabel}
          </span>
          <span
            className={cn(
              'min-w-0 truncate text-[11px] text-fg-muted',
              multipleUnits && 'text-fg-dim',
            )}
          >
            {row.unitName}
          </span>
        </div>
        <p
          data-testid={`people-leader-${row.membership.id}`}
          className="flex items-center gap-1 text-[11px] text-fg-muted"
        >
          <icons.ui.userCheck size={12} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 truncate">
            {row.leader === null
              ? 'Sem líder definido'
              : row.leader.isCoordination
                ? COORDINATOR_LEADER_LABEL
                : row.leader.name}
          </span>
        </p>
        <p className="truncate text-[11px] text-fg-dim">{email}</p>
      </div>
    </li>
  )
}
