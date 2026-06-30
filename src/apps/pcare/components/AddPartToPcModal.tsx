import { useState } from 'react'
import type { Part, PCPart } from '../types'
import { Modal } from './Modal'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../lib/components/ui'

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
      replacedAt: new Date().toISOString(),
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
          <label className="mb-1 block text-xs text-fg-muted">Peça</label>
          <Select value={selectedPartId} onValueChange={setSelectedPartId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione uma peça" />
            </SelectTrigger>
            <SelectContent>
              {availableParts.map((part) => (
                <SelectItem key={part.id} value={part.id}>
                  {part.name} ({part.quantity} disponível)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableParts.length === 0 && (
            <p className="mt-1 text-xs text-fg-muted">Nenhuma peça disponível no estoque.</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-fg-muted">Quantidade</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value), selectedPart?.quantity ?? 99)))}
            min={1}
            max={selectedPart?.quantity ?? 1}
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-cyan-500"
          />
          {selectedPart && (
            <p className="mt-1 text-xs text-fg-muted">Máx: {selectedPart.quantity}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-fg-muted">Observação (opcional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Fan com ruído"
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-muted transition-colors focus:border-cyan-500"
          />
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedPartId}
          className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md disabled:opacity-50"
        >
          Adicionar ao PC
        </button>
      </div>
    </Modal>
  )
}
