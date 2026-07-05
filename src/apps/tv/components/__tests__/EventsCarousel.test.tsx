import { render, screen } from '@testing-library/react'
import { EventsCarousel } from '../EventsCarousel'
import type { TvEvent } from '../../types'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: any) => <div>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

function makeEvent(overrides: Partial<TvEvent> = {}): TvEvent {
  return {
    id: 'evt-1',
    title: 'Evento Teste',
    description: 'Descrição do evento',
    image_url: null,
    pdf_url: null,
    start_date: null,
    end_date: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('EventsCarousel', () => {
  it('renderiza mensagem de vazio quando não há eventos', () => {
    render(<EventsCarousel events={[]} />)
    expect(screen.getByText('Nenhum evento programado')).toBeInTheDocument()
  })

  it('renderiza título do primeiro evento', () => {
    const events = [makeEvent({ title: 'Workshop React' })]
    render(<EventsCarousel events={events} />)
    expect(screen.getByText('Workshop React')).toBeInTheDocument()
  })

  it('renderiza descrição do evento', () => {
    const events = [makeEvent({ description: 'Aprenda React' })]
    render(<EventsCarousel events={events} />)
    expect(screen.getByText('Aprenda React')).toBeInTheDocument()
  })

  it('não renderiza descrição quando é null', () => {
    const events = [makeEvent({ description: null })]
    const { container } = render(<EventsCarousel events={events} />)
    expect(container.textContent).not.toContain('Aprenda React')
  })

  it('renderiza imagem quando image_url é fornecida', () => {
    const events = [makeEvent({ image_url: 'https://example.com/img.jpg' })]
    const { container } = render(<EventsCarousel events={events} />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://example.com/img.jpg')
    expect(img).toHaveAttribute('alt', 'Evento Teste')
  })

  it('renderiza dots de navegação para múltiplos eventos', () => {
    const events = [
      makeEvent({ id: '1', title: 'A' }),
      makeEvent({ id: '2', title: 'B' }),
    ]
    const { container } = render(<EventsCarousel events={events} interval={8000} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    const dots = container.querySelectorAll('div[style*="border-radius: 4px"][style*="height: 8px"]')
    expect(dots.length).toBe(2)
  })

  it('renderiza modo fullBleed com imagem de fundo', () => {
    const events = [makeEvent({ image_url: 'https://example.com/bg.jpg', title: 'Full Bleed Event' })]
    const { container } = render(<EventsCarousel events={events} fullBleed />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://example.com/bg.jpg')
    expect(screen.getByText('Full Bleed Event')).toBeInTheDocument()
  })

  it('não renderiza imagem no fullBleed sem image_url', () => {
    const events = [makeEvent({ image_url: null })]
    const { container } = render(<EventsCarousel events={events} fullBleed />)
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('renderiza data do evento em formato pt-BR', () => {
    const events = [makeEvent({ start_date: '2026-07-15T10:00:00Z' })]
    render(<EventsCarousel events={events} />)
    expect(screen.getByText(/15\/07\/2026/)).toBeInTheDocument()
  })

  it('renderiza "Acontecendo agora" em fullBleed com data passada', () => {
    // System time is mocked to 2026-06-25T12:00:00Z by setup.ts
    const pastDate = '2026-06-20T10:00:00Z'
    const events = [makeEvent({ start_date: pastDate })]
    render(<EventsCarousel events={events} fullBleed />)
    expect(screen.getByText('Acontecendo agora')).toBeInTheDocument()
  })

  it('renderiza contagem regressiva em fullBleed com data futura', () => {
    // Use fake timers (already active from setup.ts) with a future date
    // System time is 2026-06-25T12:00:00Z
    const futureDate = '2026-06-28T12:00:00Z' // 3 days from mocked time
    const events = [makeEvent({ start_date: futureDate })]
    render(<EventsCarousel events={events} fullBleed />)
    expect(screen.getByText(/Em 3d/)).toBeInTheDocument()
  })
})
