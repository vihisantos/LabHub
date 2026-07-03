import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { stockService } from '../services/stockService'
import { pcService } from '../../pcare/services/pcService'
import { icons } from '../../../lib/icons'
import type { StockItem } from '../types'
import type { PC } from '../../pcare/types/pc'

interface PCItem {
  id: string
  labName: string
  pcNumber: string
  roomLocation: string
  cleaningStatus: PC['cleaningStatus']
  restorationStatus: PC['restorationStatus']
  hasConfig: boolean
}

type PipelineItem = StockItem | PCItem

interface ColumnDef {
  id: string
  title: string
  icon: keyof typeof icons.ui | keyof typeof icons.nav
  iconSet: 'ui' | 'nav'
  color: string
  bgColor: string
  items: PipelineItem[]
}

function isStockItem(item: PipelineItem): item is StockItem {
  return 'section' in item
}

const pcToItem = (pc: PC): PCItem => ({
  id: pc.id,
  labName: pc.labName,
  pcNumber: pc.pcNumber,
  roomLocation: pc.roomLocation,
  cleaningStatus: pc.cleaningStatus,
  restorationStatus: pc.restorationStatus,
  hasConfig: !!pc.config?.osType,
})

function PipelineCard({ item, onActivate }: { item: PipelineItem; onActivate?: (id: string) => void }) {
  const navigate = useNavigate()

  if (isStockItem(item)) {
    const missingParts = item.pcParts?.filter(p => !p.present) || []
    const allPresent = item.pcParts && item.pcParts.length > 0 && missingParts.length === 0

    return (
      <button
        type="button"
        onClick={() => navigate(`/stock/items/${item.id}`)}
        className="group w-full rounded-xl bg-card p-3 text-left shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elevated)]"
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-fg truncate">{item.name}</span>
        </div>
        {item.room && <p className="text-[11px] text-fg-muted">{item.room}</p>}
        {item.pcParts && item.pcParts.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {item.pcParts.map(p => (
              <div key={p.partName} className="flex items-center gap-1.5 text-[11px]">
                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${p.present ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'}`}>
                  {p.present ? <icons.ui.check size={8} /> : <icons.ui.close size={8} />}
                </span>
                <span className={p.present ? 'text-fg' : 'text-fg-dim'}>{p.partName}</span>
              </div>
            ))}
          </div>
        )}
        {allPresent && onActivate && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onActivate(item.id) }}
            className="mt-2 w-full rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-1.5 text-[11px] font-medium text-white transition-all hover:shadow-md"
          >
            Ativar agora
          </button>
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => navigate(`/pcare/pcs/${item.id}`)}
      className="group w-full rounded-xl bg-card p-3 text-left shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-elevated)]"
    >
      <div className="mb-1 flex items-center gap-2">
        <icons.nav.pcs size={14} className="shrink-0 text-violet-500" />
        <span className="text-sm font-semibold text-fg truncate">{item.labName} — {item.pcNumber}</span>
      </div>
      {item.roomLocation && <p className="text-[11px] text-fg-muted">{item.roomLocation}</p>}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {item.cleaningStatus !== 'done' && (
          <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500 font-medium">
            Limpeza: {item.cleaningStatus === 'in_progress' ? 'Em andamento' : 'Pendente'}
          </span>
        )}
        {item.restorationStatus !== 'done' && (
          <span className="rounded-md bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-500 font-medium">
            Restauração: {item.restorationStatus === 'in_progress' ? 'Em andamento' : 'Pendente'}
          </span>
        )}
        {!item.hasConfig && (
          <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-500 font-medium">
            Sem SO
          </span>
        )}
      </div>
    </button>
  )
}

function ColumnIcon({ col }: { col: ColumnDef }) {
  const set = col.iconSet === 'nav' ? icons.nav : icons.ui
  const Icon = set[col.icon] as React.ComponentType<{ size?: number; className?: string }>
  return <Icon size={16} />
}

export function Pipeline() {
  const navigate = useNavigate()
  const [, forceUpdate] = useState(0)

  const columns = useMemo((): ColumnDef[] => {
    const stockItems = stockService.getAll().filter(i => i.section === 'maquinas')
    const pcs = pcService.getAll().map(pcToItem)

    const cols: ColumnDef[] = [
      {
        id: 'missing_parts',
        title: 'Aguardando Peças',
        icon: 'hardDrive',
        iconSet: 'ui',
        color: 'text-amber-500',
        bgColor: 'bg-amber-500',
        items: stockItems
          .filter(i => !i.linkedPcId && i.pcParts && i.pcParts.some(p => !p.present)),
      },
      {
        id: 'ready_to_activate',
        title: 'Pronto pra Ativar',
        icon: 'checkCircle',
        iconSet: 'ui',
        color: 'text-emerald-500',
        bgColor: 'bg-emerald-500',
        items: stockItems
          .filter(i => !i.linkedPcId && i.pcParts && i.pcParts.length > 0 && i.pcParts.every(p => p.present)),
      },
      {
        id: 'needs_config',
        title: 'Configurar SO',
        icon: 'pcs',
        iconSet: 'nav',
        color: 'text-cyan-500',
        bgColor: 'bg-cyan-500',
        items: pcs.filter(p => !p.hasConfig),
      },
      {
        id: 'needs_cleaning',
        title: 'Limpeza',
        icon: 'brushCleaning',
        iconSet: 'ui',
        color: 'text-violet-500',
        bgColor: 'bg-violet-500',
        items: pcs.filter(p => p.hasConfig && p.cleaningStatus !== 'done'),
      },
      {
        id: 'needs_restoration',
        title: 'Restauração',
        icon: 'refresh',
        iconSet: 'ui',
        color: 'text-orange-500',
        bgColor: 'bg-orange-500',
        items: pcs.filter(p => p.hasConfig && p.cleaningStatus === 'done' && p.restorationStatus !== 'done'),
      },
      {
        id: 'completed',
        title: 'Concluído',
        icon: 'partyPopper',
        iconSet: 'ui',
        color: 'text-emerald-500',
        bgColor: 'bg-emerald-500',
        items: pcs.filter(p => p.hasConfig && p.cleaningStatus === 'done' && p.restorationStatus === 'done'),
      },
    ]

    return cols
  }, [])

  function handleActivate(stockItemId: string) {
    const item = stockService.getAll().find(i => i.id === stockItemId)
    if (!item) return
    const now = new Date().toISOString()
    const pc = pcService.create({
      labName: item.room || 'Laboratório',
      pcNumber: item.name,
      assetTag: item.serialNumber || '',
      roomLocation: item.room || '',
      specs: { cpu: '', ram: '', storage: '' },
      config: { osType: '', osVersion: '', osEdition: '', pcType: '', domain: '' },
      cleaningStatus: 'pending',
      restorationStatus: 'pending',
      softwareInstalled: [],
      partsReplaced: [],
      observations: item.notes || '',
      photos: [],
      lastIntervention: null,
      createdAt: now,
      updatedAt: now,
    })
    stockService.update(item.id, {
      linkedPcId: pc.id,
      linkedPcLabel: `${pc.labName} — ${pc.pcNumber}`,
    })
    forceUpdate(n => n + 1)
    navigate(`/pcare/pcs/${pc.id}/edit`)
  }

  const total = columns.reduce((sum, col) => sum + col.items.length, 0)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pipeline</h2>
          <p className="text-xs text-fg-muted">{total} itens no total</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-card px-3 py-2 text-xs font-medium text-fg-dim shadow-[var(--shadow-card)] hover:text-fg transition-colors"
        >
          <icons.ui.refresh size={14} className="inline mr-1" />
          Atualizar
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ scrollSnapType: 'x mandatory' }}>
        {columns.map(col => {
          const IconComponent = (col.iconSet === 'nav' ? icons.nav : icons.ui)[col.icon] as React.ComponentType<{ size?: number; className?: string }>

          return (
            <div
              key={col.id}
              className="flex shrink-0 flex-col gap-2"
              style={{ width: '280px', scrollSnapAlign: 'start' }}
            >
              <div className="flex items-center gap-2 px-1">
                <IconComponent size={16} className={col.color} />
                <h3 className="text-sm font-semibold text-fg">{col.title}</h3>
                <span className={`ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${col.bgColor}`}>
                  {col.items.length}
                </span>
              </div>

              <div className="flex flex-col gap-2 min-h-[200px] rounded-xl bg-card/50 p-2 shadow-[var(--shadow-card)]">
                {col.items.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center">
                    <p className="text-[11px] text-fg-muted">Vazio</p>
                  </div>
                ) : (
                  col.items.map(item => (
                    <PipelineCard
                      key={item.id}
                      item={item}
                      onActivate={col.id === 'ready_to_activate' ? handleActivate : undefined}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
