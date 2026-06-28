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
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/stock/kits')}
          className="rounded-lg p-1 text-fg-dim hover:text-fg"
          aria-label="Voltar"
        >
          <icons.ui.back size={20} />
        </button>
        <h2 className="text-xl font-semibold">{kit.name}</h2>
      </div>

      <div className="flex flex-col gap-3">
        <section className="rounded-xl border border-line bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Informações</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-fg-muted">Sala:</span> <span className="text-fg">{kit.room || '-'}</span></div>
            <div><span className="text-fg-muted">Itens:</span> <span className="text-fg">{kit.items.length}</span></div>
            <div>
              <span className="text-fg-muted">Última conferência:</span>{' '}
              <span className="text-fg">{kit.lastChecked ? formatDate(kit.lastChecked) : 'Nunca'}</span>
            </div>
            <div>
              <span className="text-fg-muted">Status:</span>{' '}
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
          <section className="rounded-xl border border-line bg-card/50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">Conferência</h3>
            <KitChecklist kit={kit} onSave={handleSaveChecklist} />
          </section>
        ) : (
          <section className="rounded-xl border border-line bg-card/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Itens do Kit</h3>
              <button
                type="button"
                onClick={() => setChecking(true)}
                className="rounded-md bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1 text-xs font-medium text-fg shadow-sm shadow-cyan-500/20 hover:shadow-md"
              >
                Conferir
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {kit.items.map((item) => (
                <div
                  key={item.name}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                    item.present ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-input/50'
                  }`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    item.present ? 'border-emerald-500 bg-emerald-500' : 'border-line'
                  }`}>
                    {item.present && <icons.ui.check size={10} className="text-fg" />}
                  </span>
                  <span className={`text-sm ${                    item.present ? 'text-emerald-700 dark:text-emerald-300' : 'text-fg'}`}>
                    {item.name}
                  </span>
                  {item.expected > 1 && (
                    <span className="text-[10px] text-fg-muted">(×{item.expected})</span>
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
