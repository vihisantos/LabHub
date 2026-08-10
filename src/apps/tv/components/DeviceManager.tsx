import { useState, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { Monitor, Pencil, Check, X, Trash2, Power } from 'lucide-react'
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
import type { TvDevice } from '../types'
import type { Workspace } from '../../../core/workspaces/types'

interface DeviceManagerProps {
  devices: TvDevice[]
  workspaces: Workspace[]
  onRename: (id: string, name: string) => Promise<void>
  onMoveWorkspace: (id: string, workspaceId: string | null) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function DeviceManager({ devices, workspaces, onRename, onMoveWorkspace, onRemove }: DeviceManagerProps) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TvDevice | null>(null)

  const startEdit = (d: TvDevice) => {
    setEditing(d.id)
    setEditName(d.name)
  }

  const saveEdit = async (id: string) => {
    const name = editName.trim()
    if (!name) return
    await onRename(id, name)
    setEditing(null)
  }

  const online = (d: TvDevice) => d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 15 * 60 * 1000

  return (
    <div>
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover dispositivo</AlertDialogTitle>
            <AlertDialogDescription>
              Remover a TV <strong>{deleteTarget?.name}</strong>? Ela será desvinculada e o app desktop precisará
              ser reconfigurado.
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
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Monitor size={16} className="text-red-500" />
        <h3 className="text-base font-semibold text-slate-800">Dispositivos (TVs)</h3>
        {devices.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{devices.length}</span>
        )}
      </div>

      {/* List */}
      {devices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <Monitor size={28} className="text-slate-300" />
          <p className="text-sm text-slate-500">Nenhuma TV registrada</p>
          <p className="max-w-sm text-xs text-slate-400">
            Instale o app Lab Hub TV Desktop em um PC conectado à TV e faça o primeiro login para registrar o dispositivo.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {devices.map((d, idx) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 transition-all hover:bg-slate-50 hover:border-slate-200"
            >
              {/* Status */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500">
                <Monitor size={15} />
              </div>

              {/* Name */}
              <div className="min-w-0 flex-1">
                {editing === d.id ? (
                  <div className="flex gap-1">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && saveEdit(d.id)}
                      autoFocus
                      className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 outline-none focus:border-red-500"
                    />
                    <button
                      onClick={() => saveEdit(d.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <p className="truncate text-sm font-medium text-slate-800">{d.name}</p>
                )}
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Power size={10} className={online(d) ? 'text-emerald-500' : 'text-slate-300'} />
                    {online(d) ? 'online' : `offline · ${timeAgo(d.last_seen)}`}
                  </span>
                  <span className="flex items-center gap-1">
                    <select
                      value={d.workspace_id ?? ''}
                      onChange={(e) => onMoveWorkspace(d.id, e.target.value || null)}
                      className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 outline-none focus:border-red-500"
                      title="Workspace da TV"
                    >
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => startEdit(d)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  title="Renomear"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => setDeleteTarget(d)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-500"
                  title="Remover"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
