import { useEffect } from 'react'
import {
  Dialog,
  DialogDrawerContent,
  DialogOverlay,
  DialogPortal,
} from '../../../lib/components/ui/dialog'
import { icons } from '../../../lib/icons'
import { cn } from '../../../lib/components/ui/utils'
import { BottomSheet } from '../../../platform/ui/BottomSheet'
import { useBreakpoint } from '../../../responsive/useBreakpoint'
import { COORDINATOR_LEADER_LABEL, initials, peopleStatusLabel, STATUS_DOT, STATUS_TONE } from '../coordinatorHelpers'
import type { AggregatedPerson, PeopleLeader, PeopleUnitMembership } from '../coordinatorHelpers'

/**
 * Drawer de PERFIL da aba Pessoal (#365) — representação VISUAL apenas.
 *
 * Reaproveita o MESMO dado consolidado do card (`AggregatedPerson`, #364):
 * 1 perfil → 1 card → N unidades autorizadas, sem RPC/RLS nova e sem decisão de
 * autorização (a fronteira real continua no servidor).
 *
 * Enquadramento responsivo (mobile-first, mesmo chrome do LabHub):
 * - compact/tablet → `BottomSheet` (PWA/mobile: drag para fechar, saída suave);
 * - desktop/wide → `Dialog` (Radix) ancorado como DRAWER lateral à direita,
 *   com o restante da tela visível ao fundo (backdrop clicável, Esc, trap de
 *   foco, restauração de foco — tudo do Radix).
 * No BottomSheet o `Esc` do teclado é implementado manualmente (o primitive
 * não escuta teclado); no desktop quem fecha é o Radix.
 *
 * Conteúdo (mesmo nas duas faixas): banner/avatar reais (fallbacks locais,
 * nunca URLs externas), nome + cargos distintos, lista de unidades com o
 * status de cada vínculo, e UMA linha por unidade preservando cargo/status/
 * responsável PRÓPRIOS daquele vínculo — nenhuma prioridade inventada.
 *
 * Acessibilidade: `role="dialog"` + rótulo "Perfil de <nome>", botão de
 * fechar com nome acessível, scroll interno, `overscroll-contain` e animações
 * neutralizadas por `prefers-reduced-motion` (CSS global + classes motion-reduce).
 */

export interface PersonProfileDrawerProps {
  /** Pessoa consolidada em exibição; `null` fecha (drawer descontrolado pelo pai). */
  person: AggregatedPerson | null
  onClose: () => void
}

/** Rótulo fixo de vínculo sem responsável (`managed_by = NULL`), igual ao filtro da aba. */
const RESPONSIBLE_UNASSIGNED_LABEL = 'Sem responsável'

function responsibleLabel(leader: PeopleLeader | null): string {
  if (leader === null) return RESPONSIBLE_UNASSIGNED_LABEL
  return leader.isCoordination ? COORDINATOR_LEADER_LABEL : leader.name
}

/** Cabeçalho único das duas faixas: título + nome + fechar. */
function DrawerHeader({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 px-5 pb-3 pt-2">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">Perfil</p>
        <h2 className="truncate text-lg font-bold leading-snug text-fg">{name}</h2>
      </div>
      <button
        type="button"
        data-testid="people-profile-close"
        aria-label="Fechar perfil"
        onClick={onClose}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-input text-fg-muted transition-colors hover:bg-input hover:text-fg motion-reduce:transition-none"
      >
        <icons.ui.close size={18} />
      </button>
    </header>
  )
}

/** Linha de vínculo: TODOS os campos pertencem à MEMBERSHIP daquela unidade. */
function ProfileUnitRow({ unit }: { unit: PeopleUnitMembership }) {
  return (
    <li
      data-testid={`people-profile-unit-${unit.membershipId}`}
      className="rounded-xl border border-line bg-surface p-3"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[unit.status])}
        />
        <p className="min-w-0 truncate text-sm font-semibold text-fg">{unit.unitName}</p>
        <span
          data-testid={`people-profile-unit-status-${unit.membershipId}`}
          className={cn('ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_TONE[unit.status])}
        >
          {peopleStatusLabel(unit.status)}
        </span>
      </div>
      <dl className="mt-2 flex flex-col gap-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-fg-muted">Cargo</dt>
          <dd
            data-testid={`people-profile-unit-role-${unit.membershipId}`}
            className="min-w-0 truncate text-right font-medium text-fg"
          >
            {unit.roleLabel}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-fg-muted">Responsável</dt>
          <dd
            data-testid={`people-profile-responsible-${unit.membershipId}`}
            className="min-w-0 truncate text-right font-medium text-fg"
          >
            {responsibleLabel(unit.leader)}
          </dd>
        </div>
      </dl>
    </li>
  )
}

/** Corpo do perfil — idêntico nas duas faixas (mesmo conteúdo, outro chrome). */
function ProfileBody({ person }: { person: AggregatedPerson }) {
  // Testid estável por pessoa: o PRIMEIRO vínculo na ordem do escopo.
  const pid = person.units[0]?.membershipId ?? 'unknown'
  const { name, email, units } = person
  const avatar = person.profile?.avatar
  const banner = person.profile?.banner
  const fallbackInitials = initials(person.profile?.name ?? '')

  // Mesmas regras do card: selo único SÓ quando os vínculos concordam.
  const statuses = [...new Set(units.map((u) => u.status))]
  const statusUniform = statuses.length === 1

  // Cargos distintos na ordem do escopo — nenhum vira "principal".
  const roleLabels = [...new Set(units.map((u) => u.roleLabel))]
  const roleLabel = roleLabels.join(' · ')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {/* Banner — camada de FUNDO (avatar fica ACIMA, mesmo layering do card). */}
        <div className="relative h-24 shrink-0 sm:h-28">
          {banner ? (
            <img
              data-testid={`people-profile-banner-img-${pid}`}
              src={banner}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              data-testid={`people-profile-banner-fallback-${pid}`}
              aria-hidden="true"
              className="h-full w-full bg-gradient-to-br from-violet-500/30 via-violet-500/15 to-transparent"
            />
          )}
          {statusUniform && (
            <span
              data-testid={`people-profile-status-${pid}`}
              className={cn(
                'absolute right-3 top-3 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-semibold ring-1 ring-line backdrop-blur-sm',
                STATUS_TONE[statuses[0]],
              )}
            >
              {peopleStatusLabel(statuses[0])}
            </span>
          )}
        </div>

        {/* Avatar — ACIMA do banner, sem clipping. */}
        <div className="relative z-10 -mt-8 px-5">
          {avatar ? (
            <img
              data-testid={`people-profile-avatar-img-${pid}`}
              src={avatar}
              alt={person.profile?.name ?? ''}
              loading="lazy"
              className="h-20 w-20 rounded-full object-cover shadow-md ring-4 ring-card sm:h-24 sm:w-24"
            />
          ) : (
            <span
              data-testid={`people-profile-avatar-fallback-${pid}`}
              aria-hidden="true"
              className="flex h-20 w-20 items-center justify-center rounded-full bg-violet-500/15 text-xl font-bold text-violet-600 ring-4 ring-card dark:text-violet-400 sm:h-24 sm:w-24"
            >
              {fallbackInitials}
            </span>
          )}
        </div>

        {/* Identidade */}
        <div className="flex flex-col gap-1 px-5 pb-4 pt-2">
          <p data-testid="people-profile-name" className="text-base font-bold leading-snug text-fg">
            {name}
          </p>
          <p data-testid="people-profile-role" className="truncate text-xs text-fg-muted">
            {roleLabel}
          </p>
          <p data-testid="people-profile-email" className="truncate text-[11px] text-fg-dim">
            {email}
          </p>
        </div>

        {/* Unidades — TODOS os vínculos, cada um com cargo/status/responsável PRÓPRIOS. */}
        <section className="border-t border-line px-5 py-4" aria-label="Vínculos por unidade">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            Unidades
          </h3>
          <ul data-testid="people-profile-units" className="mt-3 flex flex-col gap-2">
            {units.map((unit) => (
              <ProfileUnitRow key={unit.membershipId} unit={unit} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export function PersonProfileDrawer({ person, onClose }: PersonProfileDrawerProps) {
  const { bp } = useBreakpoint()
  const mobile = bp === 'compact' || bp === 'tablet'

  // O BottomSheet não escuta teclado; implementa o Esc aqui (paridade com o
  // Radix, que no desktop já fecha por Escape).
  useEffect(() => {
    if (!mobile || person === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobile, person, onClose])

  if (mobile) {
    return (
      <BottomSheet open={person !== null} onClose={onClose}>
        {person && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Perfil de ${person.name}`}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <DrawerHeader name={person.name} onClose={onClose} />
            <ProfileBody person={person} />
          </div>
        )}
      </BottomSheet>
    )
  }

  return (
    <Dialog open={person !== null} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogPortal>
        <DialogOverlay data-testid="people-profile-backdrop" />
        <DialogDrawerContent
          data-testid="people-profile-panel"
          aria-label={person ? `Perfil de ${person.name}` : undefined}
        >
          {person && (
            <>
              <DrawerHeader name={person.name} onClose={onClose} />
              <ProfileBody person={person} />
            </>
          )}
        </DialogDrawerContent>
      </DialogPortal>
    </Dialog>
  )
}