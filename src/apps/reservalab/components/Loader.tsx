const LOADER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="80" fill="none" stroke="#e4e4e7" stroke-width="8"/>
  <path d="M 100 20 A 80 80 0 0 1 180 100" fill="none" stroke="url(#lg)" stroke-width="8" stroke-linecap="round">
    <animateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="1s" repeatCount="indefinite"/>
  </path>
</svg>
`

export function Loader({ fullScreen = true, size = 48 }: { fullScreen?: boolean; size?: number }) {
  const content = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
    }}>
      <div
        dangerouslySetInnerHTML={{ __html: LOADER_SVG }}
        style={{ width: size, height: size }}
      />
      <p style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 500 }}>
        Carregando...
      </p>
    </div>
  )

  if (!fullScreen) return content

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f4ff',
      zIndex: 9999,
    }}>
      {content}
    </div>
  )
}
