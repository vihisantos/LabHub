import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useRooms } from '../../chamados/hooks/useRooms'
import { useRoomAssets } from '../../chamados/hooks/useRoomAssets'
import { useProblemTemplates } from '../../chamados/hooks/useProblemTemplates'
import { ticketService } from '../../chamados/services/ticketService'
import { icons } from '../../../lib/icons'
import type { TicketFormData } from '../../chamados/types'

export function TicketForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roomId = searchParams.get('room') || ''
  const assetId = searchParams.get('asset') || ''
  const assetSource = (searchParams.get('source') || 'stock') as TicketFormData['assetSource']

  const { rooms } = useRooms()
  const room = rooms.find((r) => r.id === roomId)
  const { assets } = useRoomAssets(room?.name || '')
  const asset = assets.find((a) => a.id === assetId && a.source === assetSource)

  const { getByAssetType } = useProblemTemplates()

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCategory || !reportedBy.trim() || !room || !asset) return

    setSubmitting(true)

    const ticket = ticketService.create({
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
  }

  if (!room || !asset) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-5">
        <icons.ui.alertCircle size={48} className="text-fg-muted" />
        <p className="mt-4 text-sm text-fg-muted">Dados não encontrados</p>
        <button
          type="button"
          onClick={() => navigate('/chamados-publico')}
          className="mt-4 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white"
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
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <icons.ui.alertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Já existe{openTickets.length > 1 ? 'm' : ''} chamado{openTickets.length > 1 ? 's' : ''} aberto{openTickets.length > 1 ? 's' : ''} para este equipamento.
              </p>
              <p className="mt-0.5 text-[11px] text-amber-600/70 dark:text-amber-400/70">
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
                className={`rounded-xl border p-3 text-left text-sm transition-all ${
                  selectedCategory === cat
                    ? 'border-amber-500 bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400'
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
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Seu nome *</label>
          <input
            type="text"
            value={reportedBy}
            onChange={(e) => setReportedBy(e.target.value)}
            placeholder="Nome do professor"
            required
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Email (opcional)</label>
          <input
            type="email"
            value={reportedByEmail}
            onChange={(e) => setReportedByEmail(e.target.value)}
            placeholder="email@exemplo.com"
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <button
          type="submit"
          disabled={!selectedCategory || !reportedBy.trim() || submitting}
          className="w-full rounded-xl bg-amber-500 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Abrindo chamado...' : 'Abrir Chamado'}
        </button>
      </form>
    </div>
  )
}
