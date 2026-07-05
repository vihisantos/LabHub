import { useState, useEffect } from 'react'
import { fetchAnnouncements } from '../services/supabase'
import type { TvAnnouncement } from '../types'

export function Ticker() {
  const [announcements, setAnnouncements] = useState<TvAnnouncement[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const data = await fetchAnnouncements()
      if (!cancelled) setAnnouncements(data)
    }
    load()
    const timer = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  if (announcements.length === 0) return null

  const text = announcements.map((a) => a.text).join('  ·  ')

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
      height: '2.25rem',
      background: 'rgba(8,10,20,0.85)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{
        whiteSpace: 'nowrap',
        animation: 'ticker-scroll 30s linear infinite',
        fontSize: '0.85rem',
        color: '#94a3b8',
        fontWeight: 500,
        paddingLeft: '100%',
      }}>
        {text}
      </div>
    </div>
  )
}
