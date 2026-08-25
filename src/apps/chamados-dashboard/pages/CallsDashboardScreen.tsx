import type { CSSProperties } from 'react'
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketPriority,
  type TicketStatus,
} from '../../chamados/types/ticket'
import { useChamadosDisplay, type ChamadosDisplayErrorKind } from '../hooks/useChamadosDisplay'

/* ── Apresentação ──
 * TV corporativa: leitura à distância, alto contraste, sem interação.
 * Cores são apenas apresentação — os valores do backend nunca são alterados
 * e o rótulo textual sempre acompanha (não depender só de cor). */

const STATUS_COLORS: Record<TicketStatus, { bg: string; fg: string }> = {
  aberto: { bg: 'rgba(245,158,11,0.16)', fg: '#fbbf24' },
  a_caminho: { bg: 'rgba(249,115,22,0.16)', fg: '#fb923c' },
  em_atendimento: { bg: 'rgba(59,130,246,0.16)', fg: '#60a5fa' },
  resolvido: { bg: 'rgba(16,185,129,0.16)', fg: '#34d399' },
  fechado: { bg: 'rgba(100,116,139,0.16)', fg: '#94a3b8' },
}

const PRIORITY_COLORS: Record<TicketPriority, { bg: string; fg: string; border?: string }> = {
  baixa: { bg: 'rgba(100,116,139,0.14)', fg: '#94a3b8' },
  normal: { bg: 'rgba(59,130,246,0.12)', fg: '#93c5fd' },
  alta: { bg: 'rgba(245,158,11,0.18)', fg: '#fbbf24', border: '1px solid rgba(251,191,36,0.45)' },
  urgente: { bg: 'rgba(239,68,68,0.2)', fg: '#f87171', border: '1px solid rgba(248,113,113,0.55)' },
}

const ERROR_MESSAGES: Record<ChamadosDisplayErrorKind, string> = {
  unauthorized: 'Sessão do dispositivo expirada. Reconfigure esta TV no menu de manutenção (Ctrl + Alt + K).',
  forbidden: 'Dispositivo não autorizado a exibir este painel.',
  'rate-limited': 'Atualização temporariamente limitada.',
  server: 'Atualização temporariamente indisponível.',
  network: 'Atualização temporariamente indisponível (sem conexão com a API).',
}

const pageStyle: CSSProperties = {
  width: '100vw', minHeight: '100vh', boxSizing: 'border-box',
  background: '#080a14', color: '#f1f5f9',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  padding: '3vh 4vw', display: 'flex', flexDirection: 'column', gap: '2.5vh',
}

const headerStyle: CSSProperties = {
  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem',
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatAge(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.floor(hours / 24)} d`
}

function formatMetric(value: number | null, suffix: string): string {
  return value === null ? '—' : `${value.toLocaleString('pt-BR')}${suffix}`
}

function Badge({ label, colors }: { label: string; colors: { bg: string; fg: string; border?: string } }) {
  return (
    <span style={{
      display: 'inline-block', padding: '0.35em 0.9em', borderRadius: 999,
      background: colors.bg, color: colors.fg,
      border: colors.border ?? '1px solid transparent',
      fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

/**
 * Tela de exibição do Dashboard de Chamados para o kiosk (screenApp =
 * 'chamados-dashboard'). Consome exclusivamente o snapshot TV-safe do PR 7;
 * sem interação e sem fallbacks alternativos.
 */
export function CallsDashboardScreen() {
  const { loading, snapshot, error } = useChamadosDisplay()

  /* Primeiro carregamento: tela limpa, sem dados antigos inexistentes. */
  if (loading && !snapshot) {
    return (
      <main style={{ ...pageStyle, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '1.4rem', color: '#64748b' }} role="status">Carregando painel…</p>
      </main>
    )
  }

  /* Erro sem nenhum snapshot válido ainda: estado explícito, nunca tela branca. */
  if (!snapshot) {
    return (
      <main style={{ ...pageStyle, alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '1.5rem', fontWeight: 700 }} role="alert">
          {error ? ERROR_MESSAGES[error] : 'Aguardando dados…'}
        </p>
        <p style={{ fontSize: '1rem', color: '#64748b' }}>Tentando novamente automaticamente…</p>
      </main>
    )
  }

  const { summary, tickets, generatedAt } = snapshot

  const cards: Array<{ label: string; value: number; accent: string }> = [
    { label: 'Total na fila', value: summary.total, accent: '#e2e8f0' },
    { label: 'Abertos', value: summary.open, accent: '#fbbf24' },
    { label: 'Em atendimento', value: summary.inProgress, accent: '#60a5fa' },
    { label: 'Alta prioridade', value: summary.highPriority, accent: '#f87171' },
  ]

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <h1 style={{ fontSize: 'clamp(1.6rem, 3.5vmin, 2.6rem)', fontWeight: 800, margin: 0 }}>
          Painel de Chamados
        </h1>
        <p
          style={{ margin: 0, fontSize: 'clamp(0.95rem, 2vmin, 1.3rem)', color: '#94a3b8' }}
          aria-label={`Última atualização às ${formatClock(generatedAt)}`}
        >
          Atualizado às {formatClock(generatedAt)}
        </p>
      </header>

      {error && (
        <section
          role="alert"
          aria-live="polite"
          style={{
            borderRadius: 12, padding: '0.7rem 1.1rem',
            background: 'rgba(148,163,184,0.08)',
            border: '1px solid rgba(148,163,184,0.25)',
            color: '#cbd5e1', fontSize: 'clamp(0.85rem, 1.8vmin, 1.15rem)',
            display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
          }}
        >
          <span>{ERROR_MESSAGES[error]}</span>
          <span>Última atualização: {formatClock(generatedAt)}</span>
        </section>
      )}

      {/* Resumo da fila */}
      <section aria-label="Resumo da fila" style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.2vw',
      }}>
        {cards.map((card) => (
          <div key={card.label} style={{
            borderRadius: 18, padding: '2.2vh 1.5vw',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <p style={{ margin: 0, fontSize: 'clamp(0.8rem, 1.7vmin, 1.05rem)', color: '#94a3b8', fontWeight: 600 }}>
              {card.label}
            </p>
            <p style={{
              margin: 0, fontSize: 'clamp(2rem, 6vmin, 4rem)',
              fontWeight: 800, lineHeight: 1.15, color: card.accent,
            }}>{card.value}</p>
          </div>
        ))}
      </section>

      {/* Métricas de serviço */}
      <section aria-label="Métricas de serviço" style={{ display: 'flex', gap: '1.2vw' }}>
        <div style={{
          flex: 1, borderRadius: 18, padding: '1.6vh 1.5vw',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem',
        }}>
          <span style={{ fontSize: 'clamp(0.85rem, 1.8vmin, 1.15rem)', color: '#94a3b8', fontWeight: 600 }}>
            Tempo médio de resolução
          </span>
          <span style={{ fontSize: 'clamp(1.3rem, 3.2vmin, 2.2rem)', fontWeight: 800 }}>
            {formatMetric(summary.avgResolutionHours, ' h')}
          </span>
        </div>
        <div style={{
          flex: 1, borderRadius: 18, padding: '1.6vh 1.5vw',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem',
        }}>
          <span style={{ fontSize: 'clamp(0.85rem, 1.8vmin, 1.15rem)', color: '#94a3b8', fontWeight: 600 }}>
            Satisfação
          </span>
          <span style={{ fontSize: 'clamp(1.3rem, 3.2vmin, 2.2rem)', fontWeight: 800 }}>
            {summary.satisfaction === null ? '—' : `${summary.satisfaction.toLocaleString('pt-BR')} / 5`}
          </span>
        </div>
      </section>

      {/* Fila de chamados */}
      <section aria-label="Chamados em aberto" style={{ flex: 1, minHeight: 0 }}>
        {tickets.length === 0 ? (
          <p style={{
            textAlign: 'center', color: '#64748b',
            fontSize: 'clamp(1.1rem, 2.6vmin, 1.8rem)', paddingTop: '6vh',
          }}>
            Nenhum chamado em aberto neste momento
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Chamado', 'Local', 'Tipo', 'Prioridade', 'Situação', 'Aberto'].map((h) => (
                  <th key={h} scope="col" style={{
                    textAlign: 'left', padding: '0.6vh 0.8vw',
                    color: '#64748b', fontSize: 'clamp(0.72rem, 1.5vmin, 0.95rem)',
                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => {
                const statusColors = STATUS_COLORS[ticket.status] ?? STATUS_COLORS.aberto
                const priorityColors = PRIORITY_COLORS[ticket.priority] ?? PRIORITY_COLORS.normal
                return (
                  <tr key={ticket.ticketNumber} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={cellStyle}>
                      <span style={{ fontWeight: 800 }}>#{ticket.ticketNumber}</span>
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 600 }}>{ticket.roomName || '—'}</td>
                    <td style={{ ...cellStyle, color: '#cbd5e1' }}>
                      {[ticket.problemCategory, ticket.problemArea].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={cellStyle}>
                      <Badge
                        label={TICKET_PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                        colors={priorityColors}
                      />
                    </td>
                    <td style={cellStyle}>
                      <Badge
                        label={TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
                        colors={statusColors}
                      />
                    </td>
                    <td style={{ ...cellStyle, color: '#94a3b8' }}>{formatAge(ticket.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

const cellStyle: CSSProperties = {
  padding: '1.1vh 0.8vw',
  fontSize: 'clamp(0.95rem, 2.1vmin, 1.45rem)',
}
