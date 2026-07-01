import { useEffect, useState, useRef } from 'react'
import YouTube, { type YouTubeProps } from 'react-youtube'
import { parseYouTubeUrl } from '../utils/youtubeUtils'
import type { TvPlaylist } from '../types'

interface BackgroundAudioProps {
  playlists: TvPlaylist[]
  isPlaying: boolean
}

export function BackgroundAudio({ playlists, isPlaying }: BackgroundAudioProps) {
  const [index, setIndex] = useState(0)
  const playerRef = useRef<any>(null)
  const currentVolRef = useRef(100)
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasPlayingRef = useRef(false)

  useEffect(() => {
    setIndex(0)
  }, [playlists.length])

  useEffect(() => {
    if (!playerRef.current) return
    if (isPlaying === wasPlayingRef.current) return
    wasPlayingRef.current = isPlaying

    if (isPlaying) {
      /* Resume with fade-in */
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
      playerRef.current.setVolume(0)
      currentVolRef.current = 0
      playerRef.current.playVideo()

      fadeTimerRef.current = setInterval(() => {
        const current = currentVolRef.current
        if (current >= 95) {
          playerRef.current?.setVolume(100)
          currentVolRef.current = 100
          if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
          fadeTimerRef.current = null
          return
        }
        const next = current + 5
        playerRef.current?.setVolume(next)
        currentVolRef.current = next
      }, 60)
    } else {
      /* Pause immediately */
      if (fadeTimerRef.current) {
        clearInterval(fadeTimerRef.current)
        fadeTimerRef.current = null
      }
      playerRef.current.pauseVideo()
    }

    return () => {
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current)
    }
  }, [isPlaying])

  if (playlists.length === 0) return null

  const current = playlists[index]
  if (!current) return null

  const info = parseYouTubeUrl(current.youtube_url)
  if (!info) return null

  const opts: YouTubeProps['opts'] = {
    height: '0',
    width: '0',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      rel: 0,
      loop: 1,
      origin: window.location.origin,
      ...(info.type === 'playlist' && info.playlistId
        ? { list: info.playlistId, listType: 'playlist' as const, index: 0 }
        : { playlist: videoId }),
    },
  }

  const advance = () => {
    if (playlists.length > 1) {
      setIndex((i) => (i + 1) % playlists.length)
    }
  }

  const videoId = info.videoId

  return (
    <div style={{ display: 'none' }}>
      <YouTube
        videoId={videoId}
        opts={opts}
        onReady={(e) => {
          playerRef.current = e.target
          e.target.setVolume(currentVolRef.current)
          e.target.playVideo()
        }}
        onEnd={() => {
          if (playlists.length > 1) {
            advance()
          } else {
            playerRef.current?.seekTo(0)
            playerRef.current?.playVideo()
          }
        }}
      />
    </div>
  )
}
