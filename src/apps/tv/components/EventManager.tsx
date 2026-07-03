import { useState, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, X, ChevronUp, ChevronDown, Calendar, Image } from 'lucide-react'
import type { TvEvent } from '../types'
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

interface EventManagerProps {
  events: TvEvent[]
  onAdd: (values: Omit<TvEvent, 'id' | 'created_at'>) => Promise<void>
  onEdit: (id: string, values: Partial<TvEvent>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function EventManager({ events, onAdd, onEdit, onDelete }: EventManagerProps) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TvEvent | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TvEvent | null>(null)

  const openNew = () => {
    setEditing(null)
    setTitle(''); setDescription(''); setImageUrl(''); setStartDate(''); setEndDate('')
    setShowForm(true)
  }

  const openEdit = (e: TvEvent) => {
    setEditing(e)
    setTitle(e.title)
    setDescription(e.description || '')
    setImageUrl(e.image_url || '')
    setStartDate(e.start_date ? e.start_date.slice(0, 16) : '')
    setEndDate(e.end_date ? e.end_date.slice(0, 16) : '')
    setShowForm(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      end_date: endDate ? new Date(endDate).toISOString() : null,
      is_active: true,
      sort_order: editing?.sort_order ?? events.length,
    }
    if (editing) {
      await onEdit(editing.id, payload)
    } else {
      await onAdd(payload)
    }
    setShowForm(false)
    setEditing(null)
  }

  const moveUp = async (idx: number) => {
    if (idx === 0) return
    const a = events[idx]; const b = events[idx - 1]
    await onEdit(a.id, { sort_order: b.sort_order })
    await onEdit(b.id, { sort_order: a.sort_order })
  }

  const moveDown = async (idx: number) => {
    if (idx === events.length - 1) return
    const a = events[idx]; const b = events[idx + 1]
    await onEdit(a.id, { sort_order: b.sort_order })
    await onEdit(b.id, { sort_order: a.sort_order })
  }

  return (
    <div>
      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong className="text-slate-700">{deleteTarget?.title}</strong>?
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
          <Calendar size={16} className="text-violet-500" />
          <h3 className="text-base font-semibold text-slate-800">Eventos</h3>
          {events.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{events.length}</span>
          )}
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/20 transition-all hover:from-violet-500 hover:to-purple-500 active:scale-[0.97]"
        >
          <Plus size={14} /> Novo Evento
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
                <span className="text-sm font-medium text-slate-800">{editing ? 'Editar' : 'Novo'} Evento</span>
                <button type="button" onClick={() => setShowForm(false)} className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                  <X size={14} />
                </button>
              </div>
              <input
                placeholder="Título"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-violet-500 focus:bg-white"
              />
              <textarea
                placeholder="Descrição (opcional)"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-violet-500 focus:bg-white"
              />
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Image size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    placeholder="URL da imagem (opcional)"
                    value={imageUrl}
                    onChange={e => setImageUrl(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-violet-500 focus:bg-white"
                  />
                </div>
                <CloudinaryUpload onUpload={(url) => setImageUrl(url)} />
              </div>
              <div className="flex gap-3">
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-violet-500 focus:bg-white [color-scheme:light]"
                />
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-violet-500 focus:bg-white [color-scheme:light]"
                />
              </div>
            </div>
            <div className="border-t border-slate-100 px-4 py-3">
              <button
                type="submit"
                className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-all hover:from-violet-500 hover:to-purple-500 active:scale-[0.98]"
              >
                {editing ? 'Salvar alterações' : 'Criar evento'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Event List */}
      <div className="space-y-2">
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center">
            <Calendar size={28} className="text-slate-300" />
            <p className="text-sm text-slate-500">Nenhum evento cadastrado</p>
            <button
              onClick={openNew}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
            >
              <Plus size={12} /> Criar primeiro evento
            </button>
          </div>
        ) : (
          events.map((e, idx) => (
            <motion.div
              key={e.id}
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
                  disabled={idx === events.length - 1}
                  className="flex h-4 w-4 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-default disabled:opacity-30"
                >
                  <ChevronDown size={12} />
                </button>
              </div>

              {/* Content */}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {e.image_url && (
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                    <img src={e.image_url} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{e.title}</span>
                  {e.description && (
                    <span className="block truncate text-xs text-slate-500">{e.description}</span>
                  )}
                </div>
                {e.start_date && (
                  <span className="hidden shrink-0 text-[11px] text-slate-400 sm:block">
                    {new Date(e.start_date).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => openEdit(e)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-violet-600"
                    >
                      <Pencil size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Editar</TooltipContent>
                </TooltipRoot>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDeleteTarget(e)}
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
