import type { SearchIndex, SearchResult } from './types'
import { pcService } from '../../apps/pcare/services/pcService'
import { stockService } from '../../apps/stock/services/stockService'
import { ticketService } from '../../apps/chamados/services/ticketService'
import { roomService } from '../../apps/chamados/services/roomService'

function buildIndex(): SearchIndex[] {
  const index: SearchIndex[] = []

  const rooms = roomService.getAll()
  for (const room of rooms) {
    index.push({
      id: `room-${room.id}`,
      title: room.name,
      subtitle: room.location || `${room.assetIds.length} ativos`,
      module: 'chamados',
      moduleColor: '#f59e0b',
      actionUrl: `/chamados/rooms/${room.id}/edit`,
      icon: 'home',
      keywords: `${room.name} ${room.location} sala`.toLowerCase(),
    })
  }

  const pcs = pcService.getAll()
  for (const pc of pcs) {
    index.push({
      id: `pc-${pc.id}`,
      title: `${pc.labName} — ${pc.pcNumber}`,
      subtitle: `${pc.assetTag || pc.roomLocation} · ${pc.specs.cpu}`,
      module: 'pcare',
      moduleColor: '#8b5cf6',
      actionUrl: `/pc-care/assets/${pc.id}`,
      icon: 'monitor',
      keywords: `${pc.labName} ${pc.pcNumber} ${pc.assetTag} ${pc.roomLocation} ${pc.specs.cpu} ${pc.specs.ram}`.toLowerCase(),
    })
  }

  const stockItems = stockService.getAll()
  for (const item of stockItems) {
    index.push({
      id: `stock-${item.id}`,
      title: item.name,
      subtitle: `${item.serialNumber || item.subcategory} · ${item.room || 'Sem sala'}`,
      module: 'stock',
      moduleColor: '#10b981',
      actionUrl: `/stock/items/${item.id}`,
      icon: 'package',
      keywords: `${item.name} ${item.serialNumber} ${item.subcategory} ${item.room} ${item.section}`.toLowerCase(),
    })
  }

  const tickets = ticketService.getAll()
  for (const ticket of tickets) {
    index.push({
      id: `ticket-${ticket.id}`,
      title: `#${ticket.ticketNumber}`,
      subtitle: `${ticket.roomName} · ${ticket.assetName} · ${ticket.problemCategory}`,
      module: 'chamados',
      moduleColor: '#f59e0b',
      actionUrl: `/chamados/tickets/${ticket.id}`,
      icon: 'alertCircle',
      keywords: `#${ticket.ticketNumber} ${ticket.roomName} ${ticket.assetName} ${ticket.problemCategory} ${ticket.status}`.toLowerCase(),
    })
  }

  return index
}

export const searchService = {
  search: (query: string): SearchResult[] => {
    if (!query.trim()) return []
    const q = query.toLowerCase().trim()
    const index = buildIndex()

    return index
      .filter((item) => item.keywords.includes(q))
      .slice(0, 10)
      .map(({ keywords, ...rest }) => rest)
  },
}
