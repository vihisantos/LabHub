import { useEffect, useRef } from 'react'
import { defaultDb as supabase } from './supabase'
import type { RealtimePostgresChangesPayload, REALTIME_POSTGRES_CHANGES_LISTEN_EVENT } from '@supabase/supabase-js'

export type RealtimePostgresChangesEvent = `${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT}`

export interface UseRealtimeSubscriptionOptions {
  /** Database schema (default: 'public') */
  schema?: string
  /** Custom channel name (auto-generated if not provided) */
  channelName?: string
  /** Enable/disable the subscription (default: true) */
  enabled?: boolean
}

/**
 * Subscribe to Postgres changes in real-time via Supabase Realtime WebSocket.
 *
 * The hook automatically cleans up the channel on unmount or when deps change.
 * Uses a ref for the callback so it never needs to re-subscribe due to callback identity changes.
 *
 * @example
 * ```ts
 * useRealtimeSubscription('tv_events', '*', (payload) => {
 *   if (payload.eventType === 'INSERT') {
 *     setEvents(prev => [...prev, payload.new])
 *   }
 * })
 * ```
 */
export function useRealtimeSubscription<T extends Record<string, any>>(
  /** The database table to watch (e.g., 'tv_events', 'stock_items') */
  table: string,
  /** The event type: 'INSERT' | 'UPDATE' | 'DELETE' | '*' */
  event: RealtimePostgresChangesEvent,
  /** Function called when the event fires, receives the change payload */
  callback: (payload: RealtimePostgresChangesPayload<T>) => void,
  options: UseRealtimeSubscriptionOptions = {},
): void {
  const {
    schema = 'public',
    channelName = `${schema}:${table}:${event}`,
    enabled = true,
  } = options

  // Keep a ref to the latest callback to avoid re-subscribing on every render
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    const db = supabase
    if (!db) return

    const channel = db
      .channel(channelName)
      .on(
        'postgres_changes' as const,
        { event, schema, table },
        (payload) => {
          callbackRef.current(payload as RealtimePostgresChangesPayload<T>)
        },
      )
      .subscribe()

    return () => {
      db.removeChannel(channel)
    }
  }, [table, event, schema, channelName, enabled])
}
