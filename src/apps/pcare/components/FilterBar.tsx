import { useState } from 'react'
import type { AssetStatus, EquipmentType } from '../types'
import { EQUIPMENT_TYPES, ASSET_STATUS_LABELS } from '../types'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../lib/components/ui'

export type Status = AssetStatus | 'all'
export interface AssetFilters { location: string; type: EquipmentType | 'all'; status: Status }
export function FilterBar({ locations, labs, onFilterChange }: { locations?: string[]; /** @deprecated Compatibilidade com filtros de PCs. */ labs?: string[]; onFilterChange: (filters: AssetFilters) => void }) {
  const [filters, setFilters] = useState<AssetFilters>({ location: 'all', type: 'all', status: 'all' })
  const change = (next: Partial<AssetFilters>) => { const value = { ...filters, ...next }; setFilters(value); onFilterChange(value) }
  return <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
    <Select value={filters.location} onValueChange={(location) => change({ location })}><SelectTrigger><SelectValue placeholder="Todas as localizações" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as localizações</SelectItem>{(locations ?? labs ?? []).map((location) => <SelectItem key={location} value={location}>{location}</SelectItem>)}</SelectContent></Select>
    <Select value={filters.type} onValueChange={(type) => change({ type: type as EquipmentType | 'all' })}><SelectTrigger><SelectValue placeholder="Todos os tipos" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{EQUIPMENT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
    <Select value={filters.status} onValueChange={(status) => change({ status: status as Status })}><SelectTrigger><SelectValue placeholder="Todos os status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
  </div>
}
