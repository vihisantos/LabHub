import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Trash2, Image as ImageIcon, Check, Images } from 'lucide-react'
import type { TvGallery } from '../types'
import { useGalleryPhotos } from '../hooks/useGallery'
import { CloudinaryUpload } from './CloudinaryUpload'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '../../../lib/components/ui'
import { TooltipRoot, TooltipTrigger, TooltipContent } from '../../../lib/components/ui'

interface GalleryManagerProps {
  galleries: TvGallery[]
  onCreate: (title: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggleActive: (id: string) => Promise<void>
}

export function GalleryManager({ galleries, onCreate, onDelete, onToggleActive }: GalleryManagerProps) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TvGallery | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await onCreate(title.trim())
    setTitle('')
    setShowForm(false)
  }

  return (
    <div>
      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir galeria</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong className="text-slate-700">{deleteTarget?.title}</strong>?
              Todas as fotos serão removidas. Esta ação não pode ser desfeita.
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
          <Images size={16} className="text-violet-500" />
          <h3 className="text-base font-semibold text-slate-800">Galeria de Fotos</h3>
          {galleries.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{galleries.length}</span>
          )}
        </div>
        <button
          onClick={() => { setShowForm(true); setTitle('') }}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/20 transition-all hover:from-violet-500 hover:to-purple-500 active:scale-[0.97]"
        >
          <Plus size={14} /> Nova Galeria
        </button>
      </div>

      {/* Create Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={handleCreate}
            className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">Nova Galeria</span>
                <button type="button" onClick={() => setShowForm(false)} className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                  <X size={14} />
                </button>
              </div>
              <input
                placeholder="Título da galeria"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-violet-500 focus:bg-white"
              />
            </div>
            <div className="border-t border-slate-100 px-4 py-3">
              <button
                type="submit"
                className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-all hover:from-violet-500 hover:to-purple-500 active:scale-[0.98]"
              >
                Criar galeria
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Gallery List */}
      <div className="space-y-2">
        {galleries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center">
            <Images size={28} className="text-slate-300" />
            <p className="text-sm text-slate-500">Nenhuma galeria cadastrada</p>
            <button
              onClick={() => { setShowForm(true); setTitle('') }}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
            >
              <Plus size={12} /> Criar primeira galeria
            </button>
          </div>
        ) : (
          galleries.map((g) => (
            <GalleryCard
              key={g.id}
              gallery={g}
              isActive={g.is_active}
              isExpanded={expandedId === g.id}
              onToggle={() => setExpandedId(expandedId === g.id ? null : g.id)}
              onActivate={() => onToggleActive(g.id)}
              onDelete={() => setDeleteTarget(g)}
            />
          ))
        )}
      </div>
    </div>
  )
}

/* ── Individual gallery card ── */
function GalleryCard({
  gallery, isActive, isExpanded,
  onToggle, onActivate, onDelete,
}: {
  gallery: TvGallery
  isActive: boolean
  isExpanded: boolean
  onToggle: () => void
  onActivate: () => void
  onDelete: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-100 bg-white transition-all"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Images size={16} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="block truncate text-sm font-medium text-slate-800">{gallery.title}</span>
              {isActive && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  Ativa
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <TooltipRoot>
            <TooltipTrigger asChild>
              <button
                onClick={onActivate}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                }`}
              >
                <Check size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{isActive ? 'Desativar' : 'Ativar no display'}</TooltipContent>
          </TooltipRoot>

          <button
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <ImageIcon size={14} />
          </button>

          <TooltipRoot>
            <TooltipTrigger asChild>
              <button
                onClick={onDelete}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Excluir</TooltipContent>
          </TooltipRoot>
        </div>
      </div>

      {/* Expanded photo grid */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 px-4 py-3">
              <PhotoGrid galleryId={gallery.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ── Photo grid with upload ── */
function PhotoGrid({ galleryId }: { galleryId: string }) {
  const { photos, add, remove } = useGalleryPhotos(galleryId)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{photos.length} foto(s)</span>
        <CloudinaryUpload onUpload={(url) => add(url)} />
      </div>

      {photos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 py-8 text-center">
          <ImageIcon size={24} className="text-slate-300" />
          <p className="text-sm text-slate-400">Nenhuma foto ainda</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200">
              <img
                src={p.image_url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <button
                onClick={() => remove(p.id, p.image_url)}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-80 transition-opacity hover:opacity-100 hover:bg-red-500"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
