import type { ActionLog } from '../types/actionLog'
import type { ComponentType } from 'react'
import { icons } from '../../../lib/icons'
import { CircleDot } from 'lucide-react'

const iconMap: Record<string, ComponentType<{ size?: number }>> = {
  pc_created: icons.ui.plusCircle,
  status_changed: icons.ui.refresh,
  part_added: icons.nav.parts,
  checklist_applied: icons.nav.checklists,
  checklist_toggled: icons.ui.check,
  software_added: icons.ui.hardDrive,
}

function formatTime(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

interface ActionTimelineProps {
  logs: ActionLog[]
}

export function ActionTimeline({ logs }: ActionTimelineProps) {
  if (logs.length === 0) {
    return <p className="text-sm text-fg-muted">Nenhuma ação registrada.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {logs.map((log, i) => (
        <div key={log.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-input ring-1 ring-line">
              {iconMap[log.type] ? (
                (() => { const Icon = iconMap[log.type]; return <Icon size={14} /> })()
              ) : (
                <CircleDot size={14} />
              )}
            </span>
            {i < logs.length - 1 && <div className="mt-1 w-px flex-1 bg-input" />}
          </div>
          <div className="flex-1 pb-3">
            <p className="text-sm text-fg">{log.description}</p>
            <p className="text-xs text-fg-muted">{formatTime(log.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
