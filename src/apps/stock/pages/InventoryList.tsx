import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInventory } from '../hooks/useInventory'
import { useStock } from '../hooks/useStock'
import { SkeletonCard } from '../../pcare/components/Skeletons'
import { EmptyState } from '../../pcare/components/EmptyState'
import { PullToRefresh } from '../../pcare/components/PullToRefresh'
import { Modal } from '../../pcare/components/Modal'
import { icons } from '../../../lib/icons'
import { stockSections } from '../types'

export function InventoryList() {
  const navigate = useNavigate()
  const { cycles, loading, createCycle, reload } = useInventory()
  const { items } = useStock()
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [section, setSection] = useState('')

  const activeItems = items.filter((i) => i.status === 'ativo')

  function handleCreate() {
    if (!name.trim()) return
    const filtered = section ? activeItems.filter((i) => i.section === section) : activeItems
    const cycle = createCycle({ name: name.trim(), section, totalItems: filtered.length })
    setName('')
    setSection('')
    setShowNew(false)
    navigate(`/stock/inventory/${cycle.id}`)
  }

  const sectionLabel = (s: string) => stockSections.find((sx) => sx.value === s)?.label || 'Todos'

  if (loading) return <div className="space-y-2">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Inventário Cíclico</h2>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive"
          >
            <icons.ui.plus size={16} />
            Novo Ciclo
          </button>
        </div>

        <p className="text-sm text-fg-muted">
          Realize contagens físicas periódicas para verificar se os itens do estoque estão presentes e em ordem.
        </p>

        {cycles.length === 0 ? (
          <EmptyState
            icon={icons.nav.checklists}
            title="Nenhum ciclo de inventário"
            description="Crie um ciclo para iniciar a contagem física dos itens."
            action={{ label: 'Iniciar Contagem', onClick: () => setShowNew(true) }}
            accentColor="emerald"
          />
        ) : (
          <div className="space-y-2">
            {cycles.map((cycle) => (
              <button
                key={cycle.id}
                type="button"
                onClick={() => navigate(`/stock/inventory/${cycle.id}`)}
                className="w-full rounded-xl bg-card p-4 text-left shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-elevated)] btn-interactive"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-fg text-sm">{cycle.name}</h3>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        cycle.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          cycle.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                        {cycle.status === 'completed' ? 'Concluído' : 'Em Andamento'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">
                      {sectionLabel(cycle.section)} · {cycle.totalItems} itens
                      {cycle.status === 'completed'
                        ? ` · ${cycle.verifiedCount} ok, ${cycle.missingCount} ausente${cycle.missingCount !== 1 ? 's' : ''}`
                        : ` · ${cycle.verifiedCount + cycle.missingCount + cycle.damagedCount}/${cycle.totalItems} verificados`}
                    </p>
                  </div>
                  {cycle.status === 'in_progress' && (
                    <span className="ml-2 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-900/40 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                      Continuar
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Novo Ciclo de Inventário">
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Nome do Ciclo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Contagem Janeiro 2026"
              className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Seção (opcional)</label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            >
              <option value="">Todas as seções ({activeItems.length} itens)</option>
              {stockSections.map((s) => {
                const count = activeItems.filter((i) => i.section === s.value).length
                return <option key={s.value} value={s.value}>{s.label} ({count} itens)</option>
              })}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!name.trim()}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive disabled:opacity-50"
            >
              Iniciar Contagem
            </button>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </PullToRefresh>
  )
}
