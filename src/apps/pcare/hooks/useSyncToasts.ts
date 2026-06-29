import { useEffect, useRef } from 'react'
import { useOnlineSync } from './useOnlineSync'
import { useToast } from '../../../lib/ToastContext'

export function useSyncToasts() {
  const { syncing, syncError, triggerSync } = useOnlineSync()
  const { addToast, removeToast } = useToast()
  const prevSyncing = useRef(syncing)
  const toastIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (syncing && !prevSyncing.current) {
      if (toastIdRef.current) removeToast(toastIdRef.current)
      toastIdRef.current = addToast('info', 'Sincronizando...', { duration: 0 })
    }
    prevSyncing.current = syncing
  }, [syncing, addToast, removeToast])

  useEffect(() => {
    if (!syncing && !syncError && toastIdRef.current) {
      removeToast(toastIdRef.current)
      toastIdRef.current = null
      addToast('success', 'Dados sincronizados', { duration: 3000 })
    }
    if (!syncing && syncError && toastIdRef.current) {
      removeToast(toastIdRef.current)
      toastIdRef.current = null
    }
  }, [syncing, syncError, addToast, removeToast])

  useEffect(() => {
    if (syncError) {
      addToast('error', syncError, {
        duration: 0,
        action: { label: 'Tentar novamente', onClick: () => triggerSync() },
      })
    }
  }, [syncError, addToast, triggerSync])
}
