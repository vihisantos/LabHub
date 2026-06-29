import { useState } from 'react'
import type { StockMovementFormData, MovementType } from '../types'
import { movementTypes } from '../types'

interface MovementFormProps {
  itemId: string
  itemName: string
  currentRoom: string
  initialType?: MovementType
  initial?: Partial<StockMovementFormData>
  onSave: (data: StockMovementFormData) => void
  onCancel: () => void
}

export function MovementForm({ itemId, itemName, currentRoom, initialType = 'mudanca_sala', initial, onSave, onCancel }: MovementFormProps) {
  const [type, setType] = useState<MovementType>(initial?.type as MovementType || initialType)
  const [toRoom, setToRoom] = useState(initial?.toRoom || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [replacedPart, setReplacedPart] = useState(initial?.replacedPart || '')
  const [newPart, setNewPart] = useState(initial?.newPart || '')
  const [performedBy, setPerformedBy] = useState(initial?.performedBy || '')
  const [borrowedBy, setBorrowedBy] = useState(initial?.borrowedBy || '')
  const [borrowerContact, setBorrowerContact] = useState(initial?.borrowerContact || '')
  const [expectedReturnAt, setExpectedReturnAt] = useState(initial?.expectedReturnAt || '')
  const [destinationRoom, setDestinationRoom] = useState(initial?.destinationRoom || '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      itemId,
      itemName,
      type,
      fromRoom: currentRoom,
      toRoom: type === 'mudanca_sala' ? toRoom : type === 'emprestimo' ? destinationRoom : currentRoom,
      description,
      replacedPart,
      newPart,
      performedBy,
      borrowedBy,
      borrowerContact,
      expectedReturnAt,
      returnedAt: type === 'devolucao' ? new Date().toISOString() : '',
      destinationRoom: type === 'emprestimo' ? destinationRoom : '',
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

      {type === 'emprestimo' && (
        <>
          <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 p-3 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">Dados do Empréstimo</p>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Quem Pegou *</label>
              <input
                type="text"
                value={borrowedBy}
                onChange={(e) => setBorrowedBy(e.target.value)}
                placeholder="Nome do aluno/professor"
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Contato</label>
              <input
                type="text"
                value={borrowerContact}
                onChange={(e) => setBorrowerContact(e.target.value)}
                placeholder="Email ou telefone"
                className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Previsão de Devolução</label>
                <input
                  type="date"
                  value={expectedReturnAt}
                  onChange={(e) => setExpectedReturnAt(e.target.value)}
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Sala de Destino</label>
                <input
                  type="text"
                  value={destinationRoom}
                  onChange={(e) => setDestinationRoom(e.target.value)}
                  placeholder="Ex: Lab Info 2"
                  className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {type === 'devolucao' && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Registro de Devolução</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Recebido por</label>
            <input
              type="text"
              value={performedBy}
              onChange={(e) => setPerformedBy(e.target.value)}
              placeholder="Quem recebeu o item"
              className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
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

      {type !== 'devolucao' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">Descrição / Motivo</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === 'emprestimo' ? 'Motivo do empréstimo (opcional)' : 'Ex: SSD com setores defeituosos'}
            className="w-full rounded-xl border-none bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
      )}

      {type !== 'devolucao' && (
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
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive"
        >
          {initial ? 'Salvar' : 'Registrar'}
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
