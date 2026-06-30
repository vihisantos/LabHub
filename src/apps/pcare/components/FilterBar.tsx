import { useState } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../lib/components/ui'

type Status = 'all' | 'pending' | 'in_progress' | 'done'

interface FilterBarProps {
  labs: string[]
  onFilterChange: (filters: { lab: string; status: Status }) => void
}

export function FilterBar({ labs, onFilterChange }: FilterBarProps) {
  const [lab, setLab] = useState('all')
  const [status, setStatus] = useState<Status>('all')

  function handleChange(newLab: string, newStatus: Status) {
    setLab(newLab)
    setStatus(newStatus)
    onFilterChange({ lab: newLab, status: newStatus })
  }

  return (
    <div className="mb-4 flex gap-2">
      <Select value={lab} onValueChange={(v) => handleChange(v, status)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Todos os laboratórios" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os laboratórios</SelectItem>
          {labs.map((l) => (
            <SelectItem key={l} value={l}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={(v) => handleChange(lab, v as Status)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Todos os status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="pending">Pendente</SelectItem>
          <SelectItem value="in_progress">Em andamento</SelectItem>
          <SelectItem value="done">Concluído</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

export type { Status }
