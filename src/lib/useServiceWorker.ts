import { useEffect, useRef } from 'react'

/* ── Module-level update-available signal ── */
type UpdateListener = (available: boolean) => void
let _updateAvailable = false
const _listeners: UpdateListener[] = []

/** Check if a SW update is currently available (module-level, no hook needed) */
export function getUpdateAvailable(): boolean {
  return _updateAvailable
}

/** Subscribe to update-available changes */
export function onUpdateAvailable(fn: UpdateListener): () => void {
  _listeners.push(fn)
  return () => {
    const idx = _listeners.indexOf(fn)
    if (idx >= 0) _listeners.splice(idx, 1)
  }
}

function notifyUpdateAvailable(v: boolean) {
  _updateAvailable = v
  _listeners.forEach((fn) => fn(v))
}

/**
 * Hook that monitors Service Worker updates and auto-reloads the page
 * when a new version is detected.
 *
 * This solves the issue where the TV display gets stuck on the old cached version
 * after a new deployment. Instead of requiring Ctrl+F5, the hook:
 * 1. Listens for 'controllerchange' events (new SW takes over)
 * 2. Reloads the page to ensure fresh assets are used
 */
export function useServiceWorker(options: { immediate?: boolean; onUpdate?: () => void } = {}): void {
  const { immediate = false, onUpdate } = options
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    if (!sw) return

    let reloadTimer: ReturnType<typeof setTimeout> | null = null

    // When a new SW takes over, reload to get fresh assets
    const onControllerChange = () => {
      if (reloadTimer) return
      reloadTimer = setTimeout(() => {
        window.location.reload()
      }, 1000)
    }

    sw.addEventListener('controllerchange', onControllerChange)

    // Check if there's already an update waiting
    sw.ready.then((registration) => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && sw.controller) {
            notifyUpdateAvailable(true)
            onUpdateRef.current?.()
          }
        })
      })
    })

    return () => {
      // Reset state on cleanup
      notifyUpdateAvailable(false)
      sw.removeEventListener('controllerchange', onControllerChange)
      if (reloadTimer) clearTimeout(reloadTimer)
    }
  }, [immediate])
}
