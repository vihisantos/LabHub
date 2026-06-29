import { useOnlineSync } from '../hooks/useOnlineSync'

export function OnlineBanner() {
  const { online, pendingChanges } = useOnlineSync()

  if (online) return null

  return (
    <div className="flex items-center justify-center gap-1.5 bg-red-100 px-3 py-1 text-[10px] font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
      <span className="h-2 w-2 rounded-full bg-red-400" />
      Offline · dados salvos localmente
      {pendingChanges > 0 && ` · ${pendingChanges} pendente${pendingChanges > 1 ? 's' : ''}`}
    </div>
  )
}
