import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

export const TV_UPDATE_CHECK_MS = 30 * 60_000

/** Prepare a verified download in background; install at a playback boundary. */
export function useSignedTvUpdate(ready: boolean) {
  const pending = useRef(false)
  const installing = useRef(false)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    let busy = false
    const check = async () => {
      if (busy || pending.current || installing.current) return
      busy = true
      try {
        const version = await invoke<string | null>('prepare_tv_update')
        if (!cancelled && typeof version === 'string' && version) pending.current = true
      } catch (error) {
        console.warn('[TV updater] consulta/download falhou:', error)
      } finally { busy = false }
    }
    void check()
    const timer = window.setInterval(() => void check(), TV_UPDATE_CHECK_MS)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [ready])

  return useCallback((resume: () => void): boolean => {
    if (installing.current) return true
    if (!pending.current) return false
    pending.current = false
    installing.current = true
    void invoke('install_tv_update').catch(error => {
      console.warn('[TV updater] instalação falhou:', error)
    }).finally(() => {
      installing.current = false
      resume()
    })
    return true
  }, [])
}
