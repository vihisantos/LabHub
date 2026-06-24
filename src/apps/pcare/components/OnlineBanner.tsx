import { useOnlineSync } from '../hooks/useOnlineSync'

export function OnlineBanner() {
  const { online, syncing, lastSync } = useOnlineSync()

  if (online && !syncing) return null

  return (
    <div
      className={`flex items-center justify-center gap-1.5 px-3 py-1 text-[10px] font-medium transition-all ${
        syncing
          ? 'bg-amber-900/40 text-amber-300'
          : 'bg-red-900/40 text-red-300'
      }`}
    >
      {syncing ? (
        <>
          <span className="h-2 w-2 animate-spin rounded-full border border-amber-400 border-t-transparent" />
          Sincronizando...
        </>
      ) : (
        <>
          <span className="h-2 w-2 rounded-full bg-red-400" />
          Offline · dados salvos localmente
        </>
      )}
    </div>
  )
}
