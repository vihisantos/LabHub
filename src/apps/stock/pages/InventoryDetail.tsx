import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useInventory, useInventoryCounts } from '../hooks/useInventory'
import { useStock } from '../hooks/useStock'
import { ConfirmDialog } from '../../pcare/components/Modal'
import { icons } from '../../../lib/icons'
import { stockSections } from '../types'

type Step = 'counting' | 'review' | 'done'

export function InventoryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { cycles, completeCycle, removeCycle } = useInventory()
  const { items } = useStock()
  const { counts, saveCount } = useInventoryCounts(id || '')

  const cycle = cycles.find((c) => c.id === id)
  const [step, setStep] = useState<Step>('counting')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showFinish, setShowFinish] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const sectionLabel = (s: string) => stockSections.find((sx) => sx.value === s)?.label || 'Todas'

  const pendingItems = useMemo(() => {
    const active = items.filter((i) => i.status === 'ativo')
    if (!cycle) return []
    const filtered = cycle.section ? active.filter((i) => i.section === cycle.section) : active
    const countedIds = new Set(counts.map((c) => c.itemId))
    return filtered.filter((i) => !countedIds.has(i.id))
  }, [items, cycle, counts])

  const verifiedItems = useMemo(() => counts.filter((c) => c.result === 'verified'), [counts])
  const missingItems = useMemo(() => counts.filter((c) => c.result === 'missing'), [counts])
  const damagedItems = useMemo(() => counts.filter((c) => c.result === 'damaged'), [counts])

  const allItems = useMemo(() => {
    const active = items.filter((i) => i.status === 'ativo')
    if (!cycle) return []
    return cycle.section ? active.filter((i) => i.section === cycle.section) : active
  }, [items, cycle])

  const currentItem = pendingItems[currentIndex]

  function handleResult(result: 'pending' | 'verified' | 'missing' | 'damaged') {
    if (!cycle || !currentItem) return
    saveCount({
      id: crypto.randomUUID(),
      cycleId: cycle.id,
      itemId: currentItem.id,
      itemName: currentItem.name,
      itemSubcategory: currentItem.subcategory,
      itemSerial: currentItem.serialNumber,
      itemRoom: currentItem.room,
      result,
      actualRoom: currentItem.room,
      notes: '',
      countedAt: new Date().toISOString(),
    })
    if (currentIndex < pendingItems.length - 1) {
      setCurrentIndex((i) => i + 1)
    } else {
      setStep('review')
    }
  }

  function handleFinish() {
    if (!cycle) return
    const stats = {
      verifiedCount: verifiedItems.length + (step === 'counting' ? 0 : 0),
      missingCount: missingItems.length,
      damagedCount: damagedItems.length,
    }
    completeCycle(cycle.id, stats)
    setShowFinish(false)
    setStep('done')
  }

  function handleDelete() {
    if (cycle) removeCycle(cycle.id)
    setShowDelete(false)
    navigate('/stock/inventory', { replace: true })
  }

  if (!cycle) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <icons.ui.search size={32} className="mb-3 text-fg-muted" />
        <h3 className="mb-1 text-lg font-medium text-fg-dim">Ciclo não encontrado</h3>
        <button type="button" onClick={() => navigate('/stock/inventory')} className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
          Voltar
        </button>
      </div>
    )
  }

  if (cycle.status === 'completed') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/stock/inventory')} className="rounded-xl p-1.5 text-fg-dim hover:text-fg hover:bg-input transition-colors">
            <icons.ui.back size={20} />
          </button>
          <h2 className="text-2xl font-bold tracking-tight">{cycle.name}</h2>
        </div>

        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
          <icons.ui.checkCircle size={32} className="mx-auto mb-2 text-emerald-500" />
          <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">Ciclo Concluído</h3>
          <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-300">
            Finalizado em {new Date(cycle.completedAt || '').toLocaleDateString('pt-BR')}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-card p-3 text-center shadow-[var(--shadow-card)]">
            <p className="text-2xl font-bold text-emerald-600">{cycle.verifiedCount}</p>
            <p className="text-[11px] text-fg-muted">Verificados</p>
          </div>
          <div className="rounded-xl bg-card p-3 text-center shadow-[var(--shadow-card)]">
            <p className="text-2xl font-bold text-red-600">{cycle.missingCount}</p>
            <p className="text-[11px] text-fg-muted">Ausentes</p>
          </div>
          <div className="rounded-xl bg-card p-3 text-center shadow-[var(--shadow-card)]">
            <p className="text-2xl font-bold text-amber-600">{cycle.damagedCount}</p>
            <p className="text-[11px] text-fg-muted">Danificados</p>
          </div>
        </div>

        {missingItems.length > 0 && (
          <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-600">Itens Ausentes</h3>
            <div className="space-y-1">
              {missingItems.map((c) => (
                <p key={c.itemId} className="text-xs text-fg-dim">{c.itemName} · {c.itemRoom}</p>
              ))}
            </div>
          </section>
        )}

        {damagedItems.length > 0 && (
          <section className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-600">Itens Danificados</h3>
            <div className="space-y-1">
              {damagedItems.map((c) => (
                <p key={c.itemId} className="text-xs text-fg-dim">{c.itemName} · {c.itemRoom}</p>
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">{cycle.name}</h2>
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
          <icons.ui.checkCircle size={32} className="mx-auto mb-2 text-emerald-500" />
          <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">Ciclo Concluído</h3>
        </div>
        <button type="button" onClick={() => navigate('/stock/inventory')} className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive">
          Voltar ao Inventário
        </button>
      </div>
    )
  }

  if (step === 'review') {
    const total = allItems.length
    const counted = counts.length
    const verified = verifiedItems.length
    const missing = missingItems.length
    const damaged = damagedItems.length

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/stock/inventory')} className="rounded-xl p-1.5 text-fg-dim hover:text-fg hover:bg-input transition-colors">
            <icons.ui.back size={20} />
          </button>
          <h2 className="text-2xl font-bold tracking-tight">{cycle.name}</h2>
        </div>

        <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)] text-center">
          <p className="text-3xl font-bold text-fg">{counted}/{total}</p>
          <p className="text-xs text-fg-muted mt-1">itens verificados</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-card p-3 text-center shadow-[var(--shadow-card)]">
            <icons.ui.check size={20} className="mx-auto mb-1 text-emerald-500" />
            <p className="text-lg font-bold text-fg">{verified}</p>
            <p className="text-[11px] text-fg-muted">Ok</p>
          </div>
          <div className="rounded-xl bg-card p-3 text-center shadow-[var(--shadow-card)]">
            <icons.ui.search size={20} className="mx-auto mb-1 text-red-500" />
            <p className="text-lg font-bold text-fg">{missing}</p>
            <p className="text-[11px] text-fg-muted">Ausentes</p>
          </div>
          <div className="rounded-xl bg-card p-3 text-center shadow-[var(--shadow-card)]">
            <icons.ui.alertTriangle size={20} className="mx-auto mb-1 text-amber-500" />
            <p className="text-lg font-bold text-fg">{damaged}</p>
            <p className="text-[11px] text-fg-muted">Danificados</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => { setCurrentIndex(0); setStep('counting') }} className="flex-1 rounded-xl bg-input py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive">
            Voltar à Contagem
          </button>
          <button type="button" onClick={() => setShowFinish(true)} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive">
            Finalizar Ciclo
          </button>
        </div>

        <ConfirmDialog
          open={showFinish}
          onClose={() => setShowFinish(false)}
          onConfirm={handleFinish}
          title="Finalizar Ciclo"
          message={`Você verificou ${counted} de ${total} itens. ${missing} ausente${missing !== 1 ? 's' : ''} e ${damaged} danificado${damaged !== 1 ? 's' : ''}. Confirmar finalização?`}
          confirmLabel="Finalizar"
        />
      </div>
    )
  }

  const progress = allItems.length > 0 ? Math.round((counts.length / allItems.length) * 100) : 0
  const isPendingEmpty = pendingItems.length === 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate('/stock/inventory')} className="rounded-xl p-1.5 text-fg-dim hover:text-fg hover:bg-input transition-colors">
          <icons.ui.back size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight truncate">{cycle.name}</h2>
          <p className="text-xs text-fg-muted">{sectionLabel(cycle.section)} · {allItems.length} itens</p>
        </div>
        <button type="button" onClick={() => setShowDelete(true)} className="rounded-xl p-1.5 text-fg-dim hover:text-red-500 hover:bg-input transition-colors">
          <icons.ui.trash size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-segmented">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs font-medium text-fg-muted shrink-0">{counts.length}/{allItems.length}</span>
      </div>

      {isPendingEmpty ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <icons.ui.checkCircle size={36} className="mb-2 text-emerald-500" />
          <p className="text-sm font-medium text-fg">Todos os itens foram verificados!</p>
          <button type="button" onClick={() => setStep('review')} className="mt-3 rounded-xl bg-emerald-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive">
            Revisar e Finalizar
          </button>
        </div>
      ) : currentItem ? (
        <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="mb-1 text-[11px] font-medium text-fg-muted">
            Item {counts.length + 1} de {allItems.length}
          </div>
          <h3 className="text-lg font-bold text-fg">{currentItem.name}</h3>
          <div className="mt-2 space-y-1 text-xs text-fg-dim">
            {currentItem.subcategory && <p>{currentItem.subcategory}</p>}
            {currentItem.serialNumber && <p>Nº Série: {currentItem.serialNumber}</p>}
            <p>Sala: {currentItem.room}</p>
            {currentItem.section === 'cabos' && currentItem.cableType && (
              <p>{currentItem.cableType}{currentItem.cableLength ? ` · ${currentItem.cableLength}m` : ''}</p>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => handleResult('verified')} className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-950/50 btn-interactive">
              <icons.ui.check size={18} />
              Presente
            </button>
            <button type="button" onClick={() => handleResult('missing')} className="flex items-center justify-center gap-1.5 rounded-xl bg-red-50 dark:bg-red-950/30 py-3 text-sm font-medium text-red-700 dark:text-red-400 transition-colors hover:bg-red-100 dark:hover:bg-red-950/50 btn-interactive">
              <icons.ui.search size={18} />
              Ausente
            </button>
          </div>
          <button type="button" onClick={() => handleResult('damaged')} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 py-3 text-sm font-medium text-amber-700 dark:text-amber-400 transition-colors hover:bg-amber-100 dark:hover:bg-amber-950/50 btn-interactive">
            <icons.ui.alertTriangle size={18} />
            Danificado
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <icons.ui.checkCircle size={36} className="mb-2 text-emerald-500" />
          <p className="text-sm font-medium text-fg">Contagem finalizada!</p>
          <button type="button" onClick={() => setStep('review')} className="mt-3 rounded-xl bg-emerald-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive">
            Revisar Resultados
          </button>
        </div>
      )}

      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Excluir Ciclo"
        message="Tem certeza? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="danger"
      />
    </div>
  )
}
