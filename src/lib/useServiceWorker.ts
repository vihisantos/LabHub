import { useEffect, useRef, useState, useCallback } from 'react'

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

/** Reset module-level state (for testing only) */
export function __resetStateForTesting(): void {
  _updateAvailable = false
  _listeners.length = 0
  _activeBlocks.clear()
  _blockListeners.length = 0
  _blockCounter = 0
}

/** Set update available state for testing only */
export function __setUpdateAvailableForTesting(available: boolean): void {
  _updateAvailable = available
}

/* ── Module-level reload blocking for unsaved changes ── */
export type BlockId = string & { readonly __brand: unique symbol }
let _blockCounter = 0
const _activeBlocks = new Set<BlockId>()
const _blockListeners: Array<(blocked: boolean) => void> = []

function notifyBlockedChange() {
  const blocked = _activeBlocks.size > 0
  _blockListeners.forEach((fn) => fn(blocked))
}

/**
 * Register a blocking operation (e.g., unsaved form, critical request).
 * Returns a unique block ID that must be passed to `unblockReload` to release.
 */
export function blockReload(): BlockId {
  const id = `block_${++_blockCounter}_${Math.random().toString(36).slice(2)}` as BlockId
  _activeBlocks.add(id)
  notifyBlockedChange()
  return id
}

/** Release a previously registered blocking operation. */
export function unblockReload(id: BlockId): void {
  if (_activeBlocks.delete(id)) {
    notifyBlockedChange()
  }
}

/** Check if there are any active blocks preventing auto-reload. */
export function isReloadBlocked(): boolean {
  return _activeBlocks.size > 0
}

/** Subscribe to reload-blocked state changes. */
export function onReloadBlocked(fn: (blocked: boolean) => void): () => void {
  _blockListeners.push(fn)
  return () => {
    const idx = _blockListeners.indexOf(fn)
    if (idx >= 0) _blockListeners.splice(idx, 1)
  }
}

/** Manually trigger a reload when an update is available (used when user confirms).
 * Respects active reload blocks — will not reload if blocked.
 * Returns true if reload was triggered, false if blocked. */
export function applyPendingUpdate(): boolean {
  if (_updateAvailable && !isReloadBlocked()) {
    window.location.reload()
    return true
  }
  return false
}

/**
 * Hook to easily manage reload blocking for a component (e.g., a form).
 * Returns { blockReload, unblockReload, isBlocked }.
 */
export function useReloadBlocker(): {
  blockReload: () => BlockId
  unblockReload: (id: BlockId) => void
  isBlocked: boolean
} {
  const idRef = useRef<BlockId | null>(null)
  const [isBlocked, setIsBlocked] = useState(false)

  useEffect(() => {
    // Initialize with current state
    setIsBlocked(isReloadBlocked())
    const unsub = onReloadBlocked(setIsBlocked)
    return unsub
  }, [])

  const startBlock = useCallback(() => {
    if (idRef.current) return idRef.current
    const id = blockReload()
    idRef.current = id
    return id
  }, [])

  const endBlock = useCallback(() => {
    if (!idRef.current) return
    unblockReload(idRef.current)
    idRef.current = null
  }, [])

  return { blockReload: startBlock, unblockReload: endBlock, isBlocked }
}

/**
 * Hook that monitors Service Worker updates and auto-reloads the page
 * when a new version is detected.
 *
 * This solves the issue where the TV display gets stuck on the old cached version
 * after a new deployment. Instead of requiring Ctrl+F5, the hook:
 * 1. Listens for 'controllerchange' events (new SW takes over)
 * 2. Reloads the page to ensure fresh assets are used
 *
 * Auto-reload is deferred while there are active reload blocks
 * (e.g., unsaved forms, critical operations in progress).
 */
export function useServiceWorker(options: { immediate?: boolean; onUpdate?: () => void } = {}): void {
  const { immediate = false, onUpdate } = options
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  const isUpdatePendingRef = useRef(getUpdateAvailable())

  useEffect(() => {
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    if (!sw) return

    let reloadTimer: ReturnType<typeof setTimeout> | null = null

    // When a new SW takes over, reload to get fresh assets
    const onControllerChange = () => {
      if (reloadTimer) return
      if (isReloadBlocked()) {
        // Update is available but reload is blocked — notify so UI can show action
        isUpdatePendingRef.current = true
        return
      }
      reloadTimer = setTimeout(() => {
        // Final check before reload (race condition protection)
        if (!isReloadBlocked()) {
          window.location.reload()
        } else {
          // New block appeared during timer — keep update as pending
          isUpdatePendingRef.current = true
          reloadTimer = null
        }
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
            isUpdatePendingRef.current = true
            onUpdateRef.current?.()
          }
        })
      })
    })

    // Subscribe to reload-blocked changes to potentially trigger deferred reload
    const unsubBlocked = onReloadBlocked((blocked) => {
      if (!blocked && isUpdatePendingRef.current) {
        // Blocks cleared and update was pending — perform the deferred reload
        // But first check if still not blocked (race condition protection)
        if (!isReloadBlocked()) {
          // Clear any existing timer to avoid duplicates
          if (reloadTimer) clearTimeout(reloadTimer)
          reloadTimer = setTimeout(() => {
            // Final check before reload
            if (!isReloadBlocked()) {
              window.location.reload()
            }
          }, 1000)
        }
      }
    })

    return () => {
      // Reset state on cleanup
      notifyUpdateAvailable(false)
      sw.removeEventListener('controllerchange', onControllerChange)
      unsubBlocked()
      if (reloadTimer) clearTimeout(reloadTimer)
    }
  }, [immediate])
}
