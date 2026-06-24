import { useState } from 'react'

type Status = 'all' | 'pending' | 'in_progress' | 'done'

interface FilterBarProps {
  labs: string[]
  onFilterChange: (filters: { lab: string; status: Status }) => void
}

export function FilterBar({ labs, onFilterChange }: FilterBarProps) {
  const [lab, setLab] = useState('')
  const [status, setStatus] = useState<Status>('all')

  function handleChange(newLab: string, newStatus: Status) {
    setLab(newLab)
    setStatus(newStatus)
    onFilterChange({ lab: newLab, status: newStatus })
  }

  return (
    <div className="mb-4 flex gap-2">
      <select
        value={lab}
        onChange={(e) => handleChange(e.target.value, status)}
        className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
      >
        <option value="">Todos os laboratórios</option>
        {labs.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>

      <select
        value={status}
        onChange={(e) => handleChange(lab, e.target.value as Status)}
        className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500"
      >
        <option value="all">Todos os status</option>
        <option value="pending">Pendente</option>
        <option value="in_progress">Em andamento</option>
        <option value="done">Concluído</option>
      </select>
    </div>
  )
}

export type { Status }
