import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, X, Monitor, ChevronUp, ChevronDown, Film } from 'lucide-react'
import type { TvPlaylist } from '../types'
import { parseYouTubeUrl } from '../utils/youtubeUtils'
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

interface PlaylistManagerProps {
  playlists: TvPlaylist[]
  onAdd: (values: Omit<TvPlaylist, 'id' | 'created_at'>) => Promise<void>
  onEdit: (id: string, values: Partial<TvPlaylist>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function PlaylistManager({ playlists, onAdd, onEdit, onDelete }: PlaylistManagerProps) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TvPlaylist | null>(null)
  const [name, setName] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [duration, setDuration] = useState('30')
  const [urlError, setUrlError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TvPlaylist | null>(null)

  const openNew = () => {
    setEditing(null); setName(''); setYoutubeUrl(''); setDuration('30'); setUrlError('')
    setShowForm(true)
  }

  const openEdit = (p: TvPlaylist) => {
    setEditing(p); setName(p.name); setYoutubeUrl(p.youtube_url); setDuration(String(p.duration_seconds)); setUrlError('')
    setShowForm(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !youtubeUrl.trim()) return
    if (!parseYouTubeUrl(youtubeUrl.trim())) {
      setUrlError('URL do YouTube inválida')
      return
    }
    setUrlError('')
    const payload = {
      name: name.trim(),
      type: 'video' as const,
      youtube_url: youtubeUrl.trim(),
      duration_seconds: Math.max(10, parseInt(duration) || 30),
      is_active: true,
      sort_order: editing?.sort_order ?? playlists.length,
    }
    if (editing) {
      await onEdit(editing.id, payload)
    } else {
      await onAdd(payload)
    }
    setShowForm(false); setEditing(null)
  }

  const moveUp = async (idx: number) => {
    if (idx === 0) return
    const a = playlists[idx]; const b = playlists[idx - 1]
    await onEdit(a.id, { sort_order: b.sort_order })
    await onEdit(b.id, { sort_order: a.sort_order })
  }

  const moveDown = async (idx: number) => {
    if (idx === playlists.length - 1) return
    const a = playlists[idx]; const b = playlists[idx + 1]
    await onEdit(a.id, { sort_order: b.sort_order })
    await onEdit(b.id, { sort_order: a.sort_order })
  }

  return (
    <div>
      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir playlist</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong className="text-slate-700">{deleteTarget?.name}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor size={16} className="text-emerald-500" />
          <h3 className="text-base font-semibold text-slate-800">Playlists de Vídeo</h3>
          {playlists.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{playlists.length}</span>
          )}
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:from-emerald-500 hover:to-green-500 active:scale-[0.97]"
        >
          <Plus size={14} /> Nova Playlist
        </button>
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={handleSubmit}
            className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">{editing ? 'Editar' : 'Nova'} Playlist de Vídeo</span>
                <button type="button" onClick={() => setShowForm(false)} className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                  <X size={14} />
                </button>
              </div>
              <input
                placeholder="Nome"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-emerald-500 focus:bg-white"
              />
              <div className="relative">
                <Film size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder="URL do YouTube (vídeo ou playlist)"
                  value={youtubeUrl}
                  onChange={e => { setYoutubeUrl(e.target.value); setUrlError('') }}
                  required
                  className={`w-full rounded-lg border bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:bg-white ${
                    urlError ? 'border-red-500' : 'border-slate-200 focus:border-emerald-500'
                  }`}
                />
              </div>
              {urlError && <p className="text-xs text-red-500">{urlError}</p>}
              <div className="flex items-end gap-3">
                <div className="w-28">
                  <label className="mb-1.5 block text-xs text-slate-500">Duração (s)</label>
                  <input
                    type="number"
                    min="10"
                    value={duration}
                    onChange={e => setDuration(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <p className="text-[11px] text-slate-400 pb-1">
                  Tempo de exibição antes de alternar para eventos
                </p>
              </div>
            </div>
            <div className="border-t border-slate-100 px-4 py-3">
              <button
                type="submit"
                className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:from-emerald-500 hover:to-green-500 active:scale-[0.98]"
              >
                {editing ? 'Salvar alterações' : 'Criar playlist'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Playlist List */}
      <div className="space-y-2">
        {playlists.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center">
            <Monitor size={28} className="text-slate-300" />
            <p className="text-sm text-slate-500">Nenhuma playlist cadastrada</p>
            <button
              onClick={openNew}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
            >
              <Plus size={12} /> Criar primeira playlist
            </button>
          </div>
        ) : (
          playlists.map((p, idx) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 transition-all hover:bg-slate-50 hover:border-slate-200"
            >
              {/* Reorder */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="flex h-4 w-4 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-default disabled:opacity-30"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === playlists.length - 1}
                  className="flex h-4 w-4 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-default disabled:opacity-30"
                >
                  <ChevronDown size={12} />
                </button>
              </div>

              {/* Content */}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                  <Monitor size={14} className="text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{p.name}</span>
                  <span className="block text-xs text-slate-400">
                    Vídeo · {p.duration_seconds}s de exibição
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => openEdit(p)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-emerald-600"
                    >
                      <Pencil size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Editar</TooltipContent>
                </TooltipRoot>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Excluir</TooltipContent>
                </TooltipRoot>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
