import { useCallback, useRef, useState } from 'react'

export type BeepType = 'join' | 'leave'

const STORAGE_KEY = 'labhub_presence_muted'
const JOIN_FREQ = 660
const LEAVE_FREQ = 440
const BEEP_DURATION = 0.15
const BEEP_VOLUME = 0.08

/* Singleton AudioContext shared across all presence sound instances */
let sharedAudioCtx: AudioContext | null = null

/**
 * Reset the singleton AudioContext for testing purposes only.
 * Called automatically via `vi.resetModules()` or directly in tests.
 */
export function __resetAudioContext(): void {
  sharedAudioCtx = null
}

/** Suspend/resume the AudioContext when the page visibility changes to save resources */
function onVisibilityChange() {
  if (!sharedAudioCtx) return
  if (document.hidden) {
    sharedAudioCtx.suspend().catch(() => {})
  } else {
    sharedAudioCtx.resume().catch(() => {})
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', onVisibilityChange)
}

function getAudioCtx(): AudioContext {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioContext()
  }
  return sharedAudioCtx
}

export function usePresenceSound() {
  const [muted, setMuted] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true',
  )
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  const playBeep = useCallback((type: BeepType) => {
    if (mutedRef.current) return
    try {
      const ctx = getAudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.value = type === 'join' ? JOIN_FREQ : LEAVE_FREQ
      gain.gain.value = BEEP_VOLUME
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + BEEP_DURATION,
      )
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + BEEP_DURATION)
    } catch {
      /* Audio not available */
    }
    // mutedRef is stable (ref), getAudioCtx uses module-level singleton
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { muted, toggleMute, playBeep } as const
}
