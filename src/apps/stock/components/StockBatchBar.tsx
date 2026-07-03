import { useState } from 'react'
import type { StockItem, StockMovementFormData } from '../types'
import { Modal, ConfirmDialog } from '../../pcare/components/Modal'
import { icons } from '../../../lib/icons'
import { exportStockItemsCSV } from '../utils/export'

interface StockBatchBarProps {
  selected: Set<string>
  items: StockItem[]
  onClear: () => void
  onExit: () => void
  onUpdate: (ids: string[], data: Partial<StockItem>) => void
  onDelete: (ids: string[]) => void
  onCreateMovement: (data: StockMovementFormData) => void
}

export function StockBatchBar({ selected, items, onClear, onExit, onUpdate, onDelete, onCreateMovement }: StockBatchBarProps) {
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLoanModal, setShowLoanModal] = useState(false)
  const [toRoom, setToRoom] = useState('')
  const [loanBorrowedBy, setLoanBorrowedBy] = useState('')
  const [loanBorrowerContact, setLoanBorrowerContact] = useState('')
  const [loanExpectedReturn, setLoanExpectedReturn] = useState('')
  const [loanDestinationRoom, setLoanDestinationRoom] = useState('')

  const selectedItems = items.filter((i) => selected.has(i.id))
  const ids = Array.from(selected)

  function handleMove() {
    if (!toRoom.trim()) return
    for (const item of selectedItems) {
      onCreateMovement({
        itemId: item.id,
        itemName: item.name,
        type: 'mudanca_sala',
        fromRoom: item.room,
        toRoom: toRoom.trim(),
        description: `Movido em lote para ${toRoom.trim()}`,
        replacedPart: '',
        newPart: '',
        performedBy: '',
      })
    }
    onUpdate(ids, { room: toRoom.trim() })
    setToRoom('')
    setShowMoveModal(false)
    onClear()
  }

  function handleRepair() {
    for (const item of selectedItems) {
      onCreateMovement({
        itemId: item.id,
        itemName: item.name,
        type: 'conserto',
        fromRoom: item.room,
        toRoom: item.room,
        description: 'Enviado para conserto em lote',
        replacedPart: '',
        newPart: '',
        performedBy: '',
      })
    }
    onUpdate(ids, { status: 'em_conserto' })
    onClear()
  }

  function handleDiscard() {
    for (const item of selectedItems) {
      onCreateMovement({
        itemId: item.id,
        itemName: item.name,
        type: 'descarte',
        fromRoom: item.room,
        toRoom: '',
        description: 'Descartado em lote',
        replacedPart: '',
        newPart: '',
        performedBy: '',
      })
    }
    onUpdate(ids, { status: 'descartado' })
    setShowDiscardConfirm(false)
    onClear()
  }

  function handleDelete() {
    onDelete(ids)
    setShowDeleteConfirm(false)
    onClear()
  }

  function handleLoan() {
    if (!loanBorrowedBy.trim()) return
    const names = selectedItems.map((i) => i.name)
    for (const item of selectedItems) {
      onCreateMovement({
        itemId: item.id,
        itemName: item.name,
        type: 'emprestimo',
        fromRoom: item.room,
        toRoom: loanDestinationRoom || item.room,
        description: 'Emprestado em lote',
        replacedPart: '',
        newPart: '',
        performedBy: '',
        borrowedBy: loanBorrowedBy.trim(),
        borrowerContact: loanBorrowerContact.trim(),
        expectedReturnAt: loanExpectedReturn,
        returnedAt: '',
        destinationRoom: loanDestinationRoom.trim(),
      })
    }
    onUpdate(ids, { status: 'emprestado', room: loanDestinationRoom.trim() || undefined })

    // Notificar empréstimo
    for (const name of names) {
      fetch('/api/push/notify-loan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: name,
          borrowedBy: loanBorrowedBy.trim(),
          expectedReturnAt: loanExpectedReturn,
        }),
      }).catch(() => {})
    }

    setLoanBorrowedBy('')
    setLoanBorrowerContact('')
    setLoanExpectedReturn('')
    setLoanDestinationRoom('')
    setShowLoanModal(false)
    onClear()
  }

  function handleExport() {
    exportStockItemsCSV(selectedItems)
    onClear()
  }

  return (
    <>
      <div className="fixed bottom-20 left-4 right-4 z-40 animate-[slide-up_0.25s_ease-out]">
        <div className="rounded-xl bg-card p-3 shadow-lg shadow-black/20 dark:shadow-black/50">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-fg">{selected.size} selecionado{selected.size > 1 ? 's' : ''}</span>
            <button
              type="button"
              onClick={onExit}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-fg-muted hover:bg-input hover:text-fg"
            >
              <icons.ui.close size={14} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setShowLoanModal(true)}
              className="flex items-center gap-1 rounded-lg bg-violet-50 dark:bg-violet-950/30 px-2.5 py-1.5 text-[11px] font-medium text-violet-700 dark:text-violet-400 transition-colors btn-interactive"
            >
              <icons.ui.user size={12} />
              Emprestar
            </button>
            <button
              type="button"
              onClick={() => setShowMoveModal(true)}
              className="flex items-center gap-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 px-2.5 py-1.5 text-[11px] font-medium text-cyan-700 dark:text-cyan-400 transition-colors btn-interactive"
            >
              <icons.ui.refresh size={12} />
              Mover
            </button>
            <button
              type="button"
              onClick={handleRepair}
              className="flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 transition-colors btn-interactive"
            >
              <icons.nav.parts size={12} />
              Consertar
            </button>
            <button
              type="button"
              onClick={() => setShowDiscardConfirm(true)}
              className="flex items-center gap-1 rounded-lg bg-red-50 dark:bg-red-950/30 px-2.5 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-400 transition-colors btn-interactive"
            >
              <icons.ui.trash size={12} />
              Descartar
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1 rounded-lg bg-input px-2.5 py-1.5 text-[11px] font-medium text-fg-dim transition-colors btn-interactive"
            >
              <icons.ui.fileBarChart size={12} />
              CSV
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1 rounded-lg bg-red-50 dark:bg-red-950/30 px-2.5 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-400 transition-colors btn-interactive"
            >
              <icons.ui.close size={12} />
              Deletar
            </button>
          </div>
        </div>
      </div>

      <Modal open={showLoanModal} onClose={() => setShowLoanModal(false)} title="Emprestar em Lote">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-fg-dim">Emprestar {selected.size} item{selected.size > 1 ? 'ns' : ''} para:</p>
          <input
            type="text"
            value={loanBorrowedBy}
            onChange={(e) => setLoanBorrowedBy(e.target.value)}
            placeholder="Nome de quem pegou *"
            className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            autoFocus
            required
          />
          <input
            type="text"
            value={loanBorrowerContact}
            onChange={(e) => setLoanBorrowerContact(e.target.value)}
            placeholder="Contato (email/telefone)"
            className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={loanExpectedReturn}
              onChange={(e) => setLoanExpectedReturn(e.target.value)}
              className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
            <input
              type="text"
              value={loanDestinationRoom}
              onChange={(e) => setLoanDestinationRoom(e.target.value)}
              placeholder="Sala de destino"
              className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLoan}
              className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 shadow-sm btn-interactive"
            >
              Emprestar
            </button>
            <button
              type="button"
              onClick={() => setShowLoanModal(false)}
              className="rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showMoveModal} onClose={() => setShowMoveModal(false)} title="Mover em Lote">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-fg-dim">Mover {selected.size} item{selected.size > 1 ? 'ns' : ''} para:</p>
          <input
            type="text"
            value={toRoom}
            onChange={(e) => setToRoom(e.target.value)}
            placeholder="Sala de destino"
            className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleMove}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive"
            >
              Mover
            </button>
            <button
              type="button"
              onClick={() => setShowMoveModal(false)}
              className="rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={handleDiscard}
        title="Descartar em Lote"
        message={`Tem certeza que deseja descartar ${selected.size} item${selected.size > 1 ? 'ns' : ''}?`}
        confirmLabel="Descartar"
        variant="danger"
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Deletar Permanentemente"
        message={`Tem certeza que deseja deletar ${selected.size} item${selected.size > 1 ? 'ns' : ''}? Esta ação não pode ser desfeita.`}
        confirmLabel="Deletar"
        variant="danger"
      />
    </>
  )
}
