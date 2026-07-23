import { Fragment, useState, useMemo } from 'react'
import { useParts } from '../hooks/useParts'
import { usePCs } from '../hooks/usePCs'
import { EmptyState } from '../components/EmptyState'
import { PullToRefresh } from '../components/PullToRefresh'
import { SkeletonCard } from '../components/Skeletons'
import { partUsageService } from '../services/partUsageService'
import { icons } from '../../../lib/icons'
import { ConfirmDialog } from '../components/Modal'
import type { PartFormData } from '../types'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../lib/components/ui'

const emptyPartForm: PartFormData = {
  name: '',
  category: '',
  quantity: 0,
  minQuantity: 0,
  serialNumber: '',
  notes: '',
}

const categories = [
  'fan', 'ssd', 'ram', 'keyboard', 'mouse',
  'cable', 'power_supply', 'monitor', 'other',
]

export function PartsList() {
  const { parts, loading, create, update, remove, reload } = useParts()
  const { pcs } = usePCs()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PartFormData>(emptyPartForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [usagePartId, setUsagePartId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  function resetForm() {
    setForm(emptyPartForm)
    setEditingId(null)
    setShowForm(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editingId) {
      update(editingId, { ...form, updatedAt: undefined as any })
    } else {
      create(form)
    }
    resetForm()
  }

  function startEdit(part: typeof parts[0]) {
    setForm({
      name: part.name,
      category: part.category,
      quantity: part.quantity,
      minQuantity: part.minQuantity,
      serialNumber: part.serialNumber,
      notes: part.notes,
    })
    setEditingId(part.id)
    setShowForm(true)
  }

  function adjustQuantity(id: string, delta: number) {
    const part = parts.find((p) => p.id === id)
    if (!part) return
    const newQty = Math.max(0, part.quantity + delta)
    update(id, { quantity: newQty })
  }

  if (loading) return <div className="space-y-2">{[1,2,3,4,5].map(i => <SkeletonCard key={i} />)}</div>

  return (
    <PullToRefresh onRefresh={reload}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Estoque de Peças</h2>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
        >
          {showForm ? 'Cancelar' : '+ Nova Peça'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 rounded-xl border border-line bg-card/50 p-4"
        >
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">
            {editingId ? 'Editar Peça' : 'Nova Peça'}
          </h3>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-fg-muted">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Fan Cooler 120mm"
                  className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">Categoria</label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-fg-muted">Quantidade</label>
                <input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                  min={0}
                  className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">Qtd. Mínima</label>
                <input
                  type="number"
                  value={form.minQuantity}
                  onChange={(e) => setForm({ ...form, minQuantity: Number(e.target.value) })}
                  min={0}
                  className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Nº de Série</label>
              <input
                type="text"
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                placeholder="SN-12345"
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-fg-muted">Observações</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Local onde foi comprada, etc."
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
            >
              {editingId ? 'Salvar' : 'Adicionar ao Estoque'}
            </button>
          </div>
        </form>
      )}

      {parts.length === 0 && !showForm ? (
        <EmptyState
          icon={icons.nav.parts}
          title="Estoque vazio"
          description="Adicione peças para controlar o inventário."
          action={{ label: 'Nova Peça', onClick: () => setShowForm(true) }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {parts.map((part) => {
            const lowStock = part.quantity <= part.minQuantity
            return (
              <Fragment key={part.id}>
                <div className="flex items-center justify-between rounded-xl border border-line bg-card/50 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-fg">{part.name}</h3>
                      {lowStock && (
                        <span className="rounded bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                          Estoque baixo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fg-muted">
                      {part.category} {part.serialNumber && `· ${part.serialNumber}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => adjustQuantity(part.id, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-input text-sm text-fg-dim ring-1 ring-line transition-colors hover:bg-card hover:text-fg"
                      >
                        −
                      </button>
                      <span className="min-w-[2ch] text-center font-semibold text-fg">
                        {part.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustQuantity(part.id, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-input text-sm text-fg-dim ring-1 ring-line transition-colors hover:bg-card hover:text-fg"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(part)}
                      className="text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setUsagePartId(usagePartId === part.id ? null : part.id)}
                      className="text-xs font-medium text-fg-dim hover:text-fg"
                    >
                      {usagePartId === part.id ? 'Ocultar' : 'Uso'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(part.id)}
                      className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
                {usagePartId === part.id && (
                  <PartUsagePanel partId={part.id} pcs={pcs} />
                )}
              </Fragment>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => { if (confirmRemove) remove(confirmRemove); setConfirmRemove(null) }}
        title="Remover peça"
        message={`Tem certeza que deseja remover "${parts.find((p) => p.id === confirmRemove)?.name}"?`}
        confirmLabel="Remover"
      />
    </PullToRefresh>
  )
}

function PartUsagePanel({ partId, pcs }: { partId: string; pcs: { id: string; labName: string; pcNumber: string }[] }) {
  const usage = useMemo(() => {
    return partUsageService.getByPartId(partId)
  }, [partId])

  if (usage.length === 0) {
    return (
      <div className="mt-2 rounded-lg bg-input/30 px-4 py-3">
        <p className="text-xs text-fg-muted">Nenhum PC utilizou esta peça ainda.</p>
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-lg bg-input/30 px-4 py-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg-muted">Usada em:</p>
      <div className="flex flex-col gap-1.5">
        {usage.map((u) => {
          const pc = pcs.find((p) => p.id === u.pcId)
          return (
            <div key={u.id} className="flex items-center justify-between text-xs">
              <span className="text-fg-dim">
                {pc ? `${pc.labName} — ${pc.pcNumber}` : 'PC removido'}
              </span>
              <span className="text-fg-muted">
                {u.quantity}x · {new Date(u.timestamp).toLocaleDateString('pt-BR')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
