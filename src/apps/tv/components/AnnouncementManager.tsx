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
}

export function AnnouncementManager({ announcements, onAdd, onEdit, onRemove, onMoveUp, onMoveDown }: AnnouncementManagerProps) {
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
        <h3 className="text-base font-semibold text-slate-800">Avisos</h3>
        {announcements.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{announcements.length}</span>
        )}
      </div>

      {/* Create */}
      <div className="mb-4 flex gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && handleAdd()}
          placeholder="Texto do aviso..."
          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-amber-500 focus:bg-white"
        />
        <button
          onClick={handleAdd}
          disabled={!newText.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:from-amber-500 hover:to-orange-500 active:scale-[0.97] disabled:opacity-40"
        >
          <Plus size={14} /> Adicionar
        </button>
      </div>

      {/* List */}
      {announcements.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <Megaphone size={28} className="text-slate-300" />
          <p className="text-sm text-slate-500">Nenhum aviso</p>
          <p className="text-xs text-slate-400">Os avisos aparecem como ticker no display da TV</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {announcements.map((a, idx) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="group flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 transition-all hover:bg-slate-50 hover:border-slate-200"
            >
              {/* Reorder */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => onMoveUp(idx)}
                  disabled={idx === 0}
                  className="flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:text-slate-600 disabled:cursor-default disabled:opacity-30"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  onClick={() => onMoveDown(idx)}
                  disabled={idx === announcements.length - 1}
                  className="flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:text-slate-600 disabled:cursor-default disabled:opacity-30"
                >
                  <ChevronDown size={12} />
                </button>
              </div>

              {/* Active toggle */}
              <button
                onClick={() => toggleActive(a)}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  a.is_active ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-300'
                }`}
                title={a.is_active ? 'Ativo' : 'Inativo'}
              >
                <Check size={12} />
              </button>

              {/* Text */}
              <div className="flex-1 min-w-0">
                {editing === a.id ? (
                  <div className="flex gap-1">
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && saveEdit(a.id)}
                      autoFocus
                      className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={() => saveEdit(a.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <span className={`block truncate text-sm ${a.is_active ? 'text-slate-800' : 'text-slate-400'}`}>
                    {a.text}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => startEdit(a)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-600"
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
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Excluir</TooltipContent>
                </TooltipRoot>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
