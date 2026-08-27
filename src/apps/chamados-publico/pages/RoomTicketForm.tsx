import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { workspaceStore } from '../../../core/workspaces/store'
import { usePublicWorkspaces } from '../hooks/usePublicWorkspaces'
import { useAuth } from '../../../core/auth/useAuth'
import { ticketService } from '../../chamados/services/ticketService'
import { roomService } from '../../chamados/services/roomService'
import { PROBLEM_AREA_LABELS, TICKET_PROBLEM_CATEGORIES } from '../../chamados/types'
import type { TicketFormData, TicketProblemArea } from '../../chamados/types'
import { OnboardingTour, markTourDone } from '../components/OnboardingTour'
import { icons } from '../../../lib/icons'
import { uploadPhoto } from '../utils/photo'

const AREA_OPTIONS: { value: TicketProblemArea; label: string; icon: (typeof icons.ui)[keyof typeof icons.ui] }[] = [
  { value: 'administrativa', label: PROBLEM_AREA_LABELS.administrativa, icon: icons.nav.settings },
  { value: 'academica', label: PROBLEM_AREA_LABELS.academica, icon: icons.ui.home },
]

const CATEGORY_ICONS: Record<string, (typeof icons.ui)[keyof typeof icons.ui]> = {
  Internet: icons.ui.plug,
  Projetor: icons.ui.tv,
  Áudio: icons.ui.volume2,
  Computador: icons.nav.pcs,
  Outros: icons.ui.alertCircle,
}

type FieldKey = 'campus' | 'room' | 'area' | 'category' | 'description' | 'reportedBy'

const FIELD_LABELS: Record<FieldKey, string> = {
  campus: 'Selecione o campus',
  room: 'Informe a sala',
  area: 'Selecione a área do problema',
  category: 'Selecione o tipo de problema',
  description: 'Descreva o que aconteceu',
  reportedBy: 'Informe seu nome',
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage indisponível — o fluxo segue sem persistência do token.
  }
}

export function RoomTicketForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const {
    workspaces,
    loading: loadingWorkspaces,
    error: workspacesError,
    reload: reloadWorkspaces,
  } = usePublicWorkspaces()

  const urlRoom = searchParams.get('room') || ''
  const urlWorkspace = searchParams.get('workspace') || ''
  const [campusId, setCampusId] = useState(urlWorkspace)
  const [roomName, setRoomName] = useState(urlRoom)
  const [area, setArea] = useState<TicketProblemArea | ''>('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [reportedBy, setReportedBy] = useState('')
  const [reportedByEmail, setReportedByEmail] = useState('')
  const [photo, setPhoto] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tour fica disponível via botão 'Como funciona?' — nunca abre por cima dos campos.
  const [tourVisible, setTourVisible] = useState(false)

  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const campusRef = useRef<HTMLElement>(null)
  const roomRef = useRef<HTMLElement>(null)
  const areaRef = useRef<HTMLElement>(null)
  const categoryRef = useRef<HTMLElement>(null)
  const detailsRef = useRef<HTMLElement>(null)

  const fieldRefs: Record<FieldKey, React.RefObject<HTMLElement | null>> = {
    campus: campusRef,
    room: roomRef,
    area: areaRef,
    category: categoryRef,
    description: detailsRef,
    reportedBy: detailsRef,
  }

  useEffect(() => {
    if (!user?.name) return
    setReportedBy((prev) => prev || user.name)
  }, [user?.name])

  useEffect(() => {
    if (loadingWorkspaces || workspaces.length === 0) return
    const valid = !!campusId && workspaces.some((w) => w.id === campusId)
    if (!valid) {
      const active = workspaceStore.activeWorkspaceId
      setCampusId(active && workspaces.some((w) => w.id === active) ? active : '')
    }
  }, [workspaces, loadingWorkspaces, campusId])

  const campus = workspaces.find((w) => w.id === campusId)

  const roomSuggestions = useMemo(() => {
    if (!campusId) return []
    const query = roomName.trim().toLowerCase()
    const all = roomService
      .getAllUnfiltered()
      .filter((r) => !r.workspace_id || r.workspace_id === campusId)
    const matches = query ? all.filter((r) => r.name.toLowerCase().includes(query)) : all
    return matches.slice(0, 8)
  }, [roomName, campusId])

  const allFieldsFilled =
    !!campusId &&
    roomName.trim().length > 0 &&
    !!area &&
    !!category &&
    description.trim().length > 0 &&
    reportedBy.trim().length > 0

  const openForRoom = useMemo(() => {
    if (!roomName.trim()) return []
    return ticketService
      .query((t) => t.roomName === roomName.trim() && (t.status === 'aberto' || t.status === 'em_atendimento'))
      .slice(0, 3)
  }, [roomName])

  const tourSteps = [
    {
      key: 'campus',
      target: () => campusRef.current,
      title: 'Onde você está?',
      description:
        'Escolha o campus da sua escola. Isso garante que o chamado chegue para a equipe de TI certa.',
    },
    {
      key: 'problema',
      target: () => categoryRef.current,
      title: 'Qual o problema?',
      description:
        'Toque no tipo de problema: internet, projetor, áudio, computador ou outros. Depois indique a área.',
    },
    {
      key: 'detalhes',
      target: () => detailsRef.current,
      title: 'Conte o que aconteceu',
      description:
        'Escreva o que está acontecendo e informe seu nome. Pronto — seu chamado vai direto para o TI!',
    },
  ]

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
    if (!roomName.trim()) errors.room = FIELD_LABELS.room
    if (!area) errors.area = FIELD_LABELS.area
    if (!category) errors.category = FIELD_LABELS.category
    if (!description.trim()) errors.description = FIELD_LABELS.description
    if (!reportedBy.trim()) errors.reportedBy = FIELD_LABELS.reportedBy
    return errors
  }, [campusId, roomName, area, category, description, reportedBy])

  function clearFieldError(key: FieldKey) {
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoError('')
    try {
      setPhoto(await uploadPhoto(file))
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Não foi possível carregar a foto.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const firstKey = (['campus', 'room', 'area', 'category', 'description', 'reportedBy'] as FieldKey[]).find(
        (k) => errors[k],
      )
      if (firstKey) scrollToField(firstKey)
      return
    }

    setSubmitting(true)
    setError('')
    setFieldErrors({})

    const data: TicketFormData = {
      workspace_id: campusId,
      roomId: '',
      roomName: roomName.trim(),
      assetName: '',
      problemCategory: category,
      problemArea: area as TicketProblemArea,
      problemDescription: description,
      status: 'aberto',
      reportedBy: reportedBy.trim(),
      reportedByEmail: reportedByEmail.trim(),
      assignedTo: '',
      photos: photo,
    }

    try {
      const { ticket, trackingToken } = await ticketService.createWithToken(data)
      markTourDone()
      if (!ticket.id) throw new Error('Chamado criado sem ID')
      // O tracking token é a credencial do professor (acesso ao próprio chamado).
      // Persistimos para conveniência e passamos pela URL para o success page.
      safeLocalStorageSet(`chamado_token_${ticket.id}`, trackingToken)
      navigate(`/chamados-publico/success/${ticket.id}?token=${encodeURIComponent(trackingToken)}`)
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o chamado. Tente novamente.')
    }
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
    <div className="min-h-dvh bg-surface px-4 pt-6 pb-10">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-fg">Abrir Chamado</h1>
        <p className="mt-1 text-sm text-fg-muted">Leva menos de 1 minuto</p>
        <button
          type="button"
          onClick={() => setTourVisible(true)}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[11px] font-medium text-fg-muted transition-colors hover:border-emerald-500/40 hover:text-fg"
        >
          <icons.ui.alertCircle size={12} />
          Como funciona?
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <icons.ui.alertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

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

      <form onSubmit={handleSubmit} className="space-y-6">
        <section ref={campusRef} tabIndex={-1} aria-label="Campus">
          <p className="mb-2 text-xs font-semibold text-fg-muted">
            1 · Qual o campus? <span className="text-red-500">*</span>
          </p>
          {loadingWorkspaces ? (
            <p className="text-sm text-fg-dim">Carregando campi...</p>
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
              <div className="grid grid-cols-2 gap-2">
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => { setCampusId(w.id); clearFieldError('campus') }}
                    className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-all ${
                      campusId === w.id
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
        </section>

        <section ref={roomRef} tabIndex={-1} aria-label="Sala">
          <label htmlFor="room" className="mb-2 block text-xs font-semibold text-fg-muted">
            2 · Qual a sala? <span className="text-red-500">*</span>
          </label>
          {urlRoom && (
            <p className="mb-1.5 flex items-center gap-1 text-[11px] text-fg-dim">
              <icons.ui.home size={12} />
              Sala vinda do QR Code — ajuste se necessário
            </p>
          )}
          <div className="relative">
            <input
              id="room"
              type="text"
              value={roomName}
              onChange={(e) => {
                setRoomName(e.target.value)
                setSuggestionsOpen(true)
                setHighlightedIndex(-1)
                clearFieldError('room')
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => setSuggestionsOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHighlightedIndex((i) => (i < roomSuggestions.length - 1 ? i + 1 : i))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHighlightedIndex((i) => (i > 0 ? i - 1 : i))
                } else if (e.key === 'Enter' && highlightedIndex >= 0 && roomSuggestions[highlightedIndex]) {
                  e.preventDefault()
                  setRoomName(roomSuggestions[highlightedIndex].name)
                  setSuggestionsOpen(false)
                  setHighlightedIndex(-1)
                } else if (e.key === 'Escape') {
                  setSuggestionsOpen(false)
                }
              }}
              placeholder="Ex: Sala 101, Laboratório 2"
              autoComplete="off"
              className={fieldInputClass('room')}
            />
            {suggestionsOpen && campusId && roomSuggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-line bg-card shadow-[var(--shadow-card)]">
                {roomSuggestions.map((r, i) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setRoomName(r.name)
                        setSuggestionsOpen(false)
                        setHighlightedIndex(-1)
                      }}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                        i === highlightedIndex
                          ? 'bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400'
                          : 'text-fg'
                      }`}
                    >
                      <icons.ui.home size={14} className="shrink-0 text-fg-dim" />
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <FieldError fieldKey="room" />
        </section>

        <section ref={areaRef} tabIndex={-1} aria-label="Área">
          <p className="mb-2 text-xs font-semibold text-fg-muted">
            3 · Qual a área? <span className="text-red-500">*</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {AREA_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const selected = area === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setArea(opt.value); clearFieldError('area') }}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all ${
                    selected
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : fieldErrors.area
                        ? 'border-red-500/50 bg-card hover:border-fg-muted'
                        : 'border-line bg-card hover:border-fg-muted'
                  }`}
                >
                  <Icon size={20} className={selected ? 'text-emerald-500' : 'text-fg-muted'} />
                  <span
                    className={`text-xs leading-snug ${
                      selected ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-fg'
                    }`}
                  >
                    {opt.label}
                  </span>
                </button>
              )
            })}
          </div>
          <FieldError fieldKey="area" />
        </section>

        <section ref={categoryRef} tabIndex={-1} aria-label="Tipo de problema">
          <p className="mb-2 text-xs font-semibold text-fg-muted">
            4 · Qual o problema? <span className="text-red-500">*</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TICKET_PROBLEM_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat] || icons.ui.alertCircle
              const selected = category === cat
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setCategory(cat); clearFieldError('category') }}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-all ${
                    selected
                      ? 'border-emerald-500 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400'
                      : fieldErrors.category
                        ? 'border-red-500/50 bg-card text-fg hover:border-fg-muted'
                        : 'border-line bg-card text-fg hover:border-fg-muted'
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  {cat}
                </button>
              )
            })}
          </div>
          <FieldError fieldKey="category" />
        </section>

        {openForRoom.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <icons.ui.alertTriangle size={16} className="mt-0.5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Já existe chamado aberto para esta sala.
              </p>
              <p className="mt-0.5 text-[11px] text-emerald-600/70 dark:text-emerald-400/70">
                Nº {openForRoom.map((t) => `#${t.ticketNumber}`).join(', ')}
              </p>
            </div>
          </div>
        )}

        <section ref={detailsRef} tabIndex={-1} aria-label="Detalhes">
          <label htmlFor="description" className="mb-1.5 block text-xs font-semibold text-fg-muted">
            5 · Descreva o que aconteceu <span className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => { setDescription(e.target.value); clearFieldError('description') }}
            placeholder="Ex: A internet da sala caiu às 10h e não voltou..."
            rows={3}
            className={fieldInputClass('description')}
          />
          <FieldError fieldKey="description" />

          <div className="mt-3 flex items-center gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden"
            />
            {photo ? (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line">
                <img src={photo} alt="Foto do problema" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhoto('')}
                  aria-label="Remover foto"
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-fg text-surface shadow-[var(--shadow-card)]"
                >
                  <icons.ui.close size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-line bg-card px-3 py-2 text-[11px] font-medium text-fg-muted transition-colors hover:border-emerald-500/40 hover:text-fg"
              >
                <icons.ui.camera size={14} />
                Anexar foto (opcional)
              </button>
            )}
            {photo && (
              <span className="text-[11px] text-fg-dim">Foto adicionada — o TI verá no chamado</span>
            )}
          </div>
          {photoError && <p className="mt-1.5 text-[11px] text-red-500">{photoError}</p>}

          <label htmlFor="reportedBy" className="mt-4 mb-1.5 block text-xs font-semibold text-fg-muted">
            Seu nome <span className="text-red-500">*</span>
          </label>
          {user?.name && (
            <p className="mb-1.5 flex items-center gap-1 text-[11px] text-fg-dim">
              <icons.ui.userCheck size={12} />
              Identificado como {user.name} — ajuste se necessário
            </p>
          )}
          <input
            id="reportedBy"
            type="text"
            value={reportedBy}
            onChange={(e) => { setReportedBy(e.target.value); clearFieldError('reportedBy') }}
            placeholder="Nome do professor"
            className={fieldInputClass('reportedBy')}
          />
          <FieldError fieldKey="reportedBy" />

          <label htmlFor="reportedByEmail" className="mt-4 mb-1.5 block text-xs font-semibold text-fg-muted">
            Email (opcional)
          </label>
          <input
            id="reportedByEmail"
            type="email"
            value={reportedByEmail}
            onChange={(e) => setReportedByEmail(e.target.value)}
            placeholder="email@exemplo.com"
            className={inputClass + ' border-line focus:border-emerald-500 focus:ring-emerald-500'}
          />
        </section>

        <button
          type="submit"
          disabled={submitting}
          className={`w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-colors ${
            allFieldsFilled && !submitting
              ? 'bg-emerald-500 hover:bg-emerald-400'
              : 'bg-emerald-500/50 cursor-not-allowed'
          }`}
        >
          {submitting ? 'Abrindo chamado...' : 'Abrir Chamado'}
        </button>

        <p className="pb-4 text-center text-[11px] text-fg-dim">
          Seu chamado vai direto para a equipe de TI de {campus?.name || 'sua unidade'}.
        </p>
      </form>

      {tourVisible && !loadingWorkspaces && (
        <OnboardingTour steps={tourSteps} onClose={() => setTourVisible(false)} />
      )}
    </div>
  )
}
