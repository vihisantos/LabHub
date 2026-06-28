import { useState } from 'react'
import type { StockMovementFormData, MovementType } from '../types'
import { movementTypes } from '../types'

interface MovementFormProps {
  itemId: string
  itemName: string
  currentRoom: string
  initialType?: MovementType
  onSave: (data: StockMovementFormData) => void
  onCancel: () => void
}

export function MovementForm({ itemId, itemName, currentRoom, initialType = 'mudanca_sala', onSave, onCancel }: MovementFormProps) {
  const [type, setType] = useState<MovementType>(initialType)
  const [toRoom, setToRoom] = useState('')
  const [description, setDescription] = useState('')
  const [replacedPart, setReplacedPart] = useState('')
  const [newPart, setNewPart] = useState('')
  const [performedBy, setPerformedBy] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      itemId,
      itemName,
      type,
      fromRoom: currentRoom,
      toRoom: type === 'mudanca_sala' ? toRoom : currentRoom,
      description,
      replacedPart,
      newPart,
      performedBy,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-fg-muted">Tipo de Movimentação</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as MovementType)}
          className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
        >
          {movementTypes.map((mt) => (
            <option key={mt.value} value={mt.value}>{mt.label}</option>
          ))}
        </select>
      </div>

      {type === 'mudanca_sala' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Sala de Destino</label>
          <input
            type="text"
            value={toRoom}
            onChange={(e) => setToRoom(e.target.value)}
            placeholder="Ex: Lab Info 2"
            className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            required
          />
        </div>
      )}

      {(type === 'conserto' || type === 'substituicao') && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Peça Substituída</label>
            <input
              type="text"
              value={replacedPart}
              onChange={(e) => setReplacedPart(e.target.value)}
              placeholder="Ex: SSD 240GB"
              className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Peça Nova</label>
            <input
              type="text"
              value={newPart}
              onChange={(e) => setNewPart(e.target.value)}
              placeholder="Ex: SSD 480GB"
              className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
        </>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-fg-muted">Descrição / Motivo</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: SSD com setores defeituosos"
          className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-fg-muted">Responsável</label>
        <input
          type="text"
          value={performedBy}
          onChange={(e) => setPerformedBy(e.target.value)}
          placeholder="Nome (opcional)"
          className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive"
        >
          Registrar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
