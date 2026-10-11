import { useEffect, useRef, useState } from 'react'
import {
  ASSET_CONDITIONS,
  ASSET_CONDITION_LABELS,
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  assetsRepository,
  toPatrimonioError,
  validationError,
  type AssetCondition,
  type AssetStatus,
  type PatrimonioAsset,
  type PatrimonioError,
} from '../../../core/patrimonio'
import type { PatrimonioReferences } from '../hooks/usePatrimonioReferences'
import { Modal } from '../../pcare/components/Modal'

interface FormState {
  name: string
  equipment_type: string
  equipment_type_custom: string
  asset_tag: string
  serial_number: string
  manufacturer: string
  model: string
  location_id: string
  responsible_id: string
  status: AssetStatus
  condition: AssetCondition
  notes: string
}

const EMPTY: FormState = {
  name: '',
  equipment_type: '',
  equipment_type_custom: '',
  asset_tag: '',
  serial_number: '',
  manufacturer: '',
  model: '',
  location_id: '',
  responsible_id: '',
  status: 'draft',
  condition: 'bom',
  notes: '',
}

interface AssetFormModalProps {
  open: boolean
  /** Unidade de trabalho ativa no MOMENTO (pode mudar enquanto o modal está aberto). */
  workspaceId: string | null
  /** Modo de edição: preenche o formulário com o bem existente. */
  initial: PatrimonioAsset | null
  references: PatrimonioReferences
  onClose: () => void
  /** Chamado após gravar com sucesso (o pai decide como atualizar a tela). */
  onSaved: (asset: PatrimonioAsset) => void
}

/** Lista de tipos sugeridos; "Outro" abre um campo de texto. */
const ASSET_TYPES_WITH_OTHER = [
  'Notebook',
  'Desktop',
  'Monitor',
  'Impressora',
  'Roteador',
  'Switch',
  'Projetor',
  'Tablet',
  'Telefone',
  'Câmera',
  'Outro',
]

function humanizeError(err: PatrimonioError): string {
  switch (err.code) {
    case 'conflict':
      return 'Já existe um bem com este patrimônio/etiqueta nesta unidade.'
    case 'invalid_reference':
      return 'O local ou responsável selecionado não é válido para esta unidade.'
    case 'permission_denied':
      return 'Sem permissão para gravar esta unidade.'
    case 'no_workspace':
      return 'Nenhuma unidade ativa selecionada — salve apenas dentro de uma unidade.'
    case 'validation':
      return err.message
    default:
      return 'Falha de rede ao salvar. Tente novamente.'
  }
}

function buildFormFromAsset(asset: PatrimonioAsset): FormState {
  const hasType = ASSET_TYPES_WITH_OTHER.includes(asset.equipment_type)
  return {
    name: asset.name,
    equipment_type: hasType ? asset.equipment_type : 'Outro',
    equipment_type_custom: hasType ? '' : asset.equipment_type,
    asset_tag: asset.asset_tag ?? '',
    serial_number: asset.serial_number ?? '',
    manufacturer: asset.manufacturer,
    model: asset.model,
    location_id: asset.location_id ?? '',
    responsible_id: asset.responsible_id ?? '',
    status: asset.status,
    condition: asset.condition,
    notes: asset.notes,
  }
}

export function AssetFormModal({ open, workspaceId, initial, references, onClose, onSaved }: AssetFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [serverError, setServerError] = useState<PatrimonioError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  /** Unidade travada na abertura — se mudar, o formulário é bloqueado. */
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
    setForm(initial ? buildFormFromAsset(initial) : EMPTY)
    setServerError(null)
    setSubmitting(false)
    busyRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const unlocked = open && !!lockedWorkspaceId && !!workspaceId
  const workspaceChanged = unlocked && workspaceId !== lockedWorkspaceId
  const isEdit = !!initial

  function resolveEquipmentType(): string {
    const pick =
      form.equipment_type === 'Outro' && form.equipment_type_custom.trim()
        ? form.equipment_type_custom.trim()
        : form.equipment_type
    return pick.trim()
  }

  function validate(): PatrimonioError | null {
    if (!form.name.trim()) return validationError('Informe o nome do equipamento.')
    if (!resolveEquipmentType()) return validationError('Informe o tipo do equipamento.')
    if (form.location_id) {
      const ok = references.locations.some((l) => l.id === form.location_id)
      if (!ok) return validationError('O local selecionado não pertence a esta unidade.')
    }
    if (form.responsible_id) {
      const ok = references.responsibles.some((r) => r.id === form.responsible_id)
      if (!ok) return validationError('O responsável selecionado não pertence a esta unidade.')
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
    const ws = lockedWorkspaceId as string
    busyRef.current = true
    setSubmitting(true)
    setServerError(null)
    try {
      const payload = {
        name: form.name.trim(),
        equipment_type: resolveEquipmentType(),
        asset_tag: form.asset_tag.trim() || null,
        serial_number: form.serial_number.trim() || null,
        manufacturer: form.manufacturer.trim(),
        model: form.model.trim(),
        location_id: form.location_id || null,
        responsible_id: form.responsible_id || null,
        status: form.status as AssetStatus,
        condition: form.condition as AssetCondition,
        notes: form.notes.trim(),
      }
      const saved = isEdit && initial
        ? await assetsRepository.update(initial.id, payload as Parameters<typeof assetsRepository.update>[1], ws)
        : await assetsRepository.create(payload, ws)
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

  const statusOptions = ASSET_STATUSES as readonly string[]
  const conditionOptions = ASSET_CONDITIONS as readonly string[]

  return (
    <Modal open={open} onClose={handleClose} title={isEdit ? 'Editar bem' : 'Cadastrar bem'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        {workspaceChanged && (
          <div className="rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-600 dark:text-amber-400">
            A unidade de trabalho mudou durante o preenchimento. Feche e reabra para continuar —
            a guarda impede salvar em outra unidade.
          </div>
        )}
        {serverError && (
          <div
            role="alert"
            className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400"
          >
            {humanizeError(serverError)}
          </div>
        )}

        {/* ── Identificação ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Nome do equipamento <span className="text-red-500">*</span></label>
            <input
              type="text"
              aria-label="Nome do equipamento"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Notebook Dell Latitude 7490"
              disabled={!unlocked || workspaceChanged}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Patrimônio / etiqueta</label>
            <input
              type="text"
              aria-label="Patrimônio"
              value={form.asset_tag}
              onChange={(e) => set('asset_tag', e.target.value)}
              placeholder="Sem patrimônio físico"
              disabled={!unlocked || workspaceChanged}
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Tipo de equipamento <span className="text-red-500">*</span></label>
            <select
              aria-label="Tipo de equipamento"
              value={form.equipment_type}
              onChange={(e) => set('equipment_type', e.target.value)}
              disabled={!unlocked || workspaceChanged}
              className={inputCls}
            >
              <option value="">Selecione...</option>
              {ASSET_TYPES_WITH_OTHER.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {form.equipment_type === 'Outro' && (
              <input
                type="text"
                aria-label="Tipo personalizado"
                value={form.equipment_type_custom}
                onChange={(e) => set('equipment_type_custom', e.target.value)}
                placeholder="Descreva o tipo (Ex: Nobreak)"
                disabled={!unlocked || workspaceChanged}
                className={`${inputCls} mt-1.5`}
              />
            )}
          </div>
          <div>
            <label className={labelCls}>Fabricante</label>
            <input
              type="text"
              aria-label="Fabricante"
              value={form.manufacturer}
              onChange={(e) => set('manufacturer', e.target.value)}
              placeholder="Ex: Dell"
              disabled={!unlocked || workspaceChanged}
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Modelo</label>
            <input
              type="text"
              aria-label="Modelo"
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              placeholder="Ex: Latitude 7490"
              disabled={!unlocked || workspaceChanged}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Nº de série</label>
            <input
              type="text"
              aria-label="Número de série"
              value={form.serial_number}
              onChange={(e) => set('serial_number', e.target.value)}
              placeholder="Ex: SN-2026-0001"
              disabled={!unlocked || workspaceChanged}
              className={inputCls}
            />
          </div>
        </div>

        {/* ── Custódia (só na criação; edição é via movimentação) ── */}
        <hr className="border-line" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
          {isEdit ? 'Custódia atual (histórico inviolável)' : 'Custódia inicial'}
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Local</label>
            {isEdit ? (
              <div className="flex h-[42px] items-center rounded-xl bg-input px-3.5 text-sm text-fg-dim">
                {references.locationLabel(initial?.location_id ?? null) ?? 'Não informado'}
              </div>
            ) : (
              <select
                aria-label="Local"
                value={form.location_id}
                onChange={(e) => set('location_id', e.target.value)}
                disabled={!unlocked || workspaceChanged || references.loading || !!references.error}
                className={inputCls}
              >
                <option value="">Não informado</option>
                {references.locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className={labelCls}>Responsável</label>
            {isEdit ? (
              <div className="flex h-[42px] items-center rounded-xl bg-input px-3.5 text-sm text-fg-dim">
                {references.responsibleLabel(initial?.responsible_id ?? null) ?? 'Não informado'}
              </div>
            ) : (
              <select
                aria-label="Responsável"
                value={form.responsible_id}
                onChange={(e) => set('responsible_id', e.target.value)}
                disabled={!unlocked || workspaceChanged || references.loading || !!references.error}
                className={inputCls}
              >
                <option value="">Não informado</option>
                {references.responsibles.map((r) => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        {!isEdit && !!references.error && (
          <p className="text-[11px] text-red-500">
            Não foi possível carregar locais e responsáveis desta unidade — os campos ficam bloqueados.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Status</label>
            {isEdit ? (
              <div className="flex h-[42px] items-center rounded-xl bg-input px-3.5 text-sm text-fg-dim">
                Alterado apenas por movimentação (fora desta tela)
              </div>
            ) : (
              <select
                aria-label="Status"
                value={form.status}
                onChange={(e) => set('status', e.target.value as AssetStatus)}
                disabled={!unlocked || workspaceChanged}
                className={inputCls}
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{ASSET_STATUS_LABELS[s as AssetStatus]}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className={labelCls}>Condição física</label>
            <select
              aria-label="Condição física"
              value={form.condition}
              onChange={(e) => set('condition', e.target.value as AssetCondition)}
              disabled={!unlocked || workspaceChanged}
              className={inputCls}
            >
              {conditionOptions.map((c) => (
                <option key={c} value={c}>{ASSET_CONDITION_LABELS[c as AssetCondition]}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Observações</label>
          <textarea
            aria-label="Observações"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Especificações, estado de recebimento..."
            rows={2}
            disabled={!unlocked || workspaceChanged}
            className={`${inputCls} resize-none`}
          />
        </div>

        {/* ── Ações ── */}
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
            {submitting
              ? isEdit ? 'Salvando...' : 'Cadastrando...'
              : isEdit ? 'Salvar alterações' : 'Cadastrar bem'}
          </button>
        </div>
      </form>
    </Modal>
  )
}