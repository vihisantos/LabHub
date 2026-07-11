import { useState } from 'react'
import { useRealtimeBroadcast } from '../../../lib/useRealtimeBroadcast'

export interface NowPlayingInfo {
  trackTitle: string
  isPlaying: boolean
  trackPosition: string
  shuffle: boolean
}

export function useNowPlaying() {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingInfo | null>(null)

  const { send: broadcast } = useRealtimeBroadcast<NowPlayingInfo>(
    'tv-now-playing',
    'track-change',
    setNowPlaying,
    { self: true },
  )

  return { nowPlaying, broadcast }
}
