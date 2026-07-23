import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStock } from '../hooks/useStock'
import { useMovements } from '../hooks/useMovements'
import { SkeletonCard } from '../../pcare/components/Skeletons'
import { icons } from '../../../lib/icons'
import { Tabs, TabsList, TabsTrigger } from '../../../lib/components/ui'


export function StockEntryExit() {
  const navigate = useNavigate()
  const { items, loading, update } = useStock()
  const { create: createMovement } = useMovements()
  const [mode, setMode] = useState<'entrada' | 'saida'>('entrada')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [room, setRoom] = useState('')
  const [performedBy, setPerformedBy] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.room.toLowerCase().includes(q) ||
        i.serialNumber.toLowerCase().includes(q) ||
        i.subcategory.toLowerCase().includes(q),
    )
  }, [items, search])

  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((i) => i.id)))
  }

  function reset() {
    setSelected(new Set())
    setRoom('')
    setPerformedBy('')
    setNotes('')
    setSuccess(false)
  }

  async function handleSubmit() {
    if (selectedItems.length === 0) return
    setSaving(true)

    for (const item of selectedItems) {
      if (mode === 'entrada') {
        createMovement({
          itemId: item.id,
          itemName: item.name,
          type: 'entrada',
          fromRoom: '',
          toRoom: room || item.room,
          description: notes || 'Entrada registrada',
          replacedPart: '',
          newPart: '',
          performedBy,
        })
        if (room.trim() && room.trim() !== item.room) {
          update(item.id, { room: room.trim() })
        }
        if (item.status !== 'ativo') {
          update(item.id, { status: 'ativo' })
        }
      } else {
        createMovement({
          itemId: item.id,
          itemName: item.name,
          type: 'saida',
          fromRoom: item.room,
          toRoom: room || '',
          description: notes || 'Saída registrada',
          replacedPart: '',
          newPart: '',
          performedBy,
        })
        update(item.id, { status: 'descartado' })
      }
    }

    setSaving(false)
    setSuccess(true)
    setTimeout(() => reset(), 400)
  }

  if (loading) return <div className="space-y-2">{[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Entrada / Saída</h2>
        <button
          type="button"
          onClick={() => navigate('/stock/movements')}
          className="rounded-lg bg-input px-3 py-1.5 text-xs font-medium text-fg-dim hover:text-fg transition-colors"
        >
          Histórico
        </button>
      </div>

      {/* Mode switch */}
      <Tabs value={mode} onValueChange={(v) => { setMode(v as 'entrada' | 'saida'); reset() }}>
        <TabsList className="bg-input/50 w-full">
          <TabsTrigger value="entrada" className="flex-1 text-xs data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400">
            <icons.ui.plus size={14} className="inline mr-1" />
            Entrada
          </TabsTrigger>
          <TabsTrigger value="saida" className="flex-1 text-xs data-[state=active]:text-red-600 dark:data-[state=active]:text-red-400">
            <icons.ui.minus size={14} className="inline mr-1" />
            Saída
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {success ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 py-12">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
            <icons.ui.checkCircle size={28} className="text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-fg">
            {selectedItems.length} {selectedItems.length === 1 ? 'item registrado' : 'itens registrados'} com {mode === 'entrada' ? 'entrada' : 'saída'}
          </p>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative">
            <icons.ui.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              placeholder="Buscar por nome, sala, série..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl bg-input py-2.5 pl-9 pr-9 text-sm text-fg outline-none placeholder:text-fg-muted transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          {/* Select all */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs font-medium text-fg-muted hover:text-fg transition-colors"
            >
              {selected.size === filtered.length && filtered.length > 0 ? 'Desmarcar todos' : `Selecionar todos (${filtered.length})`}
            </button>
            <span className="text-xs text-fg-muted">{selected.size} selecionados</span>
          </div>

          {/* Items list */}
          <div className="flex flex-col gap-1.5">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-fg-muted">
                Nenhum item encontrado
              </div>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                    selected.has(item.id)
                      ? mode === 'entrada'
                        ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20'
                        : 'border-red-500/50 bg-red-50 dark:bg-red-950/20'
                      : 'border-line bg-card/50 hover:bg-input'
                  }`}
                >
                  <div
                    key={`${item.id}-${selected.has(item.id)}`}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                      selected.has(item.id)
                        ? mode === 'entrada'
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-red-500 bg-red-500 text-white'
                        : 'border-line'
                    } ${selected.has(item.id) ? 'checkbox-animated' : ''}`}
                  >
                    {selected.has(item.id) && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${selected.has(item.id) ? 'text-fg' : 'text-fg'}`}>{item.name}</p>
                    <p className="text-xs text-fg-muted">
                      {item.subcategory}
                      {item.room && ` · ${item.room}`}
                      {item.serialNumber && ` · ${item.serialNumber}`}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    item.status === 'ativo' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                    item.status === 'em_conserto' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                    item.status === 'emprestado' ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' :
                    'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}>
                    {item.status === 'ativo' ? 'Ativo' : item.status === 'em_conserto' ? 'Conserto' : item.status === 'emprestado' ? 'Emprest.' : 'Descart.'}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Form */}
          {selected.size > 0 && (
            <div className="rounded-xl border border-line bg-card/50 p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                {mode === 'entrada' ? 'Registrar Entrada' : 'Registrar Saída'}
                {' · '}{selected.size} {selected.size === 1 ? 'item' : 'itens'}
              </h3>

              <div>
                <label className="mb-1 block text-xs text-fg-muted">{mode === 'entrada' ? 'Sala de destino' : 'Sala de origem'}</label>
                <input
                  type="text"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder={mode === 'entrada' ? 'Ex: Lab Info 2' : 'Ex: Lab Info 2'}
                  className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">Responsável</label>
                <input
                  type="text"
                  value={performedBy}
                  onChange={(e) => setPerformedBy(e.target.value)}
                  placeholder="Nome do responsável"
                  className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted">Observações</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Motivo, descrição..."
                  className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-emerald-500"
                />
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className={`w-full rounded-xl py-2.5 text-sm font-medium text-white transition-all disabled:opacity-50 ${
                  mode === 'entrada'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {saving ? 'Registrando...' : `${mode === 'entrada' ? 'Registrar Entrada' : 'Registrar Saída'} (${selected.size})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
