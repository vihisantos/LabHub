import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useKits } from '../hooks/useKits'
import { KitChecklist } from '../components/KitChecklist'
import { EmptyState } from '../../pcare/components/EmptyState'
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
  const { kits, update } = useKits()
  const [checking, setChecking] = useState(false)

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
        <h2 className="text-2xl font-bold tracking-tight">{kit.name}</h2>
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
    </div>
  )
}
