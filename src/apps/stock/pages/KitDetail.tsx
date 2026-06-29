import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useKits } from '../hooks/useKits'
import { KitChecklist } from '../components/KitChecklist'
import { EmptyState } from '../../pcare/components/EmptyState'
import { Modal, ConfirmDialog } from '../../pcare/components/Modal'
import { icons } from '../../../lib/icons'
import type { KitItem, KitStatus } from '../types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function KitDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { kits, update, remove } = useKits()
  const [checking, setChecking] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [editName, setEditName] = useState('')
  const [editRoom, setEditRoom] = useState('')
  const [editItems, setEditItems] = useState('')

  const kit = kits.find((k) => k.id === id)

  if (!kit) {
    return (
      <EmptyState
        icon={icons.ui.search}
        title="Kit não encontrado"
        action={{ label: 'Voltar', onClick: () => navigate('/stock/kits') }}
      />
    )
  }

  function handleSaveChecklist(items: KitItem[]) {
    const allPresent = items.every((i) => i.present)
    const status: KitStatus = allPresent ? 'ok' : 'incompleto'
    update(kit!.id, {
      items,
      lastChecked: new Date().toISOString(),
      status,
    })
    setChecking(false)
  }

  function openEdit() {
    setEditName(kit.name)
    setEditRoom(kit.room)
    setEditItems(kit.items.map((i) => i.name).join('\n'))
    setShowEdit(true)
  }

  function handleSaveEdit() {
    if (!editName.trim()) return
    const items = editItems
      .split('\n')
      .filter((l) => l.trim())
      .map((name) => {
        const existing = kit.items.find((i) => i.name === name.trim())
        return existing || { name: name.trim(), expected: 1, present: false }
      })
    update(kit.id, { name: editName.trim(), room: editRoom.trim(), items })
    setShowEdit(false)
  }

  function handleDelete() {
    remove(kit.id)
    setShowDelete(false)
    navigate('/stock/kits', { replace: true })
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/stock/kits')}
          className="rounded-xl p-1.5 text-fg-dim hover:text-fg hover:bg-input transition-colors"
          aria-label="Voltar"
        >
          <icons.ui.back size={20} />
        </button>
        <h2 className="text-2xl font-bold tracking-tight flex-1">{kit.name}</h2>
        <button
          type="button"
          onClick={openEdit}
          className="rounded-xl bg-card p-2 text-fg-dim hover:text-fg hover:bg-input transition-colors shadow-[var(--shadow-card)]"
          aria-label="Editar"
        >
          <icons.ui.edit size={18} />
        </button>
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="rounded-xl bg-card p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shadow-[var(--shadow-card)]"
          aria-label="Deletar"
        >
          <icons.ui.trash size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Informações</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-fg-muted font-medium">Sala:</span> <span className="text-fg">{kit.room || '-'}</span></div>
            <div><span className="text-fg-muted font-medium">Itens:</span> <span className="text-fg">{kit.items.length}</span></div>
            <div>
              <span className="text-fg-muted font-medium">Última conferência:</span>{' '}
              <span className="text-fg">{kit.lastChecked ? formatDate(kit.lastChecked) : 'Nunca'}</span>
            </div>
            <div>
              <span className="text-fg-muted font-medium">Status:</span>{' '}
              <span className={`font-medium ${
                kit.status === 'ok' ? 'text-emerald-600 dark:text-emerald-400' :
                kit.status === 'incompleto' ? 'text-amber-600 dark:text-amber-400' : 'text-fg-muted'
              }`}>
                {kit.status === 'ok' ? 'Completo' : kit.status === 'incompleto' ? 'Incompleto' : 'Não Conferido'}
              </span>
            </div>
          </div>
        </section>

        {checking ? (
          <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Conferência</h3>
            <KitChecklist kit={kit} onSave={handleSaveChecklist} />
          </section>
        ) : (
          <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Itens do Kit</h3>
              <button
                type="button"
                onClick={() => setChecking(true)}
                className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors btn-interactive"
              >
                Conferir
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {kit.items.map((item) => (
                <div
                  key={item.name}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-3 ${
                    item.present ? 'bg-emerald-50 dark:bg-emerald-900/30 shadow-sm' : 'bg-input shadow-[var(--shadow-card)]'
                  }`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg ${
                    item.present ? 'bg-emerald-500' : 'border-2 border-line'
                  }`}>
                    {item.present && <icons.ui.check size={12} className="text-white" />}
                  </span>
                  <span className={`text-sm ${                    item.present ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-fg'}`}>
                    {item.name}
                  </span>
                  {item.expected > 1 && (
                    <span className="text-[11px] text-fg-muted">(×{item.expected})</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Editar Kit">
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Nome do Kit</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Ex: Notebook Dell Latitude"
              className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Sala</label>
            <input
              type="text"
              value={editRoom}
              onChange={(e) => setEditRoom(e.target.value)}
              placeholder="Ex: Lab Info 1"
              className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Itens (um por linha)</label>
            <textarea
              value={editItems}
              onChange={(e) => setEditItems(e.target.value)}
              placeholder={"Mouse\nFonte\nCarregador"}
              rows={4}
              className="w-full rounded-xl bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 shadow-sm btn-interactive"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setShowEdit(false)}
              className="rounded-xl bg-input px-4 py-2.5 text-sm font-medium text-fg-dim transition-colors hover:bg-input/80 btn-interactive"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Deletar Kit"
        message={`Tem certeza que deseja deletar "${kit.name}" permanentemente? Esta ação não pode ser desfeita.`}
        confirmLabel="Deletar"
        variant="danger"
      />
    </div>
  )
}
