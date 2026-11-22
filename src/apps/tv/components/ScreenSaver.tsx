import { Tv } from 'lucide-react'

export function ScreenSaver() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 45%, #f1f5f9 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: '1.5rem',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
    }}>
      <div style={{
        position: 'absolute', width: 520, height: 520, borderRadius: '9999px',
        background: 'radial-gradient(circle, rgba(13,148,136,0.10) 0%, transparent 70%)',
        top: '-140px', right: '-80px',
      }} />
      <div style={{
        position: 'absolute', width: 420, height: 420, borderRadius: '9999px',
        background: 'radial-gradient(circle, rgba(30,64,175,0.08) 0%, transparent 70%)',
        bottom: '-120px', left: '-60px',
      }} />

      <div style={{
        width: '100px', height: '100px', borderRadius: '28px',
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid rgba(15,23,42,0.08)',
        boxShadow: '0 16px 40px rgba(15,23,42,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', zIndex: 1,
      }}>
        <Tv size={44} strokeWidth={1.6} style={{ color: '#0f766e' }} />
      </div>

      <div style={{
        textAlign: 'center', position: 'relative', zIndex: 1,
        padding: '1.75rem 2.25rem', borderRadius: 24,
        background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(15,23,42,0.08)',
        boxShadow: '0 12px 32px rgba(15,23,42,0.08)', maxWidth: 560,
      }}>
        <p style={{
          fontSize: '1.5rem', fontWeight: 700, color: '#0f172a',
          margin: '0 0 0.5rem',
        }}>
          Nenhum conteúdo configurado
        </p>
        <p style={{
          fontSize: '1rem', color: '#475569', fontWeight: 500, margin: 0, lineHeight: 1.5,
        }}>
          Adicione eventos, playlists ou avisos no painel admin
        </p>
        <p style={{
          fontSize: '0.9rem', color: '#64748b', margin: '0.75rem 0 0', lineHeight: 1.45,
        }}>
          Verifique a pasta em Ctrl+Alt+K → Manutenção.
        </p>
      </div>
    </div>
  )
}
