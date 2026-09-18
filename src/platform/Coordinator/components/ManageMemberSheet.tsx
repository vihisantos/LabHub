import type {
  CoordinatorAssignableRole,
  CoordinatorRoleOption,
} from '../../../core/permissions/coordinatorService'
import type { TeamMember } from '../../../core/permissions/membership'
import { icons } from '../../../lib/icons'
import { SheetOrDialog } from '../../../responsive'

interface ManageMemberSheetProps {
  target: { member: TeamMember; unitName: string } | null
  roles: CoordinatorRoleOption[]
  rolesLoading: boolean
  rolesError: string | null
  selected: CoordinatorAssignableRole | null
  currentRoleLabel: string
  busy: boolean
  error: string | null
  onSelect: (slug: CoordinatorAssignableRole) => void
  onSave: () => void
  onRequestSuspend: () => void
  onRequestRemove: () => void
  onClose: () => void
}

/**
 * Gerenciamento de cargo e status de uma membership da unidade (RPC 065/066
 * escopados). A UI oferece somente os cargos atribuíveis (tec/vis/est/opv/lider
 * — nunca adm/coordinator); o servidor é a autoridade. Enquadramento
 * responsivo via SheetOrDialog (BottomSheet mobile / Dialog desktop).
 */
export function ManageMemberSheet({
  target,
  roles,
  rolesLoading,
  rolesError,
  selected,
  currentRoleLabel,
  busy,
  error,
  onSelect,
  onSave,
  onRequestSuspend,
  onRequestRemove,
  onClose,
}: ManageMemberSheetProps) {
  const name = target?.member.profile?.name ?? 'Membro sem perfil'
  return (
    <SheetOrDialog
      open={target !== null}
      onClose={onClose}
      title="Gerenciar membro"
      className="max-w-md"
    >
      <div className="flex flex-col gap-2 px-5 pb-6">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
            <icons.ui.sliders size={18} />
          </div>
          <p className="min-w-0 truncate text-xs text-fg-muted">
            {name} • {target?.unitName} • cargo atual: {currentRoleLabel}
          </p>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
          Cargo na unidade
        </p>
        {rolesLoading ? (
          <p className="text-xs text-fg-muted">Carregando cargos...</p>
        ) : roles.length === 0 ? (
          <p className="text-xs text-red-500">
            {rolesError ?? 'Nenhum cargo atribuível disponível.'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {roles.map((role) => (
              <label
                key={role.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors has-[:checked]:border-violet-500/60 has-[:checked]:bg-violet-500/5"
              >
                <input
                  type="radio"
                  name="role-option"
                  value={role.slug}
                  checked={selected === role.slug}
                  onChange={() => onSelect(role.slug)}
                  disabled={busy}
                  className="h-4 w-4 accent-violet-500"
                />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
                  {role.name}
                </span>
              </label>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-red-500">
            Status da membership
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRequestSuspend}
              disabled={busy}
              className="flex-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-400"
            >
              Suspender
            </button>
            <button
              type="button"
              onClick={onRequestRemove}
              disabled={busy}
              className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              Remover da unidade
            </button>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-fg-muted">
          O Postgres é a autoridade: valida o escopo, os cargos permitidos (nunca adm ou
          coordinator) e as transições de status. Suspender retira o membro do seu escopo (e
          ele pode ser reativado em "Membros inativos"); remover é definitivo.
        </p>

        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input disabled:opacity-50"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || selected === null || roles.length === 0}
            className="flex-1 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:opacity-50"
          >
            {busy ? 'Salvando...' : 'Salvar cargo'}
          </button>
        </div>
      </div>
    </SheetOrDialog>
  )
}