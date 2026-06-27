import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useChecklistTemplates } from '../hooks/useChecklists'
import { usePCs } from '../hooks/usePCs'
import { icons } from '../../../lib/icons'
import type { PCChecklistItem } from '../types/checklist'

export function ChecklistExecute() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const { templates } = useChecklistTemplates()
  const { pcs } = usePCs()

  const template = templates.find((t) => t.id === templateId)

  const [selectedPcId, setSelectedPcId] = useState('')
  const [started, setStarted] = useState(false)
  const [items, setItems] = useState<PCChecklistItem[]>([])

  const pcSelect = pcs.filter((p) => !template || p.labName === template.labName || !template.labName)

  function startChecklist() {
    if (!template || !selectedPcId) return
    setItems(
      template.items.map((item) => ({
        itemId: item.id,
        label: item.label,
        category: item.category,
        done: false,
        doneAt: null,
      })),
    )
    setStarted(true)
  }

  function toggleItem(itemId: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId
          ? { ...item, done: !item.done, doneAt: !item.done ? ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any) : null }
          : item,
      ),
    )
  }

  const doneCount = items.filter((i) => i.done).length
  const progress = items.length > 0 ? (doneCount / items.length) * 100 : 0
  const allDone = items.length > 0 && doneCount === items.length

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-20">
        <icons.nav.checklists size={40} />
        <p className="text-sm text-fg-dim">Template não encontrado</p>
        <button type="button" onClick={() => navigate('/pcare/checklists')} className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2 text-sm font-medium text-fg">Voltar</button>
      </div>
    )
  }

  if (!started) {
    return (
      <div className="flex flex-col gap-6 py-6">
        <button
          type="button"
          onClick={() => navigate('/pcare/checklists')}
          className="self-start text-sm text-fg-dim hover:text-fg"
        >
          ← Voltar
        </button>

        <div className="text-center">
          <icons.nav.checklists size={48} className="mx-auto" />
          <h1 className="mt-3 text-xl font-bold text-fg">{template.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">{template.labName || 'Todos os laboratórios'} · {template.items.length} itens</p>
        </div>

        <div className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Itens do Checklist</h3>
          <div className="flex flex-col gap-2">
            {template.items.map((item, i) => (
              <div key={item.id} className="flex items-center gap-2 text-sm text-slate-300">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-input text-[10px] text-fg-muted">{i + 1}</span>
                <span>{item.label}</span>
                {item.optional && <span className="text-[10px] text-slate-600">(opcional)</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Selecionar PC</h3>
          {pcSelect.length === 0 ? (
            <p className="text-sm text-fg-muted">Nenhum PC encontrado para este laboratório.</p>
          ) : (
            <select
              value={selectedPcId}
              onChange={(e) => setSelectedPcId(e.target.value)}
              className="w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-fg outline-none focus:border-cyan-500"
            >
              <option value="">Selecione um PC</option>
              {pcSelect.map((pc) => (
                <option key={pc.id} value={pc.id}>{pc.labName} — {pc.pcNumber}</option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={startChecklist}
          disabled={!selectedPcId}
          className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 py-4 text-lg font-bold text-fg shadow-lg shadow-cyan-500/25 transition-all hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Iniciar Checklist
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col gap-4 pb-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (doneCount > 0 && !window.confirm('Perderá o progresso atual. Continuar?')) return
            setStarted(false)
            setItems([])
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-fg-dim hover:bg-input"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-fg">{template.name}</h1>
          <p className="text-[10px] text-fg-muted">{doneCount}/{items.length} concluídos</p>
        </div>
        <span className="text-2xl">{allDone ? <icons.ui.partyPopper size={24} /> : <icons.nav.checklists size={24} />}</span>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-input">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-col gap-2 flex-1">
        {items.map((item) => (
          <button
            key={item.itemId}
            type="button"
            onClick={() => toggleItem(item.itemId)}
            className={`flex items-center gap-4 rounded-xl border p-5 text-left transition-all duration-200 active:scale-[0.98] ${
              item.done
                ? 'border-emerald-700/50 bg-emerald-900/20'
                : 'border-line bg-input/50 hover:border-slate-600'
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-lg transition-all ${
                item.done
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-input text-fg-muted'
              }`}
            >
              {item.done ? <icons.ui.check size={20} /> : String(items.indexOf(item) + 1)}
            </span>
            <span className={`text-base font-medium ${item.done ? 'text-emerald-300 line-through' : 'text-fg'}`}>
              {item.label}
            </span>
            {item.done && (
              <span className="ml-auto text-xs text-emerald-500/70">Concluído</span>
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={!allDone}
        onClick={() => navigate('/pcare/checklists')}
        className={`w-full rounded-xl py-4 text-lg font-bold text-fg shadow-lg transition-all ${
          allDone
            ? 'bg-gradient-to-r from-emerald-600 to-green-600 shadow-emerald-500/25 hover:shadow-xl'
            : 'bg-input text-fg-muted cursor-not-allowed'
        }`}
      >
        {allDone ? <><icons.ui.check size={20} className="inline" /> Finalizar Checklist</> : `${doneCount}/${items.length} — Complete todos os itens`}
      </button>
    </div>
  )
}
