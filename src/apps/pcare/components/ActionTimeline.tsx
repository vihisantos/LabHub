import type { ActionLog } from '../types/actionLog'

const iconMap: Record<string, string> = {
  pc_created: '🆕',
  status_changed: '🔄',
  part_added: '🔧',
  checklist_applied: '📋',
  checklist_toggled: '✅',
  software_added: '💿',
}

function formatTime(seconds: number) {
  const date = new Date(seconds * 1000)
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
    return <p className="text-sm text-slate-500">Nenhuma ação registrada.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {logs.map((log, i) => (
        <div key={log.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-sm ring-1 ring-slate-700">
              {iconMap[log.type] || '📌'}
            </span>
            {i < logs.length - 1 && <div className="mt-1 w-px flex-1 bg-slate-800" />}
          </div>
          <div className="flex-1 pb-3">
            <p className="text-sm text-slate-200">{log.description}</p>
            <p className="text-xs text-slate-500">{formatTime(log.timestamp.seconds)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
