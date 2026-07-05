import { Tv } from 'lucide-react'

export function ScreenSaver() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: '#080a14',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: '1.5rem',
      overflow: 'hidden',
    }}>
      {/* Animated blobs */}
      <div className="wallpaper-blob" style={{
        width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
        top: '15%', left: '10%',
        animation: 'blob-float 8s ease-in-out infinite',
      }} />
      <div className="wallpaper-blob" style={{
        width: '350px', height: '350px',
        background: 'radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)',
        bottom: '20%', right: '15%',
        animation: 'blob-float-2 10s ease-in-out infinite',
      }} />
      <div className="wallpaper-blob" style={{
        width: '250px', height: '250px',
        background: 'radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 70%)',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        animation: 'blob-float-3 12s ease-in-out infinite',
      }} />

      {/* Icon */}
      <div style={{
        width: '100px', height: '100px', borderRadius: '50%',
        background: 'rgba(99,102,241,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'pulse-glow 3s ease-in-out infinite',
      }}>
        <Tv size={44} strokeWidth={1.2} style={{ color: 'rgba(99,102,241,0.4)' }} />
      </div>

      {/* Text */}
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontSize: '1.25rem', fontWeight: 600, color: '#334155',
          marginBottom: '0.5rem',
        }}>
          Nenhum conteúdo configurado
        </p>
        <p style={{
          fontSize: '0.85rem', color: '#1e293b', fontWeight: 400, opacity: 0.6,
        }}>
          Adicione eventos, playlists ou avisos no painel admin
        </p>
      </div>
    </div>
  )
}
