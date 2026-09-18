import type { CoordinatedUnit } from '../../../core/permissions/coordinatorService'
import type { TeamMember } from '../../../core/permissions/membership'
import { icons } from '../../../lib/icons'
import { SheetOrDialog } from '../../../responsive'
import { managerOptionsForMember } from '../coordinatorHelpers'

interface AssignManagerSheetProps {
  target: { member: TeamMember; currentManagerLabel: string; unit: CoordinatedUnit } | null
  selected: string | null
  busy: boolean
  error: string | null
  onSelect: (id: string) => void
  onConfirm: () => void
  onClose: () => void
}

/**
 * Vincula um membro a um gestor DENTRO do escopo da unidade (RPC 047).
 * Enquadramento responsivo: BottomSheet (compact/tablet) ou Dialog (desktop/
 * wide) via SheetOrDialog — o conteúdo e a lógica são únicos.
 */
export function AssignManagerSheet({
  target,
  selected,
  busy,
  error,
  onSelect,
  onConfirm,
  onClose,
}: AssignManagerSheetProps) {
  const options = target ? managerOptionsForMember(target.unit, target.member) : []
  const name = target?.member.profile?.name ?? 'Membro'
  return (
    <SheetOrDialog
      open={target !== null}
      onClose={onClose}
      title="Vincular membro a gestor"
      className="max-w-md"
    >
      <div className="flex flex-col gap-2 px-5 pb-6">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
            <icons.ui.userCheck size={18} />
          </div>
          <p className="min-w-0 truncate text-xs text-fg-muted">
            {name} • sob {target?.currentManagerLabel}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <label
              key={option.membershipId}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors has-[:checked]:border-violet-500/60 has-[:checked]:bg-violet-500/5"
            >
              <input
                type="radio"
                name="manager-option"
                value={option.membershipId}
                checked={selected === option.membershipId}
                onChange={() => onSelect(option.membershipId)}
                disabled={busy}
                className="h-4 w-4 accent-violet-500"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-fg">{option.label}</span>
                <span className="block truncate text-[10px] text-fg-muted">{option.note}</span>
              </span>
            </label>
          ))}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
        <p className="text-[10px] leading-relaxed text-fg-muted">
          A criação de memberships continua restrita ao administrador. O Postgres valida este
          vínculo.
        </p>

        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || selected === null}
            className="flex-1 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:opacity-50"
          >
            {busy ? 'Vinculando...' : 'Vincular'}
          </button>
        </div>
      </div>
    </SheetOrDialog>
  )
}