import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspaces } from '../../../core/workspaces/useWorkspaces'
import { workspaceStore } from '../../../core/workspaces/store'
import { useAuth } from '../../../core/auth/useAuth'
import { ticketService } from '../../chamados/services/ticketService'
import { roomService } from '../../chamados/services/roomService'
import { PROBLEM_AREA_LABELS, TICKET_PROBLEM_CATEGORIES } from '../../chamados/types'
import type { TicketFormData, TicketProblemArea } from '../../chamados/types'
import { OnboardingTour, markTourDone } from '../components/OnboardingTour'
import { icons } from '../../../lib/icons'

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

export function RoomTicketForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { workspaces, loading: loadingWorkspaces } = useWorkspaces()

  const urlRoom = searchParams.get('room') || ''
  const urlWorkspace = searchParams.get('workspace') || ''
  const [campusId, setCampusId] = useState(urlWorkspace)
  const [roomName, setRoomName] = useState(urlRoom)
  const [area, setArea] = useState<TicketProblemArea | ''>('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [reportedBy, setReportedBy] = useState('')
  const [reportedByEmail, setReportedByEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Tour fica disponível via botão 'Como funciona?' — nunca abre por cima dos campos.
  const [tourVisible, setTourVisible] = useState(false)

  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const campusRef = useRef<HTMLElement>(null)
  const roomRef = useRef<HTMLElement>(null)
  const areaRef = useRef<HTMLElement>(null)
  const categoryRef = useRef<HTMLElement>(null)
  const detailsRef = useRef<HTMLElement>(null)

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

  const canSubmit =
    !!campusId &&
    roomName.trim().length > 0 &&
    !!area &&
    !!category &&
    description.trim().length > 0 &&
    reportedBy.trim().length > 0 &&
    !submitting

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!campusId || !area || !category || !description.trim() || !reportedBy.trim()) return

    setSubmitting(true)
    setError('')

    const data: TicketFormData = {
      workspace_id: campusId,
      roomId: '',
      roomName: roomName.trim(),
      assetName: '',
      problemCategory: category,
      problemArea: area,
      problemDescription: description,
      status: 'aberto',
      reportedBy: reportedBy.trim(),
      reportedByEmail: reportedByEmail.trim(),
      assignedTo: '',
    }

    try {
      const ticket = await ticketService.create(data)
      markTourDone()
      navigate(`/chamados-publico/success/${ticket.id}`)
    } catch (err) {
      setSubmitting(false)
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o chamado. Tente novamente.')
    }
  }

  const inputClass =
    'w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500'

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

      <form onSubmit={handleSubmit} className="space-y-6">
        <section ref={campusRef} aria-label="Campus">
          <p className="mb-2 text-xs font-semibold text-fg-muted">
            1 · Qual o campus? <span className="text-red-500">*</span>
          </p>
          {loadingWorkspaces ? (
            <p className="text-sm text-fg-dim">Carregando campi...</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setCampusId(w.id)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-all ${
                    campusId === w.id
                      ? 'border-emerald-500 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400'
                      : 'border-line bg-card text-fg hover:border-fg-muted'
                  }`}
                >
                  <icons.ui.mapPin size={16} className="shrink-0" />
                  <span className="line-clamp-2">{w.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section ref={roomRef} aria-label="Sala">
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
              className={inputClass}
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
        </section>

        <section ref={areaRef} aria-label="Área">
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
                  onClick={() => setArea(opt.value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all ${
                    selected
                      ? 'border-emerald-500 bg-emerald-500/10'
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
        </section>

        <section ref={categoryRef} aria-label="Tipo de problema">
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
                  onClick={() => setCategory(cat)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-all ${
                    selected
                      ? 'border-emerald-500 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400'
                      : 'border-line bg-card text-fg hover:border-fg-muted'
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  {cat}
                </button>
              )
            })}
          </div>
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

        <section ref={detailsRef} aria-label="Detalhes">
          <label htmlFor="description" className="mb-1.5 block text-xs font-semibold text-fg-muted">
            5 · Descreva o que aconteceu <span className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: A internet da sala caiu às 10h e não voltou..."
            rows={3}
            className={inputClass}
          />

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
            onChange={(e) => setReportedBy(e.target.value)}
            placeholder="Nome do professor"
            className={inputClass}
          />

          <label htmlFor="reportedByEmail" className="mt-4 mb-1.5 block text-xs font-semibold text-fg-muted">
            Email (opcional)
          </label>
          <input
            id="reportedByEmail"
            type="email"
            value={reportedByEmail}
            onChange={(e) => setReportedByEmail(e.target.value)}
            placeholder="email@exemplo.com"
            className={inputClass}
          />
        </section>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
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
