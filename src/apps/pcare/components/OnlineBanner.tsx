import { useOnlineSync } from '../hooks/useOnlineSync'

export function OnlineBanner() {
  const { online, syncing, pendingChanges } = useOnlineSync()

  if (online && !syncing && pendingChanges === 0) return null

  return (
    <div
      className={`flex items-center justify-center gap-1.5 px-3 py-1 text-[10px] font-medium transition-all ${
        syncing
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
          : online
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
      }`}
    >
      {syncing ? (
        <>
          <span className="h-2 w-2 animate-spin rounded-full border border-amber-400 border-t-transparent" />
          Sincronizando...
        </>
      ) : online ? (
        <>
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          {pendingChanges} {pendingChanges === 1 ? 'alteração pendente' : 'alterações pendentes'}
        </>
      ) : (
        <>
          <span className="h-2 w-2 rounded-full bg-red-400" />
          Offline · dados salvos localmente
          {pendingChanges > 0 && ` · ${pendingChanges} pendente${pendingChanges > 1 ? 's' : ''}`}
        </>
      )}
    </div>
  )
}
