export type AssetSource = 'pcare' | 'stock'

export interface AssetRecord {
  id: string
  source: AssetSource
  name: string
  type: string
  subcategory: string
  patrimony: string
  room: string
  status: string
  openTickets: number
  lastTicketAt: string | null
  createdAt: string
}

export interface AssetFilters {
  source?: AssetSource
  room?: string
  type?: string
  status?: string
  search?: string
}
