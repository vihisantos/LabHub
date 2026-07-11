import { useState, useEffect, useRef, useCallback } from 'react'
import { defaultDb as supabase } from './supabase'

export interface PresenceUser<TMetadata extends Record<string, any> = Record<string, any>> {
  /** The presence key (e.g., user id or tab id) */
  key: string
  /** The metadata payload this user is tracking */
  metadata: TMetadata
  /** ISO timestamp of when this user's presence was first tracked */
  onlineAt: string
}

export interface UseRealtimePresenceOptions<TMetadata extends Record<string, any>> {
  /** Unique key identifying this client (e.g., user id, tab id). Required. */
  key: string
  /** Metadata to broadcast to other clients (e.g., { app: 'pcare', page: 'pcs', name: 'João' }) */
  metadata?: TMetadata
  /** Enable/disable the presence subscription (default: true) */
  enabled?: boolean
}

/**
 * Track and display online users via Supabase Realtime Presence.
 *
 * Each client tracks itself with a unique key and optional metadata.
 * The hook returns the list of currently online users and their metadata.
 * The user auto-disappears when the tab closes or the component unmounts.
 *
 * @example
 * ```tsx
 * const { onlineUsers, onlineCount } = useRealtimePresence('labhub-online', {
 *   key: tabId,
 *   metadata: { app: 'pcare', name: 'Admin', page: 'pcs' },
 * })
 *
 * // onlineUsers: [{ key: 'tab-123', metadata: { app: 'pcare', name: 'Admin' } }, ...]
 * // onlineCount: 3
 * ```
 */
export function useRealtimePresence<TMetadata extends Record<string, any> = Record<string, any>>(
  /** Channel name for presence (e.g., 'labhub-online') */
  channelName: string,
  options: UseRealtimePresenceOptions<TMetadata>,
): {
  /** List of currently online users with their metadata */
  onlineUsers: PresenceUser<TMetadata>[]
  /** Number of currently online users */
  onlineCount: number
} {
  const { key, metadata, enabled = true } = options

  const [onlineUsers, setOnlineUsers] = useState<PresenceUser<TMetadata>[]>([])
  const metadataRef = useRef(metadata)
  metadataRef.current = metadata

  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)

  const updateUsers = useCallback(() => {
    const ch = channelRef.current
    if (!ch) return

    const state = ch.presenceState<{
      key: string
      metadata: TMetadata
      onlineAt: string
    }>()

    const users: PresenceUser<TMetadata>[] = []
    for (const presences of Object.values(state)) {
      for (const p of presences) {
        users.push({
          key: p.key,
          metadata: p.metadata,
          onlineAt: p.onlineAt,
        })
      }
    }

    setOnlineUsers(users)
  }, [])

  /* ── Subscribe channel + track presence ── */
  useEffect(() => {
    if (!enabled) return

    const db = supabase
    if (!db) return

    // Break the chain to avoid temporal dead zone: subscribe callback
    // closes over `channel`, so `channel` must be assigned first.
    const channel = db
      .channel(channelName, {
        config: {
          presence: { key, enabled: true },
        },
      })
      .on('presence' as const, { event: 'sync' }, () => updateUsers())
      .on('presence' as const, { event: 'join' }, () => updateUsers())
      .on('presence' as const, { event: 'leave' }, () => updateUsers())

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          key,
          metadata: metadataRef.current ?? ({} as TMetadata),
          onlineAt: new Date().toISOString(),
        }).catch(() => {})
      }
    })

    channelRef.current = channel

    return () => {
      channel.untrack().catch(() => {})
      db.removeChannel(channel)
      channelRef.current = null
    }
  }, [channelName, key, enabled, updateUsers])

  /* ── Re-track when metadata changes (e.g., user navigated to another page) ── */
  useEffect(() => {
    const ch = channelRef.current
    if (!ch) return
    ch.track({
      key,
      metadata: metadata ?? ({} as TMetadata),
      onlineAt: new Date().toISOString(),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(metadata)])

  return {
    onlineUsers,
    onlineCount: onlineUsers.length,
  }
}
