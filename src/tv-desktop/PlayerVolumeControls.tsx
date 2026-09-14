import type { CSSProperties } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { useMusicPlayer } from '../apps/tv/contexts/MusicPlayerContext'

export function PlayerVolumeControls() {
  const { volume, muted, setVolume, setMuted, toggleMute } = useMusicPlayer()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          type="button"
          aria-pressed={muted}
          aria-label={muted ? 'Ativar som' : 'Silenciar'}
          title={muted ? 'Ativar som' : 'Silenciar'}
          onClick={toggleMute}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 10,
            background: muted ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${muted ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
            color: muted ? '#fca5a5' : '#e2e8f0', cursor: 'pointer',
          }}
        >
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <span style={labelStyle}>
          {muted ? 'Mudo' : `${Math.round(volume)}%`}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={muted ? 0 : volume}
        aria-label="Volume do player"
        aria-valuetext={muted ? 'Mudo' : `${Math.round(volume)} por cento`}
        onChange={(e) => {
          const next = Number(e.target.value)
          setVolume(next)
          if (next > 0 && muted) setMuted(false)
        }}
        style={sliderStyle}
      />
      <p style={{ fontSize: '0.62rem', color: '#475569', margin: 0 }}>
        Volume local desta TV — as outras telas mantêm os seus.
      </p>
    </div>
  )
}

const labelStyle: CSSProperties = {
  fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 700, minWidth: 48, textAlign: 'right',
}

const sliderStyle: CSSProperties = {
  width: '100%', cursor: 'pointer', accentColor: '#ef4444', height: 28,
}