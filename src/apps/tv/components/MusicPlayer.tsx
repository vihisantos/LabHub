import { Music } from 'lucide-react'

interface MusicPlayerProps {
  compact?: boolean
}

export function MusicPlayer({ compact }: MusicPlayerProps) {
  if (compact) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 16px',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
        borderRadius: '9999px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'spin 6s linear infinite',
          flexShrink: 0,
        }}>
          <Music size={14} color="#fff" />
        </div>
        <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '20px' }}>
          {[10, 16, 8, 20, 12, 6, 22].map((h, i) => (
            <div
              key={i}
              style={{
                width: '3px', height: `${h}px`, borderRadius: '2px',
                background: '#6366f1',
                animation: 'equalizer 0.5s ease-in-out infinite alternate',
                animationDelay: `${i * 0.07}s`,
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
          Música
        </span>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: '2rem',
    }}>
      <div style={{
        width: '200px', height: '200px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'spin 8s linear infinite',
        boxShadow: '0 0 60px rgba(99, 102, 241, 0.3)',
      }}>
        <Music size={80} color="#fff" strokeWidth={1.5} />
      </div>
      <p style={{ color: '#cbd5e1', fontSize: '1.25rem', fontWeight: 500 }}>
        Tocando música...
      </p>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '32px' }}>
        {[16, 24, 12, 28, 20, 8, 32, 14, 22, 18].map((h, i) => (
          <div
            key={i}
            style={{
              width: '4px', height: `${h}px`, borderRadius: '2px',
              background: '#6366f1',
              animation: 'equalizer 0.6s ease-in-out infinite alternate',
              animationDelay: `${i * 0.08}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
