import type { AssetRecord, AssetFilters } from './types'
import { pcService } from '../../apps/pcare/services/pcService'
import { stockService } from '../../apps/stock/services/stockService'
import { ticketService } from '../../apps/chamados/services/ticketService'

function buildAssetFromPc(pc: any): AssetRecord {
  const openTickets = ticketService.getOpenByAsset(pc.id, 'pc')
  return {
    id: pc.id,
    source: 'pcare',
    name: `${pc.labName} — ${pc.pcNumber}`,
    type: 'Desktop',
    subcategory: 'Desktop',
    patrimony: pc.assetTag || '',
    room: pc.roomLocation || '',
    status: 'ativo',
    openTickets: openTickets.length,
    lastTicketAt: openTickets[0]?.createdAt || null,
    createdAt: pc.createdAt,
  }
}

function buildAssetFromStock(item: any): AssetRecord {
  const openTickets = ticketService.getOpenByAsset(item.id, 'stock')
  return {
    id: item.id,
    source: 'stock',
    name: item.name,
    type: item.subcategory,
    subcategory: item.subcategory,
    patrimony: item.serialNumber || '',
    room: item.room || '',
    status: item.status,
    openTickets: openTickets.length,
    lastTicketAt: openTickets[0]?.createdAt || null,
    createdAt: item.createdAt,
  }
}

function matchesFilters(asset: AssetRecord, filters: AssetFilters): boolean {
  if (filters.source && asset.source !== filters.source) return false
  if (filters.room && asset.room !== filters.room) return false
  if (filters.type && asset.type !== filters.type) return false
  if (filters.status && asset.status !== filters.status) return false
  if (filters.search) {
    const q = filters.search.toLowerCase()
    if (
      !asset.name.toLowerCase().includes(q) &&
      !asset.patrimony.toLowerCase().includes(q) &&
      !asset.room.toLowerCase().includes(q) &&
      !asset.type.toLowerCase().includes(q)
    ) return false
  }
  return true
}

function getAll(filters: AssetFilters | undefined, unfiltered: boolean): AssetRecord[] {
  const pcs = (unfiltered ? pcService.getAllUnfiltered() : pcService.getAll()).map(buildAssetFromPc)
  const stockItems = (unfiltered ? stockService.getAllUnfiltered() : stockService.getAll()).map(buildAssetFromStock)
  const all = [...pcs, ...stockItems]

  if (!filters) return all
  return all.filter((a) => matchesFilters(a, filters))
}

export const assetService = {
  getAll: (filters?: AssetFilters): AssetRecord[] => getAll(filters, false),

  // Sem filtro de workspace — usado pelo fluxo público de chamados, onde o
  // professor precisa ver equipamentos de todos os campi.
  getAllUnfiltered: (filters?: AssetFilters): AssetRecord[] => getAll(filters, true),

  getById: (id: string, source: 'pcare' | 'stock'): AssetRecord | undefined => {
    if (source === 'pcare') {
      const pc = pcService.getById(id)
      return pc ? buildAssetFromPc(pc) : undefined
    }
    const item = stockService.getById(id)
    return item ? buildAssetFromStock(item) : undefined
  },

  getByRoom: (room: string): AssetRecord[] => {
    return assetService.getAll({ room })
  },

  // Versão pública (fluxo de chamados): equipamentos da sala de qualquer campus.
  getByRoomUnfiltered: (room: string): AssetRecord[] => {
    return assetService.getAllUnfiltered({ room })
  },

  getRooms: (): string[] => {
    const all = assetService.getAll()
    const rooms = new Set(all.map((a) => a.room).filter(Boolean))
    return Array.from(rooms).sort()
  },

  getTypes: (): string[] => {
    const all = assetService.getAll()
    const types = new Set(all.map((a) => a.type))
    return Array.from(types).sort()
  },

  getStats: () => {
    const all = assetService.getAll()
    return {
      total: all.length,
      bySource: {
        pcare: all.filter((a) => a.source === 'pcare').length,
        stock: all.filter((a) => a.source === 'stock').length,
      },
      byStatus: {
        ativo: all.filter((a) => a.status === 'ativo').length,
        em_conserto: all.filter((a) => a.status === 'em_conserto').length,
        descartado: all.filter((a) => a.status === 'descartado').length,
        emprestado: all.filter((a) => a.status === 'emprestado').length,
      },
      withOpenTickets: all.filter((a) => a.openTickets > 0).length,
    }
  },
}
