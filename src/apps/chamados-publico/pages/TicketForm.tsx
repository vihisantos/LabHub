import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useRoomAssets } from '../../chamados/hooks/useRoomAssets'
import { useProblemTemplates } from '../../chamados/hooks/useProblemTemplates'
import { roomService } from '../../chamados/services/roomService'
import { ticketService } from '../../chamados/services/ticketService'
import { usePublicWorkspaces } from '../hooks/usePublicWorkspaces'
import { icons } from '../../../lib/icons'
import type { TicketFormData } from '../../chamados/types'

export function TicketForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roomId = searchParams.get('room') || ''
  const assetId = searchParams.get('asset') || ''
  const assetSource = (searchParams.get('source') || 'stock') as TicketFormData['assetSource']
  const urlWorkspace = searchParams.get('workspace') || ''

  // Fluxo público: busca a sala sem filtro de workspace, para o QR funcionar
  // independente de sessão/resíduo do navegador.
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

  // Campus confiável: vem da URL (QR com workspace) ou do workspace da sala.
  // NUNCA cai no workspace ativo do navegador — isso poderia mandar o chamado
  // para o campus errado. Sem fonte confiável, o professor escolhe na grade
  // (o submit fica desabilitado até escolher).
  const [campusId, setCampusId] = useState(urlWorkspace || roomWorkspaceId)

  useEffect(() => {
    if (campusId || !roomWorkspaceId) return
    setCampusId(roomWorkspaceId)
  }, [campusId, roomWorkspaceId])

  // Se o campus vindo da URL/sala não existe mais (workspace deletado), limpa
  // para forçar a escolha manual — nunca manda o chamado para um campus inválido.
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

  const openTickets = useMemo(() => {
    if (!asset) return []
    return ticketService.getOpenByAsset(asset.id, asset.source)
  }, [asset])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!campusId || !selectedCategory || !reportedBy.trim() || !room || !asset) return

    setSubmitting(true)

    try {
      const ticket = await ticketService.create({
        workspace_id: campusId,
        roomId: room.id,
        roomName: room.name,
        assetId: asset.id,
        assetSource: asset.source,
        assetName: asset.name,
        assetPatrimony: asset.patrimony,
        problemCategory: selectedCategory,
        problemDescription: description,
        status: 'aberto',
        reportedBy: reportedBy.trim(),
        reportedByEmail: reportedByEmail.trim(),
        assignedTo: '',
      })

      navigate(`/chamados-publico/success/${ticket.id}`)
    } catch {
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

  return (
    <div className="min-h-dvh bg-surface px-4 pt-6 pb-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-fg">Abrir Chamado</h1>
      </div>

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
            <div className="grid grid-cols-2 gap-2">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setCampusId(w.id)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-all ${campusId === w.id
                    ? 'border-emerald-500 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400'
                    : 'border-line bg-card text-fg hover:border-fg-muted'
                    }`}
                >
                  <icons.ui.mapPin size={16} className="shrink-0" />
                  <span className="line-clamp-2">{w.name}</span>
                </button>
              ))}
            </div>
            {!campusId && workspaces.length > 0 && (
              <p className="mt-1.5 text-[11px] text-fg-dim">Escolha o campus para onde o chamado deve ir.</p>
            )}
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
        <div>
          <label className="mb-2 block text-xs font-semibold text-fg-muted">Qual o problema?</label>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-xl border p-3 text-left text-sm transition-all ${selectedCategory === cat
                  ? 'border-emerald-500 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400'
                  : 'border-line bg-card text-fg hover:border-fg-muted'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Descreva mais detalhes (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: O computador não liga após queda de luz..."
            rows={3}
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">
            Seu nome <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={reportedBy}
            onChange={(e) => setReportedBy(e.target.value)}
            placeholder="Nome do professor"
            required
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Email (opcional)</label>
          <input
            type="email"
            value={reportedByEmail}
            onChange={(e) => setReportedByEmail(e.target.value)}
            placeholder="email@exemplo.com"
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={!campusId || !selectedCategory || !reportedBy.trim() || submitting}
          className="w-full rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Abrindo chamado...' : 'Abrir Chamado'}
        </button>
      </form>
    </div>
  )
}
