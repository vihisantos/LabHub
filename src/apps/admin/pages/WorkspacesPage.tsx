import { useState } from 'react'
import { useWorkspaces } from '../../../core/workspaces/useWorkspaces'
import { icons } from '../../../lib/icons'

export function WorkspacesPage() {
  const { workspaces, create, update, remove } = useWorkspaces()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    if (editingId) {
      update(editingId, { name: name.trim(), slug, location: location.trim() })
    } else {
      create({ name: name.trim(), slug, location: location.trim() })
    }

    setName('')
    setLocation('')
    setEditingId(null)
    setShowForm(false)
  }

  function startEdit(id: string) {
    const ws = workspaces.find((w) => w.id === id)
    if (ws) {
      setName(ws.name)
      setLocation(ws.location)
      setEditingId(id)
      setShowForm(true)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-fg">Workspaces</h2>
          <p className="text-xs text-fg-muted">{workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(!showForm); setEditingId(null); setName(''); setLocation('') }}
          className="flex items-center gap-1.5 rounded-lg bg-slate-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-400"
        >
          <icons.ui.plus size={14} />
          Novo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
          <div>
            <label className="mb-1 block text-xs font-semibold text-fg-muted">Nome *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Anhembi Piracicaba"
              required
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-fg-muted">Localização</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex: Piracicaba, SP"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-slate-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null) }}
              className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-fg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-slate-500 px-3 py-2 text-sm font-semibold text-white"
            >
              {editingId ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {workspaces.map((ws) => (
          <div key={ws.id} className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
              <icons.ui.home size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{ws.name}</p>
              <p className="text-[11px] text-fg-muted">{ws.location || 'Sem localização'}</p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => startEdit(ws.id)}
                className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-input hover:text-fg"
              >
                <icons.ui.edit size={14} />
              </button>
              <button
                type="button"
                onClick={() => remove(ws.id)}
                className="rounded-lg p-1.5 text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <icons.ui.trash size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
