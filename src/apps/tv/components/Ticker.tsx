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
      height: '2.5rem',
      background: 'linear-gradient(90deg, rgba(8,10,20,0.95) 0%, rgba(8,10,20,0.88) 100%)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center',
    }}>
      {/* Brand Sticker - UAM Piracicaba */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0 1rem',
        background: 'linear-gradient(90deg, rgba(99,102,241,0.2) 0%, rgba(99,102,241,0.05) 100%)',
        borderRight: '1px solid rgba(99,102,241,0.15)',
      }}>
        <div style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: '#6366f1',
          boxShadow: '0 0 8px rgba(99,102,241,0.5)',
        }} />
        <span style={{
          fontSize: '0.7rem',
          fontWeight: 800,
          color: '#818cf8',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          UAM Piracicaba
        </span>
      </div>

      {/* Scrolling Text */}
      <div style={{
        whiteSpace: 'nowrap',
        animation: 'ticker-scroll 35s linear infinite',
        fontSize: '0.85rem',
        color: '#94a3b8',
        fontWeight: 500,
        paddingLeft: '100%',
        marginLeft: '9rem',
      }}>
        {text}
      </div>
    </div>
  )
}
