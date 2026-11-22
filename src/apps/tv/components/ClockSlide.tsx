import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Clock } from 'lucide-react'

/**
 * Fuso do campus. O slide mostra o horário de Brasília sempre, independente
 * da configuração de fuso do Windows da TV (kiosks podem vir em UTC).
 */
const TV_TIME_ZONE = 'America/Sao_Paulo'

/**
 * Formata a hora atual para exibição
 */
function formatTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TV_TIME_ZONE,
  })
}

/**
 * Formata a data atual para exibição
 */
function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TV_TIME_ZONE,
  })
}

/**
 * Slide completo de horário para a TV (tema clean institucional).
 * Aparece periodicamente na programação — sem relógio fixo na tela principal.
 *
 * Layout full-bleed em três faixas (header / main / footer), o mesmo esqueleto
 * do WeatherSlideEnhanced: os dois slides aparecem em sequência na TV, então
 * compartilham header, rodapé e paleta para parecerem um pacote só.
 */
export function ClockSlide() {
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const time = formatTime(clock)
  const date = formatDate(clock)

  return (
    <div style={styles.container}>
      <div style={styles.glowA} />
      <div style={styles.glowB} />
      <div style={styles.hairline} />

      <header style={styles.header}>
        <div style={styles.badge}>
          <Clock size={20} strokeWidth={2.2} />
          <span>Horário</span>
        </div>
        <div style={styles.brandRow}>
          <span style={styles.brandMark} />
          <span style={styles.brand}>LabHub TV</span>
        </div>
      </header>

      <main style={styles.main}>
        <span style={styles.date}>{date}</span>
        <span style={styles.time}>{time}</span>
        <span style={styles.rule} />
        <span style={styles.caption}>Horário de Brasília</span>
      </main>

      <div style={styles.divider} />
      <footer style={styles.footer}>
        <span>Piracicaba · SP</span>
        <span>Horário oficial de Brasília · UTC−03</span>
      </footer>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: 'clamp(1.75rem, 4vh, 3rem) clamp(2rem, 5vw, 4.5rem)',
    boxSizing: 'border-box',
    background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 45%, #eef2f7 100%)',
    overflow: 'hidden',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
  },
  glowA: {
    position: 'absolute',
    width: '40rem',
    height: '40rem',
    borderRadius: '9999px',
    background: 'radial-gradient(circle, rgba(13, 148, 136, 0.14) 0%, transparent 70%)',
    top: '-16rem',
    right: '-10rem',
    pointerEvents: 'none',
  },
  glowB: {
    position: 'absolute',
    width: '34rem',
    height: '34rem',
    borderRadius: '9999px',
    background: 'radial-gradient(circle, rgba(30, 64, 175, 0.10) 0%, transparent 70%)',
    bottom: '-14rem',
    left: '-8rem',
    pointerEvents: 'none',
  },
  hairline: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: 4,
    background: 'linear-gradient(90deg, #0d9488 0%, #1e40af 55%, transparent 100%)',
    opacity: 0.85,
  },
  header: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    zIndex: 1,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.55rem',
    padding: '0.5rem 1.05rem',
    borderRadius: 9999,
    background: 'rgba(13, 148, 136, 0.10)',
    border: '1px solid rgba(13, 148, 136, 0.18)',
    color: '#0f766e',
    fontSize: 'clamp(0.95rem, 1.15vw, 1.15rem)',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  brandRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.6rem',
  },
  brandMark: {
    width: 10,
    height: 10,
    borderRadius: 9999,
    background: 'linear-gradient(135deg, #0d9488, #1e40af)',
  },
  brand: {
    fontSize: 'clamp(0.85rem, 1vw, 1rem)',
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  main: {
    position: 'relative',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'clamp(0.25rem, 1vh, 0.75rem)',
    zIndex: 1,
    minHeight: 0,
  },
  date: {
    fontSize: 'clamp(1.3rem, 2.3vw, 2.1rem)',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'capitalize',
    letterSpacing: '0.01em',
  },
  time: {
    fontSize: 'clamp(6rem, 15vw, 13rem)',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 0.95,
    letterSpacing: '-0.05em',
    color: '#0f172a',
    textShadow: '0 18px 45px rgba(15, 23, 42, 0.12)',
  },
  rule: {
    width: 'clamp(90px, 8vw, 130px)',
    height: 6,
    borderRadius: 9999,
    background: 'linear-gradient(90deg, #0d9488, #1e40af)',
    marginTop: 'clamp(0.5rem, 1.5vh, 1.25rem)',
  },
  caption: {
    marginTop: '0.35rem',
    fontSize: 'clamp(1rem, 1.4vw, 1.35rem)',
    fontWeight: 600,
    color: '#475569',
    letterSpacing: '0.02em',
  },
  divider: {
    position: 'relative',
    height: 1,
    width: '100%',
    background: 'rgba(15, 23, 42, 0.08)',
    marginBottom: 'clamp(0.75rem, 1.6vh, 1.25rem)',
    zIndex: 1,
  },
  footer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
    color: '#94a3b8',
    fontSize: 'clamp(0.85rem, 1vw, 1rem)',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    zIndex: 1,
  },
}
