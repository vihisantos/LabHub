import { useState } from 'react'
import type { Part, PCPart } from '../types'
import { Modal } from './Modal'

interface AddPartToPcModalProps {
  open: boolean
  onClose: () => void
  parts: Part[]
  onConfirm: (part: PCPart) => void
}

export function AddPartToPcModal({ open, onClose, parts, onConfirm }: AddPartToPcModalProps) {
  const [selectedPartId, setSelectedPartId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  const selectedPart = parts.find((p) => p.id === selectedPartId)

  function handleConfirm() {
    if (!selectedPart) return
    const replacedPart: PCPart = {
      partId: selectedPart.id,
      partName: selectedPart.name,
      category: selectedPart.category,
      quantity,
      replacedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
      notes: notes || undefined,
    }
    onConfirm(replacedPart)
    setSelectedPartId('')
    setQuantity(1)
    setNotes('')
  }

  const availableParts = parts.filter((p) => p.quantity > 0)

  return (
    <Modal open={open} onClose={onClose} title="Adicionar Peça">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Peça</label>
          <select
            value={selectedPartId}
            onChange={(e) => setSelectedPartId(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
          >
            <option value="">Selecione uma peça</option>
            {availableParts.map((part) => (
              <option key={part.id} value={part.id}>
                {part.name} ({part.quantity} disponível)
              </option>
            ))}
          </select>
          {availableParts.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">Nenhuma peça disponível no estoque.</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">Quantidade</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value), selectedPart?.quantity ?? 99)))}
            min={1}
            max={selectedPart?.quantity ?? 1}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
          />
          {selectedPart && (
            <p className="mt-1 text-xs text-slate-500">Máx: {selectedPart.quantity}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">Observação (opcional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Fan com ruído"
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 transition-colors focus:border-cyan-500"
          />
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedPartId}
          className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md disabled:opacity-50"
        >
          Adicionar ao PC
        </button>
      </div>
    </Modal>
  )
}
