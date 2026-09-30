import { useState, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown, Megaphone, X, Check } from 'lucide-react'
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
import type { TvAnnouncement } from '../types'

interface AnnouncementManagerProps {
  announcements: TvAnnouncement[]
  onAdd: (text: string) => Promise<void>
  onEdit: (id: string, values: Partial<TvAnnouncement>) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onMoveUp: (idx: number) => Promise<void>
  onMoveDown: (idx: number) => Promise<void>
  /** true = somente leitura (não envia as ações de mutação). */
  readOnly?: boolean
}

export function AnnouncementManager({ announcements, onAdd, onEdit, onRemove, onMoveUp, onMoveDown, readOnly = false }: AnnouncementManagerProps) {
  const [newText, setNewText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TvAnnouncement | null>(null)

  const handleAdd = async () => {
    const text = newText.trim()
    if (!text) return
    await onAdd(text)
    setNewText('')
  }

  const startEdit = (a: TvAnnouncement) => {
    setEditing(a.id)
    setEditText(a.text)
  }

  const saveEdit = async (id: string) => {
    const text = editText.trim()
    if (!text) return
    await onEdit(id, { text })
    setEditing(null)
  }

  const cancelEdit = () => setEditing(null)

  const toggleActive = async (a: TvAnnouncement) => {
    await onEdit(a.id, { is_active: !a.is_active })
  }

  return (
    <div>
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aviso</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este aviso? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500"
              onClick={() => {
                if (deleteTarget) onRemove(deleteTarget.id)
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
        <Megaphone size={16} className="text-amber-500" />
        <h3 className="text-base font-semibold text-fg">Avisos</h3>
        {announcements.length > 0 && (
          <span className="rounded-full bg-input px-2 py-0.5 text-[11px] text-fg-muted">{announcements.length}</span>
        )}
      </div>

      {/* Create */}
      {!readOnly && (
        <div className="mb-4 flex gap-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && handleAdd()}
            placeholder="Texto do aviso..."
            className="flex-1 rounded-lg border border-line bg-input px-3 py-2 text-sm text-fg placeholder:text-fg-dim outline-none transition-colors focus:border-amber-500 focus:bg-card"
          />
          <button
            onClick={handleAdd}
            disabled={!newText.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:from-amber-500 hover:to-orange-500 active:scale-[0.97] disabled:opacity-40"
          >
            <Plus size={14} /> Adicionar
          </button>
        </div>
      )}

      {/* List */}
      {announcements.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-card py-10 text-center">
          <Megaphone size={28} className="text-fg-muted" />
          <p className="text-sm text-fg-muted">Nenhum aviso</p>
          <p className="text-xs text-fg-dim">Os avisos aparecem como ticker no display da TV</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {announcements.map((a, idx) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="group flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 transition-all hover:bg-input hover:border-line"
            >
              {/* Reorder */}
              {!readOnly && (
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => onMoveUp(idx)}
                    disabled={idx === 0}
                    className="flex h-4 w-4 items-center justify-center rounded text-fg-dim hover:text-fg-dim disabled:cursor-default disabled:opacity-30"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => onMoveDown(idx)}
                    disabled={idx === announcements.length - 1}
                    className="flex h-4 w-4 items-center justify-center rounded text-fg-dim hover:text-fg-dim disabled:cursor-default disabled:opacity-30"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
              )}

              {/* Active toggle */}
              {!readOnly && (
                <button
                  onClick={() => toggleActive(a)}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    a.is_active ? 'bg-green-100 text-green-600' : 'bg-input text-fg-muted'
                  }`}
                  title={a.is_active ? 'Ativo' : 'Inativo'}
                >
                  <Check size={12} />
                </button>
              )}

              {/* Text */}
              <div className="flex-1 min-w-0">
                {editing === a.id ? (
                  <div className="flex gap-1">
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && saveEdit(a.id)}
                      autoFocus
                      className="flex-1 rounded-md border border-line bg-input px-2 py-1 text-sm text-fg outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={() => saveEdit(a.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-fg-dim hover:bg-input"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <span className={`block truncate text-sm ${a.is_active ? 'text-fg' : 'text-fg-dim'}`}>
                    {a.text}
                  </span>
                )}
              </div>

              {/* Actions */}
              {!readOnly && (
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => startEdit(a)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-dim hover:bg-input hover:text-amber-600"
                      >
                        <Pencil size={13} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Editar</TooltipContent>
                  </TooltipRoot>
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setDeleteTarget(a)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-dim hover:bg-input hover:text-red-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Excluir</TooltipContent>
                  </TooltipRoot>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
