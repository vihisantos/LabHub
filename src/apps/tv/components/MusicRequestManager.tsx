import { useState } from 'react'
import { motion } from 'framer-motion'
import { Music, Check, X, ExternalLink, Loader2, Clock, User, ListMusic } from 'lucide-react'
import { useMusicRequests } from '../hooks/useMusicRequests'
import { useAuth } from '../../../core/auth/AuthContext'
import { useMusicPlayer } from '../contexts/MusicPlayerContext'

export function MusicRequestManager() {
  const { user } = useAuth()
  const { requests, pending, loading, approve, reject } = useMusicRequests()
  const { playNext } = useMusicPlayer()
  const [busyId, setBusyId] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
        <Loader2 size={24} className="animate-spin text-slate-400" />
        <p className="text-sm">Carregando pedidos...</p>
      </div>
    )
  }

  const handleApprove = async (id: string) => {
    const req = requests.find((r) => r.id === id)
    if (!req || !user) return
    setBusyId(id)
    await approve(req, user.id)
    setBusyId(null)
  }

  const handleReject = async (id: string) => {
    const req = requests.find((r) => r.id === id)
    if (!req || !user) return
    setBusyId(id)
    await reject(req, user.id)
    setBusyId(null)
  }

  const handlePlayNext = (id: string) => {
    const req = requests.find((r) => r.id === id)
    if (!req?.youtube_video_id) return
    playNext({
      id: req.id,
      queue_id: '',
      youtube_video_id: req.youtube_video_id,
      title: req.title || 'Música solicitada',
      duration_seconds: 0,
      position: 0,
      created_at: req.created_at,
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Music size={16} className="text-blue-500" />
        <h3 className="text-base font-semibold text-slate-800">Pedidos de Música</h3>
        {pending.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
            {pending.length} pendente{pending.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <Music size={28} className="text-slate-300" />
          <p className="text-sm text-slate-500">Nenhum pedido de música</p>
          <p className="text-xs text-slate-400">Os pedidos feitos no hub aparecem aqui para verificação</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => {
            const busy = busyId === req.id
            const isPending = req.status === 'pending'
            return (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3"
              >
                {req.youtube_video_id ? (
                  <img
                    src={`https://img.youtube.com/vi/${req.youtube_video_id}/mqdefault.jpg`}
                    alt=""
                    className="h-12 w-20 shrink-0 rounded-lg object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                ) : (
                  <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                    <Music size={18} />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{req.title || 'Música'}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                    {req.requested_by_name && (
                      <span className="flex items-center gap-1">
                        <User size={10} /> {req.requested_by_name}
                      </span>
                    )}
                    {isPending && (
                      <span className="flex items-center gap-1 text-amber-500">
                        <Clock size={10} /> Aguardando verificação
                      </span>
                    )}
                  </div>
                </div>

                <a
                  href={req.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  title="Abrir no YouTube"
                >
                  <ExternalLink size={14} />
                </a>

                {isPending ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handlePlayNext(req.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100"
                      title="Tocar a seguir (após a música atual terminar)"
                    >
                      <ListMusic size={14} />
                      Ouvir
                    </button>
                    <button
                      onClick={() => handleApprove(req.id)}
                      disabled={busy}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Aprovar
                    </button>
                    <button
                      onClick={() => handleReject(req.id)}
                      disabled={busy}
                      className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
                    >
                      <X size={14} />
                      Recusar
                    </button>
                  </div>
                ) : (
                  <span
                    className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                      req.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-600'
                        : 'bg-rose-100 text-rose-600'
                    }`}
                  >
                    {req.status === 'approved' ? 'Aprovada' : 'Recusada'}
                  </span>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
