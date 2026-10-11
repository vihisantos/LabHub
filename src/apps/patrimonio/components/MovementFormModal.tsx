import { useEffect, useRef, useState } from 'react'
import {
  ASSET_MOVEMENT_TYPE_LABELS,
  ASSET_STATUS_LABELS,
  ASSET_STATUSES,
  REGISTRABLE_MOVEMENT_TYPES,
  TRANSFER_TARGET_STATUSES,
  RESPONSIBLE_TARGET_STATUSES,
  INVENTORY_TARGET_STATUSES,
  movementsRepository,
  toPatrimonioError,
  validationError,
  type AssetMovement,
  type AssetMovementInput,
  type AssetStatus,
  type PatrimonioError,
} from '../../../core/patrimonio'
import type { PatrimonioReferences } from '../hooks/usePatrimonioReferences'
import { Modal } from '../../pcare/components/Modal'

type MovementType = (typeof REGISTRABLE_MOVEMENT_TYPES)[number]

interface FormState {
  type: MovementType
  to_location_id: string
  to_responsible_id: string
  to_status: AssetStatus | null
  expected_return_at: string
  note: string
}

const EMPTY: FormState = {
  type: 'transferencia',
  to_location_id: '',
  to_responsible_id: '',
  to_status: null,
  expected_return_at: '',
  note: '',
}

interface MovementFormModalProps {
  open: boolean
  workspaceId: string | null
  asset: { id: string; status: AssetStatus; location_id: string | null; responsible_id: string | null; condition: string }
  references: PatrimonioReferences
  onClose: () => void
  onSaved: (movement: AssetMovement) => void
}

function humanizeError(err: PatrimonioError): string {
  switch (err.code) {
    case 'permission_denied':
      return 'Sem permissão para registrar movimentação nesta unidade.'
    case 'invalid_reference':
      return 'O local ou responsável selecionado não é válido para esta unidade.'
    case 'invalid_value':
      return 'Valor inválido para esta operação. Verifique as regras de estado.'
    case 'conflict':
      return 'Conflito ao registrar a movimentação.'
    case 'no_workspace':
      return 'Nenhuma unidade ativa selecionada.'
    case 'validation':
      return err.message
    default:
      return 'Falha de rede ao registrar. Tente novamente.'
  }
}

function getStatusOptionsForType(type: MovementType): readonly string[] {
  switch (type) {
    case 'transferencia':
      return TRANSFER_TARGET_STATUSES
    case 'responsavel':
      return RESPONSIBLE_TARGET_STATUSES
    case 'inventario':
      return INVENTORY_TARGET_STATUSES
    case 'emprestimo':
      return ['emprestado']
    case 'devolucao':
      return ['disponivel', 'em_uso']
    case 'manutencao':
      return ['manutencao']
    case 'baixa':
      return ['baixado']
    case 'correcao':
      return ASSET_STATUSES
    default:
      return []
  }
}

function getDefaultStatusForType(type: MovementType, currentStatus: AssetStatus): AssetStatus | null {
  const options = getStatusOptionsForType(type)
  if (options.length === 0) return null
  if (type === 'devolucao') return 'disponivel'
  if (type === 'correcao') return currentStatus
  return options[0] as AssetStatus
}

function requiresLocation(type: MovementType): boolean {
  return type === 'transferencia'
}

function requiresResponsible(type: MovementType): boolean {
  return type === 'responsavel' || type === 'emprestimo'
}

function requiresExpectedReturn(type: MovementType): boolean {
  return type === 'emprestimo'
}

function requiresStatus(type: MovementType): boolean {
  return type !== 'manutencao' && type !== 'baixa'
}

function getTypeDescription(type: MovementType): string {
  switch (type) {
    case 'transferencia':
      return 'Mudar a localização do equipamento'
    case 'responsavel':
      return 'Transferir a responsabilidade para outra pessoa'
    case 'emprestimo':
      return 'Registrar empréstimo com data de devolução prevista'
    case 'devolucao':
      return 'Registrar devolução de empréstimo'
    case 'manutencao':
      return 'Enviar para manutenção'
    case 'baixa':
      return 'Dar baixa definitiva no equipamento (terminal)'
    case 'inventario':
      return 'Registrar resultado de contagem de inventário'
    case 'correcao':
      return 'Corrigir registro anterior (apenas status)'
    default:
      return ''
  }
}

export function MovementFormModal({
  open,
  workspaceId,
  asset,
  references,
  onClose,
  onSaved,
}: MovementFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [serverError, setServerError] = useState<PatrimonioError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lockedWorkspaceId, setLockedWorkspaceId] = useState<string | null>(null)
  const busyRef = useRef(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    if (!open) {
      setLockedWorkspaceId(null)
      busyRef.current = false
      setSubmitting(false)
      setServerError(null)
      return
    }
    setLockedWorkspaceId(workspaceId)
    setForm(EMPTY)
    setServerError(null)
    setSubmitting(false)
    busyRef.current = false
  }, [open])

  const unlocked = open && !!lockedWorkspaceId && !!workspaceId
  const workspaceChanged = unlocked && workspaceId !== lockedWorkspaceId
  const isDamaged = asset.condition === 'danificado'

  const statusOptions = requiresStatus(form.type)
    ? getStatusOptionsForType(form.type)
    : ([] as readonly string[])
  const defaultStatus = getDefaultStatusForType(form.type, asset.status)

  useEffect(() => {
    if (requiresStatus(form.type) && !form.to_status && defaultStatus) {
      set('to_status', defaultStatus)
    }
  }, [form.type, defaultStatus])

  function validate(): PatrimonioError | null {
    if (!REGISTRABLE_MOVEMENT_TYPES.includes(form.type)) {
      return validationError('Tipo de movimentação inválido.')
    }
    if (requiresLocation(form.type) && !form.to_location_id) {
      return validationError('Transferência exige o local de destino.')
    }
    if (requiresResponsible(form.type) && !form.to_responsible_id) {
      return validationError('Esta operação exige um responsável de destino.')
    }
    if (requiresExpectedReturn(form.type) && (!form.expected_return_at || isNaN(new Date(form.expected_return_at).getTime()))) {
      return validationError('Empréstimo exige uma data de devolução prevista válida.')
    }
    if (requiresStatus(form.type) && form.to_status && !statusOptions.includes(form.to_status)) {
      return validationError('Status de destino inválido para esta operação.')
    }
    if (form.to_location_id) {
      const ok = references.locations.some((l) => l.id === form.to_location_id)
      if (!ok) return validationError('O local de destino não pertence a esta unidade.')
    }
    if (form.to_responsible_id) {
      const ok = references.responsibles.some((r) => r.id === form.to_responsible_id)
      if (!ok) return validationError('O responsável de destino não pertence a esta unidade.')
    }
    if (form.type === 'devolucao' && asset.status !== 'emprestado') {
      return validationError('Só é possível devolver um equipamento que está emprestado.')
    }
    if (form.type === 'baixa' && asset.status === 'baixado') {
      return validationError('Este equipamento já está baixado.')
    }
    if (form.type === 'emprestimo' && asset.status === 'emprestado') {
      return validationError('Este equipamento já está emprestado — registre a devolução primeiro.')
    }
    if (asset.status === 'baixado' && form.type !== 'correcao') {
      return validationError('Equipamento baixado é terminal — apenas correção é permitida.')
    }
    if (form.to_location_id && form.type === 'transferencia') {
      const currentLoc = references.locationLabel(asset.location_id)
      const targetLoc = references.locationLabel(form.to_location_id)
      if (currentLoc && targetLoc && currentLoc === targetLoc) {
        return validationError('Origem e destino são iguais — nenhuma transferência necessária.')
      }
    }
    if (form.to_responsible_id && form.type === 'responsavel') {
      const currentResp = references.responsibleLabel(asset.responsible_id)
      const targetResp = references.responsibleLabel(form.to_responsible_id)
      if (currentResp && targetResp && currentResp === targetResp) {
        return validationError('O responsável informado já é o atual — nenhuma alteração necessária.')
      }
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!unlocked || workspaceChanged || busyRef.current) return
    const localError = validate()
    if (localError) {
      setServerError(localError)
      return
    }
    busyRef.current = true
    setSubmitting(true)
    setServerError(null)
    try {
      const toStatus = form.to_status == null ? undefined : (form.to_status as AssetStatus)
      const input = {
        asset_id: asset.id,
        type: form.type,
        to_location_id: form.to_location_id || null,
        to_responsible_id: form.to_responsible_id || null,
        to_status: toStatus,
        expected_return_at: form.expected_return_at || null,
        note: form.note.trim() || null,
      } as AssetMovementInput
      const saved = await movementsRepository.register(input)
      onSaved(saved)
      onClose()
    } catch (err) {
      setServerError(toPatrimonioError(err))
    } finally {
      busyRef.current = false
      setSubmitting(false)
    }
  }

  function handleClose() {
    if (busyRef.current) return
    onClose()
  }

  const inputCls =
    'w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60'
  const labelCls = 'mb-1 block text-xs font-medium text-fg-muted'
  const currentLocation = references.locationLabel(asset.location_id) ?? 'Não informado'
  const currentResponsible = references.responsibleLabel(asset.responsible_id) ?? 'Sem responsável'
  const currentStatusLabel = ASSET_STATUS_LABELS[asset.status]

  const movementTypeOptions = REGISTRABLE_MOVEMENT_TYPES

  return (
    <Modal open={open} onClose={handleClose} title="Movimentar bem">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate data-testid="movement-form">
        {workspaceChanged && (
          <div className="rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-600 dark:text-amber-400">
            A unidade de trabalho mudou durante o preenchimento. Feche e reabra para continuar.
          </div>
        )}
        {serverError && (
          <div role="alert" className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400">
            {humanizeError(serverError)}
          </div>
        )}

        <div className="rounded-xl bg-input/50 px-3.5 py-2.5">
          <p className="text-xs font-medium text-fg-muted">Bem atual</p>
          <dl className="mt-1.5 grid grid-cols-1 gap-y-1 sm:grid-cols-3 text-sm">
            <div>
              <dt className="text-fg-dim">Local</dt>
              <dd className="text-fg">{currentLocation}</dd>
            </div>
            <div>
              <dt className="text-fg-dim">Responsável</dt>
              <dd className="text-fg">{currentResponsible}</dd>
            </div>
            <div>
              <dt className="text-fg-dim">Status</dt>
              <dd className="text-fg">{currentStatusLabel}</dd>
            </div>
          </dl>
        </div>

        <div>
          <label className={labelCls}>Tipo de movimentação <span className="text-red-500">*</span></label>
          <select
            aria-label="Tipo de movimentação"
            value={form.type}
            onChange={(e) => set('type', e.target.value as MovementType)}
            disabled={!unlocked || workspaceChanged}
            className={inputCls}
          >
            {movementTypeOptions.map((t) => (
              <option key={t} value={t}>{ASSET_MOVEMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <p className="text-xs text-fg-dim">{getTypeDescription(form.type)}</p>

        {requiresLocation(form.type) && (
          <div>
            <label className={labelCls}>Local de destino <span className="text-red-500">*</span></label>
            <select
              aria-label="Local de destino"
              value={form.to_location_id}
              onChange={(e) => set('to_location_id', e.target.value)}
              disabled={!unlocked || workspaceChanged || references.loading || !!references.error}
              className={inputCls}
            >
              <option value="">Selecione o local...</option>
              {references.locations.map((l) => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
          </div>
        )}

        {requiresResponsible(form.type) && (
          <div>
            <label className={labelCls}>Responsável de destino <span className="text-red-500">*</span></label>
            <select
              aria-label="Responsável de destino"
              value={form.to_responsible_id}
              onChange={(e) => set('to_responsible_id', e.target.value)}
              disabled={!unlocked || workspaceChanged || references.loading || !!references.error}
              className={inputCls}
            >
              <option value="">Selecione o responsável...</option>
              {references.responsibles.map((r) => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </select>
          </div>
        )}

        {requiresExpectedReturn(form.type) && (
          <div>
            <label className={labelCls}>Devolução prevista <span className="text-red-500">*</span></label>
            <input
              type="datetime-local"
              aria-label="Data e hora de devolução prevista"
              value={form.expected_return_at}
              onChange={(e) => set('expected_return_at', e.target.value)}
              disabled={!unlocked || workspaceChanged}
              className={inputCls}
            />
          </div>
        )}

        {requiresStatus(form.type) && (
          <div>
            <label className={labelCls}>Status de destino <span className="text-red-500">*</span></label>
            <select
              aria-label="Status de destino"
              value={form.to_status ?? ''}
              onChange={(e) => set('to_status', (e.target.value || null) as AssetStatus | null)}
              disabled={!unlocked || workspaceChanged}
              className={inputCls}
            >
              <option value="">Selecione o status...</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{ASSET_STATUS_LABELS[s as AssetStatus]}</option>
              ))}
            </select>
          </div>
        )}

        {!requiresStatus(form.type) && form.type !== 'correcao' && (
          <p className="text-xs text-fg-muted">
            Status será alterado automaticamente para <strong>{ASSET_STATUS_LABELS[(getDefaultStatusForType(form.type, asset.status) ?? 'disponivel') as AssetStatus]}</strong>.
          </p>
        )}

        <div>
          <label className={labelCls}>Observação</label>
          <textarea
            aria-label="Observação ou motivo"
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="Motivo, detalhes, especificações..."
            rows={2}
            disabled={!unlocked || workspaceChanged}
            className={`${inputCls} resize-none`}
          />
        </div>

        {asset.status === 'baixado' && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Este equipamento está <strong>baixado</strong>. Apenas <strong>correção</strong> é permitida.
          </p>
        )}

        {isDamaged && (
          <p className="text-xs text-red-600 dark:text-red-400">
            Este equipamento está marcado como <strong>danificado</strong>. A condição física não muda por movimentação.
          </p>
        )}

        {(!!references.error || references.loading) && (
          <p className="text-[11px] text-red-500">
            Não foi possível carregar locais e responsáveis desta unidade — o formulário fica bloqueado.
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
          <button
            type="button"
            onClick={handleClose}
            disabled={!unlocked || submitting}
            className="rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 disabled:opacity-50 btn-interactive"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!unlocked || workspaceChanged || submitting}
            className="flex-1 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-2.5 text-sm font-medium text-white transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 btn-interactive"
          >
            {submitting ? 'Registrando...' : 'Registrar movimentação'}
          </button>
        </div>
      </form>
    </Modal>
  )
}