import { useCallback, useEffect, useRef } from 'react'
import { defaultDb as supabase } from './supabase'

export interface UseRealtimeBroadcastOptions {
  /** Whether to receive own broadcasts (default: false) */
  self?: boolean
  /** Enable/disable the subscription (default: true) */
  enabled?: boolean
}

/**
 * Broadcast and listen to messages in real-time via Supabase Realtime WebSocket.
 *
 * The hook automatically cleans up the channel on unmount or when deps change.
 * Uses a ref for the callback so it never needs to re-subscribe due to callback identity changes.
 *
 * @example
 * ```ts
 * const { send } = useRealtimeBroadcast<NowPlayingInfo>(
 *   'tv-now-playing',
 *   'track-change',
 *   (payload) => setNowPlaying(payload),
 *   { self: true }
 * )
 *
 * // Send a broadcast
 * send({ trackTitle: 'Song', isPlaying: true, trackPosition: '1/10', shuffle: false })
 * ```
 */
export function useRealtimeBroadcast<T = any>(
  /** The channel name (e.g., 'tv-now-playing', 'stock-loans') */
  channelName: string,
  /** The event name (e.g., 'track-change', 'loan-created') */
  event: string,
  /** Function called when a broadcast is received */
  callback: (payload: T) => void,
  options: UseRealtimeBroadcastOptions = {},
): {
  /** Send a broadcast message to all subscribers */
  send: (payload: T) => void
} {
  const { self = false, enabled = true } = options

  // Keep a ref to the latest callback to avoid re-subscribing on every render
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  // Channel ref is needed by send() which can be called outside the effect
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)

  useEffect(() => {
    if (!enabled) return

    const db = supabase
    if (!db) return

    const channel = db
      .channel(channelName, { config: { broadcast: { self } } })
      .on('broadcast' as const, { event }, (payload) => {
        callbackRef.current((payload as any).payload as T)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      db.removeChannel(channel)
      channelRef.current = null
    }
  }, [channelName, event, self, enabled])

  const send = useCallback(
    async (payload: T) => {
      const ch = channelRef.current
      if (!ch) return
      await ch.send({
        type: 'broadcast',
        event,
        payload,
      })
    },
    [event],
  )

  return { send }
}
