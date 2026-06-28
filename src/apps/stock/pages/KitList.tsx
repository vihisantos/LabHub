import { useMemo, useState } from 'react'
import { useKits } from '../hooks/useKits'
import { KitCard } from '../components/KitCard'
import { PullToRefresh } from '../../pcare/components/PullToRefresh'
import { SkeletonCard } from '../../pcare/components/Skeletons'
import { EmptyState } from '../../pcare/components/EmptyState'
import { Modal } from '../../pcare/components/Modal'
import { icons } from '../../../lib/icons'
import type { KitFormData } from '../types'

export function KitList() {
  const { kits, loading, create, reload } = useKits()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [newKitName, setNewKitName] = useState('')
  const [newKitRoom, setNewKitRoom] = useState('')
  const [newKitItems, setNewKitItems] = useState('')

  const filtered = useMemo(() => {
    if (!search) return kits
    const q = search.toLowerCase()
    return kits.filter((k) =>
      k.name.toLowerCase().includes(q) || k.room.toLowerCase().includes(q)
    )
  }, [kits, search])

  function handleCreateKit() {
    if (!newKitName.trim()) return
    const items = newKitItems
      .split('\n')
      .filter((l) => l.trim())
      .map((name) => ({ name: name.trim(), expected: 1, present: false }))

    const data: KitFormData = {
      name: newKitName,
      room: newKitRoom,
      items: items.length > 0 ? items : [{ name: 'Item', expected: 1, present: false }],
    }
    create(data)
    setNewKitName('')
    setNewKitRoom('')
    setNewKitItems('')
    setShowForm(false)
  }

  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>
  }

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Kits</h2>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive"
          >
            + Novo Kit
          </button>
        </div>

        <div className="relative">
          <icons.ui.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            placeholder="Buscar kit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl bg-input py-2.5 pl-9 pr-9 text-sm text-fg outline-none placeholder:text-fg-muted transition-all focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={icons.ui.package}
            title="Nenhum kit cadastrado"
            description="Crie kits para conferir se todos os itens estão presentes."
            action={{ label: 'Criar Kit', onClick: () => setShowForm(true) }}
            accentColor="emerald"
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((kit) => (
              <KitCard key={kit.id} kit={kit} />
            ))}
          </div>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Novo Kit">
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Nome do Kit</label>
            <input
              type="text"
              value={newKitName}
              onChange={(e) => setNewKitName(e.target.value)}
              placeholder="Ex: Notebook Dell Latitude"
              className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Sala</label>
            <input
              type="text"
              value={newKitRoom}
              onChange={(e) => setNewKitRoom(e.target.value)}
              placeholder="Ex: Lab Info 1"
              className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Itens (um por linha)</label>
            <textarea
              value={newKitItems}
              onChange={(e) => setNewKitItems(e.target.value)}
              placeholder={"Mouse\nFonte\nCarregador"}
              rows={4}
              className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <button
            type="button"
            onClick={handleCreateKit}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive"
          >
            Criar Kit
          </button>
        </div>
      </Modal>
    </PullToRefresh>
  )
}
