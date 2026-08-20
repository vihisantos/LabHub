import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useRoomAssets } from '../../chamados/hooks/useRoomAssets'
import { useProblemTemplates } from '../../chamados/hooks/useProblemTemplates'
import { roomService } from '../../chamados/services/roomService'
import { ticketService } from '../../chamados/services/ticketService'
import { usePublicWorkspaces } from '../hooks/usePublicWorkspaces'
import { icons } from '../../../lib/icons'
import type { TicketFormData } from '../../chamados/types'

type FieldKey = 'campus' | 'category' | 'reportedBy'

const FIELD_LABELS: Record<FieldKey, string> = {
  campus: 'Selecione o campus',
  category: 'Selecione o tipo de problema',
  reportedBy: 'Informe seu nome',
}

export function TicketForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roomId = searchParams.get('room') || ''
  const assetId = searchParams.get('asset') || ''
  const assetSource = (searchParams.get('source') || 'stock') as TicketFormData['assetSource']
  const urlWorkspace = searchParams.get('workspace') || ''

  const rooms = roomService.getAllUnfiltered()
  const room = rooms.find((r) => r.id === roomId)
  const roomWorkspaceId = room?.workspace_id || ''
  const { assets } = useRoomAssets(room?.name || '')
  const asset = assets.find((a) => a.id === assetId && a.source === assetSource)

  const { getByAssetType } = useProblemTemplates()

  const {
    workspaces,
    loading: loadingWorkspaces,
    error: workspacesError,
    reload: reloadWorkspaces,
  } = usePublicWorkspaces()

  const [campusId, setCampusId] = useState(urlWorkspace || roomWorkspaceId)

  useEffect(() => {
    if (campusId || !roomWorkspaceId) return
    setCampusId(roomWorkspaceId)
  }, [campusId, roomWorkspaceId])

  useEffect(() => {
    if (loadingWorkspaces || !campusId) return
    if (!workspaces.some((w) => w.id === campusId)) {
      setCampusId('')
    }
  }, [campusId, workspaces, loadingWorkspaces])

  const template = useMemo(() => {
    if (!asset) return null
    return getByAssetType(asset.type)
  }, [asset, getByAssetType])

  const categories = template?.categories || ['Outro']

  const [selectedCategory, setSelectedCategory] = useState('')
  const [description, setDescription] = useState('')
  const [reportedBy, setReportedBy] = useState('')
  const [reportedByEmail, setReportedByEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})

  const campusRef = useRef<HTMLDivElement>(null)
  const categoryRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const fieldRefs: Record<FieldKey, React.RefObject<HTMLElement | null>> = {
    campus: campusRef as React.RefObject<HTMLElement | null>,
    category: categoryRef as React.RefObject<HTMLElement | null>,
    reportedBy: nameRef as React.RefObject<HTMLElement | null>,
  }

  const openTickets = useMemo(() => {
    if (!asset) return []
    return ticketService.getOpenByAsset(asset.id, asset.source)
  }, [asset])

  function scrollToField(key: FieldKey) {
    const ref = fieldRefs[key]
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      ref.current.focus()
    }
  }

  const validate = useCallback((): Partial<Record<FieldKey, string>> => {
    const errors: Partial<Record<FieldKey, string>> = {}
    if (!campusId) errors.campus = FIELD_LABELS.campus
    if (!selectedCategory) errors.category = FIELD_LABELS.category
    if (!reportedBy.trim()) errors.reportedBy = FIELD_LABELS.reportedBy
    return errors
  }, [campusId, selectedCategory, reportedBy])

  function clearFieldError(key: FieldKey) {
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const firstKey = (['campus', 'category', 'reportedBy'] as FieldKey[]).find((k) => errors[k])
      if (firstKey) scrollToField(firstKey)
      return
    }

    setSubmitting(true)
    setFieldErrors({})
    setSubmitError('')

    try {
      const ticket = await ticketService.create({
        workspace_id: campusId,
        roomId: room!.id,
        roomName: room!.name,
        assetId: asset!.id,
        assetSource: asset!.source,
        assetName: asset!.name,
        assetPatrimony: asset!.patrimony,
        problemCategory: selectedCategory,
        problemDescription: description,
        status: 'aberto',
        reportedBy: reportedBy.trim(),
        reportedByEmail: reportedByEmail.trim(),
        assignedTo: '',
      })

      if (!ticket.id) throw new Error('Chamado criado sem ID')
      navigate(`/chamados-publico/success/${ticket.id}`)
    } catch {
      setSubmitError('Não foi possível abrir o chamado. Verifique sua conexão e tente novamente.')
      setSubmitting(false)
    }
  }

  if (!room || !asset) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-5">
        <icons.ui.alertCircle size={48} className="text-fg-muted" />
        <p className="mt-4 text-sm text-fg-muted">Dados não encontrados</p>
        <button
          type="button"
          onClick={() => navigate('/chamados-publico')}
          className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white"
        >
          Escanear novamente
        </button>
      </div>
    )
  }

  const inputClass =
    'w-full rounded-xl border bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:ring-1'

  function fieldInputClass(key: FieldKey) {
    const hasError = !!fieldErrors[key]
    const border = hasError ? 'border-red-500' : 'border-line'
    const focus = hasError
      ? 'focus:border-red-500 focus:ring-red-500'
      : 'focus:border-emerald-500 focus:ring-emerald-500'
    return `${inputClass} ${border} ${focus}`
  }

  function FieldError({ fieldKey }: { fieldKey: FieldKey }) {
    const msg = fieldErrors[fieldKey]
    if (!msg) return null
    return (
      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-red-500">
        <icons.ui.alertCircle size={12} />
        {msg}
      </p>
    )
  }

  return (
    <div className="min-h-dvh bg-surface px-4 pt-6 pb-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-fg">Abrir Chamado</h1>
      </div>

      {Object.keys(fieldErrors).length > 0 && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <p className="mb-1 text-xs font-medium text-red-600 dark:text-red-400">
            Preencha os campos obrigatórios:
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {Object.entries(fieldErrors).map(([, msg]) => (
              <li key={msg} className="text-[11px] text-red-600 dark:text-red-400">
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {submitError && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
            <icons.ui.alertCircle size={14} />
            {submitError}
          </p>
        </div>
      )}

      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold text-fg-muted">
          Qual o seu campus? <span className="text-red-500">*</span>
        </p>
        {loadingWorkspaces ? (
          <p className="text-sm text-fg-dim">Carregando campus...</p>
        ) : workspacesError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-xs text-red-600 dark:text-red-400">
              Não foi possível carregar os campi. Verifique sua conexão e tente novamente.
            </p>
            <button
              type="button"
              onClick={reloadWorkspaces}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[11px] font-medium text-fg-muted transition-colors hover:border-red-500/40 hover:text-fg"
            >
              <icons.ui.refresh size={12} />
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <div ref={campusRef} className="grid grid-cols-2 gap-2">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => { setCampusId(w.id); clearFieldError('campus') }}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-all ${campusId === w.id
                    ? 'border-emerald-500 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400'
                    : fieldErrors.campus
                      ? 'border-red-500/50 bg-card text-fg hover:border-fg-muted'
                      : 'border-line bg-card text-fg hover:border-fg-muted'
                    }`}
                >
                  <icons.ui.mapPin size={16} className="shrink-0" />
                  <span className="line-clamp-2">{w.name}</span>
                </button>
              ))}
            </div>
            <FieldError fieldKey="campus" />
          </>
        )}
      </div>

      <div className="mb-6 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <icons.ui.home size={14} />
          <span>{room.name}</span>
          <icons.ui.chevronRight size={12} />
          <span className="font-medium text-fg">{asset.name}</span>
        </div>
        {asset.patrimony && (
          <p className="mt-1 text-[11px] text-fg-dim">Patrimônio: {asset.patrimony}</p>
        )}
      </div>

      {openTickets.length > 0 && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div className="flex items-start gap-2">
            <icons.ui.alertTriangle size={16} className="mt-0.5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Já existe{openTickets.length > 1 ? 'm' : ''} chamado{openTickets.length > 1 ? 's' : ''} aberto{openTickets.length > 1 ? 's' : ''} para este equipamento.
              </p>
              <p className="mt-0.5 text-[11px] text-emerald-600/70 dark:text-emerald-400/70">
                Nº {openTickets.map((t) => `#${t.ticketNumber}`).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div ref={categoryRef}>
          <label className="mb-2 block text-xs font-semibold text-fg-muted">Qual o problema?</label>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => { setSelectedCategory(cat); clearFieldError('category') }}
                className={`rounded-xl border p-3 text-left text-sm transition-all ${selectedCategory === cat
                  ? 'border-emerald-500 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400'
                  : fieldErrors.category
                    ? 'border-red-500/50 bg-card text-fg hover:border-fg-muted'
                    : 'border-line bg-card text-fg hover:border-fg-muted'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <FieldError fieldKey="category" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Descreva mais detalhes (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: O computador não liga após queda de luz..."
            rows={3}
            className={`${inputClass} border-line focus:border-emerald-500 focus:ring-emerald-500`}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
            Seu nome <span className="text-red-500">*</span>
          </label>
          <input
            ref={nameRef}
            type="text"
            value={reportedBy}
            onChange={(e) => { setReportedBy(e.target.value); clearFieldError('reportedBy') }}
            placeholder="Nome do professor"
            className={fieldInputClass('reportedBy')}
          />
          <FieldError fieldKey="reportedBy" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Email (opcional)</label>
          <input
            type="email"
            value={reportedByEmail}
            onChange={(e) => setReportedByEmail(e.target.value)}
            placeholder="email@exemplo.com"
            className={`${inputClass} border-line focus:border-emerald-500 focus:ring-emerald-500`}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className={`w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-colors ${
            campusId && selectedCategory && reportedBy.trim() && !submitting
              ? 'bg-emerald-500 hover:bg-emerald-400'
              : 'bg-emerald-500/50 cursor-not-allowed'
          }`}
        >
          {submitting ? 'Abrindo chamado...' : 'Abrir Chamado'}
        </button>
      </form>
    </div>
  )
}
