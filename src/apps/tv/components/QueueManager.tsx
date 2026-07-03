import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, ChevronDown, ChevronRight, Shuffle, ArrowUp, ArrowDown, Music, Loader2, ExternalLink, Film } from 'lucide-react'
import { useMusicQueues, type QueueWithTracks } from '../hooks/useMusicQueues'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../../lib/components/ui'
import { TooltipRoot, TooltipTrigger, TooltipContent } from '../../../lib/components/ui'

export function QueueManager() {
  const { queues, loading, add, edit, remove, addTracksFromUrl, removeTrack, reorder } = useMusicQueues()
  const [newName, setNewName] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [fetching, setFetching] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'queue' | 'track'; id: string; name: string } | null>(null)

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    await add(name)
    setNewName('')
  }

  const handleAddTracks = async (queueId: string) => {
    const url = urlInput.trim()
    if (!url) return
    setFetching(true)
    await addTracksFromUrl(queueId, url)
    setFetching(false)
    setUrlInput('')
  }

  const handleMoveUp = (qId: string, idx: number) => {
    if (idx === 0) return
    const q = queues.find(q => q.id === qId)
    if (!q) return
    const ids = q.tracks.map(t => t.id)
    ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
    reorder(qId, ids)
  }

  const handleMoveDown = (qId: string, idx: number) => {
    const q = queues.find(q => q.id === qId)
    if (!q || idx >= q.tracks.length - 1) return
    const ids = q.tracks.map(t => t.id)
    ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
    reorder(qId, ids)
  }

  const toggleShuffle = async (q: QueueWithTracks) => {
    await edit(q.id, { shuffle: !q.shuffle } as any)
  }

  const confirmDeleteQueue = (q: QueueWithTracks) => {
    setDeleteTarget({ type: 'queue', id: q.id, name: q.name })
  }

  const confirmDeleteTrack = (id: string) => {
    setDeleteTarget({ type: 'track', id, name: 'Track' })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
        <Loader2 size={24} className="animate-spin text-slate-400" />
        <p className="text-sm">Carregando filas...</p>
      </div>
    )
  }

  return (
    <div>
      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {deleteTarget?.type === 'queue' ? 'fila' : 'track'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong className="text-slate-700">{deleteTarget?.name}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500"
              onClick={async () => {
                if (!deleteTarget) return
                if (deleteTarget.type === 'queue') {
                  await remove(deleteTarget.id)
                } else {
                  await removeTrack(deleteTarget.id)
                }
                setDeleteTarget(null)
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Music size={16} className="text-blue-500" />
        <h3 className="text-base font-semibold text-slate-800">Filas de Música</h3>
        {queues.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{queues.length}</span>
        )}
      </div>

      {/* Create queue */}
      <div className="mb-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Nome da nova fila..."
          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:bg-white"
        />
        <button
          onClick={handleCreate}
          disabled={!newName.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:from-blue-500 hover:to-indigo-500 active:scale-[0.97] disabled:opacity-40"
        >
          <Plus size={14} /> Criar
        </button>
      </div>

      {/* Queue list */}
      {queues.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <Music size={28} className="text-slate-300" />
          <p className="text-sm text-slate-500">Nenhuma fila criada</p>
          <p className="text-xs text-slate-400">Crie uma fila e adicione tracks do YouTube</p>
        </div>
      ) : (
        <div className="space-y-2">
          {queues.map((q) => {
            const isOpen = expanded === q.id
            return (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-xl border border-slate-100 bg-white"
              >
                {/* Queue header */}
                <button
                  onClick={() => setExpanded(isOpen ? null : q.id)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                >
                  {isOpen ? (
                    <ChevronDown size={14} className="shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight size={14} className="shrink-0 text-slate-400" />
                  )}
                  <Music size={14} className="shrink-0 text-blue-500" />
                  <span className="flex-1 text-sm font-medium text-slate-800">{q.name}</span>
                  <span className="text-xs text-slate-400">
                    {q.tracks.length} track{q.tracks.length !== 1 ? 's' : ''}
                  </span>

                  {/* Shuffle toggle */}
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleShuffle(q) }}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                          q.shuffle
                            ? 'bg-blue-100 text-blue-600'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        <Shuffle size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {q.shuffle ? 'Modo aleatório' : 'Modo sequencial'}
                    </TooltipContent>
                  </TooltipRoot>

                  {/* Delete queue */}
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmDeleteQueue(q) }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Excluir fila</TooltipContent>
                  </TooltipRoot>
                </button>

                {/* Expanded content */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="border-t border-slate-100"
                    >
                      <div className="p-3">
                        {/* Add tracks from URL */}
                        <div className="mb-3 flex gap-2">
                          <div className="relative flex-1">
                            <Film size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              value={urlInput}
                              onChange={(e) => setUrlInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && !fetching && handleAddTracks(q.id)}
                              placeholder="URL do YouTube (vídeo ou playlist)..."
                              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:bg-white"
                            />
                          </div>
                          <button
                            onClick={() => handleAddTracks(q.id)}
                            disabled={fetching || !urlInput.trim()}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:from-blue-500 hover:to-indigo-500 active:scale-[0.97] disabled:opacity-40"
                          >
                            {fetching ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Plus size={14} />
                            )}
                            {fetching ? 'Buscando...' : 'Adicionar'}
                          </button>
                        </div>

                        {/* Track list */}
                        {q.tracks.length === 0 ? (
                          <p className="py-4 text-center text-xs text-slate-400">
                            Nenhum track. Adicione uma URL do YouTube.
                          </p>
                        ) : (
                          <div className="space-y-0.5">
                            {q.tracks.map((track, idx) => (
                              <div
                                key={track.id}
                                className="group/track flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-slate-50"
                              >
                                <span className="w-5 text-right text-[11px] text-slate-400">
                                  {idx + 1}
                                </span>
                                <span className="flex-1 truncate text-slate-600">
                                  {track.title}
                                </span>
                                <span className="shrink-0 text-[11px] text-slate-400">
                                  {track.duration_seconds > 0
                                    ? `${Math.floor(track.duration_seconds / 60)}:${String(track.duration_seconds % 60).padStart(2, '0')}`
                                    : ''}
                                </span>
                                <a
                                  href={`https://youtube.com/watch?v=${track.youtube_video_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-600"
                                  title="Abrir no YouTube"
                                >
                                  <ExternalLink size={12} />
                                </a>
                                <button
                                  onClick={() => handleMoveUp(q.id, idx)}
                                  disabled={idx === 0}
                                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-default disabled:opacity-30"
                                >
                                  <ArrowUp size={12} />
                                </button>
                                <button
                                  onClick={() => handleMoveDown(q.id, idx)}
                                  disabled={idx >= q.tracks.length - 1}
                                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-default disabled:opacity-30"
                                >
                                  <ArrowDown size={12} />
                                </button>
                                <button
                                  onClick={() => confirmDeleteTrack(track.id)}
                                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 opacity-0 transition-all hover:text-red-500 group-hover/track:opacity-100"
                                  title="Remover"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
