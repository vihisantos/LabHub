import { useState, useEffect, useCallback, useRef } from 'react'
import { defaultDb as supabase } from '../../../lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface NowPlayingInfo {
  trackTitle: string
  isPlaying: boolean
  trackPosition: string
  shuffle: boolean
}

export function useNowPlaying() {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingInfo | null>(null)
  const channelRef = useRef<ReturnType<SupabaseClient['channel']> | null>(null)

  useEffect(() => {
    if (!supabase) return

    const channel = supabase.channel('tv-now-playing', {
      // @ts-expect-error broadcast config is valid at runtime
      broadcast: { self: true },
    })

    channel
      .on('broadcast', { event: 'track-change' }, (payload) => {
        setNowPlaying(payload.payload as NowPlayingInfo)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase!.removeChannel(channel)
      channelRef.current = null
    }
  }, [])

  const broadcast = useCallback((info: NowPlayingInfo) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'track-change',
      payload: info,
    })
  }, [])

  return { nowPlaying, broadcast }
}
