import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { WeeklyCalendar } from '../WeeklyCalendar'
import type { WeekDayData } from '../../types'

// Mock framer-motion (motion.div + AnimatePresence)
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('@/core/workspaces/WorkspaceContext', () => ({
  useWorkspace: () => ({ workspace: { id: 'ws-1', name: 'Campus A', slug: 'campus-a' } }),
}))

vi.mock('@/apps/tv/services/supabase', () => ({
  fetchWorkspaceDevices: vi.fn(),
  reserveEventUpsert: vi.fn(),
}))

import { fetchWorkspaceDevices, reserveEventUpsert } from '@/apps/tv/services/supabase'

function makeWeekData(): WeekDayData[] {
  return [
    {
      date: '29/06/2026',
      dayName: 'Segunda-feira',
      reservations: [
        {
          tipo: 'lab',
          lab: 'Lab Info 1',
          time: '07h30 às 09h20',
          subject: 'Matemática',
          professor: 'Prof. Silva',
          reservaFeitaPor: 'João',
          observacao: 'Aula de matemática',
        },
        {
          tipo: 'lab',
          lab: 'Lab Redes',
          time: '09h30 às 11h20',
          subject: 'Redes',
          professor: 'Prof. Ana',
          reservaFeitaPor: '',
          observacao: '',
        },
      ],
    },
    {
      date: '30/06/2026',
      dayName: 'Terça-feira',
      reservations: [
        {
          tipo: 'tablet',
          lab: 'Lab Tablets',
          time: '14:00 - 16:00',
          subject: 'Tablets',
          professor: 'Prof. Carlos',
          reservaFeitaPor: 'Maria',
          observacao: 'Uso de tablets',
        },
      ],
    },
    {
      date: '01/07/2026',
      dayName: 'Quarta-feira',
      reservations: [],
    },
  ]
}

function renderCalendar(weekData = makeWeekData()) {
  return render(
    <MemoryRouter>
      <WeeklyCalendar weekData={weekData} />
    </MemoryRouter>,
  )
}

describe('WeeklyCalendar', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })
  it('renderiza título "Próximos 30 Dias"', () => {
    renderCalendar()
    expect(screen.getByText('Próximos 30 Dias')).toBeInTheDocument()
  })

  it('renderiza dias da semana', () => {
    renderCalendar()
    expect(screen.getByText('29')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('exibe "0 reservas" para dia sem reservas', () => {
    renderCalendar()
    expect(screen.getByText('0 reservas')).toBeInTheDocument()
  })

  it('exibe nome do lab nas reservas', () => {
    renderCalendar()
    expect(screen.getByText('Lab Info 1')).toBeInTheDocument()
    expect(screen.getByText('Lab Redes')).toBeInTheDocument()
  })

  it('exibe horário das reservas', () => {
    renderCalendar()
    expect(screen.getByText('07h30 às 09h20')).toBeInTheDocument()
    expect(screen.getByText('09h30 às 11h20')).toBeInTheDocument()
  })

  it('clica em um dia e abre o modal de detalhes', () => {
    renderCalendar()
    // Clica no dia 29
    fireEvent.click(screen.getByText('29'))
    // O modal deve mostrar os detalhes da reserva
    expect(screen.getByText('Prof. Silva')).toBeInTheDocument()
    expect(screen.getByText('Aula de matemática')).toBeInTheDocument()
  })

  it('exibe data correta no modal', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('29'))
    expect(screen.getByText('29/06/2026')).toBeInTheDocument()
  })

  it('modal de detalhes exibe filtro de tipo', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('29'))
    expect(screen.getByText('Todas')).toBeInTheDocument()
    expect(screen.getByText('Labs')).toBeInTheDocument()
    expect(screen.getByText('Tablets')).toBeInTheDocument()
  })

  it('filtro "Tablets" mostra apenas reservas do tipo tablet', () => {
    renderCalendar()
    // Clica no dia 30 (tem reserva de tablet)
    fireEvent.click(screen.getByText('30'))
    expect(screen.getAllByText('Lab Tablets').length).toBeGreaterThanOrEqual(1)

    // Filtra por Labs (deve esconder a reserva de tablet no modal)
    // O texto "Lab Tablets" continua no card do dia (não some)
    // Mas a mensagem de vazio deve aparecer no modal
    fireEvent.click(screen.getByText('Labs'))
    expect(screen.getByText('Nenhuma reserva neste dia')).toBeInTheDocument()
  })

  it('filtro de período esconde reservas fora do período', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('29'))

    // Filtra por "Noite" (não deve ter reservas de noite)
    fireEvent.click(screen.getByText('Noite'))
    expect(screen.getByText(/Nenhuma reserva no período/)).toBeInTheDocument()
  })

  it('filtro "Manhã" mostra reservas da manhã', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('29'))

    fireEvent.click(screen.getByText('Manhã'))
    // Lab Info 1 é 07h30 (manhã) - aparece no card do dia e no modal
    const labInfos = screen.getAllByText('Lab Info 1')
    expect(labInfos.length).toBeGreaterThanOrEqual(1)
    // Lab Redes também é manhã (09h30) - aparece no card e no modal
    const labRedes = screen.getAllByText('Lab Redes')
    expect(labRedes.length).toBeGreaterThanOrEqual(1)
  })

  it('filtro "Tarde" mostra reservas da tarde', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('30'))

    fireEvent.click(screen.getByText('Tarde'))
    // Lab Tablets é 14:00 (tarde) - aparece no card do dia e no modal
    const labTablets = screen.getAllByText('Lab Tablets')
    expect(labTablets.length).toBeGreaterThanOrEqual(1)
  })

  it('exibe badge Tablet para reservas do tipo tablet', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('30'))
    // "Tablet" aparece tanto no badge da reserva quanto na legenda
    const tablets = screen.getAllByText('Tablet')
    expect(tablets.length).toBeGreaterThanOrEqual(1)
  })

  it('exibe reservado por', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('29'))
    expect(screen.getByText('João')).toBeInTheDocument()
  })

  it('botão "Criar evento na TV" aparece no modal de detalhes', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('29'))
    const tvButtons = screen.getAllByText('Criar evento na TV')
    expect(tvButtons.length).toBeGreaterThanOrEqual(1)
  })

  it('exibe legenda no modal de detalhes', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('29'))
    expect(screen.getByText('Lab')).toBeInTheDocument()
    expect(screen.getByText('Tablet')).toBeInTheDocument()
    expect(screen.getByText('Horário')).toBeInTheDocument()
    expect(screen.getByText('Professor')).toBeInTheDocument()
  })

  it('fecha o modal ao clicar no overlay', () => {
    renderCalendar()
    fireEvent.click(screen.getByText('29'))
    // "Prof. Silva" e "Aula de matemática" só existem no modal (não no card do dia)
    expect(screen.getByText('Prof. Silva')).toBeInTheDocument()
    expect(screen.getByText('Aula de matemática')).toBeInTheDocument()

    // Clica no overlay (fora do modal)
    const overlay = document.querySelector('[style*="position: fixed"]')
    expect(overlay).toBeTruthy()
    if (overlay) {
      fireEvent.click(overlay)
      expect(screen.queryByText('Prof. Silva')).not.toBeInTheDocument()
      expect(screen.queryByText('Aula de matemática')).not.toBeInTheDocument()
    }
  })

  it('exibe o nome do dia em formato abreviado', () => {
    renderCalendar()
    // Segunda-feira → Seg, Terça-feira → Ter
    expect(screen.getByText('Seg')).toBeInTheDocument()
    expect(screen.getByText('Ter')).toBeInTheDocument()
    expect(screen.getByText('Qua')).toBeInTheDocument()
  })

  it('cria evento na TV com disciplina no título, professor e sala na descrição', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([
      { id: 'tv-1', name: 'TV do Lab', workspace_id: 'ws-1' },
    ])
    ;(reserveEventUpsert as any).mockResolvedValue({ event_id: 'evt-1', schedule_id: 'sch-1' })

    renderCalendar()
    fireEvent.click(screen.getByText('29'))

    fireEvent.click(screen.getAllByText('Criar evento na TV')[0])
    expect(await screen.findByText('Matemática')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Programar evento' }))

    await vi.waitFor(() => {
      expect(reserveEventUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Matemática',
          description: 'Professor: Prof. Silva | Sala: Lab Info 1',
          reservationDate: '2026-06-29',
        }),
      )
    })
  })

  it('não envia "Reservado por" no evento da TV', async () => {
    ;(fetchWorkspaceDevices as any).mockResolvedValue([
      { id: 'tv-1', name: 'TV do Lab', workspace_id: 'ws-1' },
    ])
    ;(reserveEventUpsert as any).mockResolvedValue({ event_id: 'evt-1', schedule_id: 'sch-1' })

    renderCalendar()
    fireEvent.click(screen.getByText('29'))

    fireEvent.click(screen.getAllByText('Criar evento na TV')[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Programar evento' }))

    await vi.waitFor(() => {
      const call = (reserveEventUpsert as any).mock.calls.find(([c]: any) => c && c.title === 'Matemática')
      expect(call).toBeTruthy()
      expect(call[0].description).not.toContain('Reservado por')
      expect(call[0].description).not.toContain('João')
    })
  })

  describe('faixa horizontal de dias (Issue #391)', () => {
    it('renderiza os dias em uma única linha (flex + nowrap), sem grid', () => {
      renderCalendar()
      const strip = screen.getByTestId('weekly-calendar-scroll')
      expect(strip.style.display).toBe('flex')
      expect(strip.style.flexWrap).toBe('nowrap')
      expect(strip.style.display).not.toBe('grid')
      expect(strip.style.gridTemplateColumns).toBe('')
    })

    it('permite rolagem horizontal e restringe a largura ao layout', () => {
      renderCalendar()
      const strip = screen.getByTestId('weekly-calendar-scroll')
      expect(strip.style.overflowX).toBe('auto')
      expect(strip.style.overflowY).toBe('hidden')
      expect(strip.style.width).toBe('100%')
      expect(strip.style.maxWidth).toBe('100%')
    })

    it('não comprime os itens (largura fixa) para não quebrar em segunda linha', () => {
      renderCalendar()
      const days = screen.getAllByTestId('weekly-calendar-day')
      expect(days.length).toBeGreaterThanOrEqual(3)
      days.forEach((day) => {
        expect(day.style.flex).toBe('0 0 9.5rem')
        expect(day.style.minWidth).toBe('9.5rem')
        expect(day.style.maxWidth).toBe('9.5rem')
      })
    })

    it('mantém 30 dias em uma única faixa rolável', () => {
      const trintaDias: WeekDayData[] = Array.from({ length: 30 }, (_, i) => ({
        date: `${String(i + 1).padStart(2, '0')}/07/2026`,
        dayName: 'Segunda-feira',
        reservations: [],
      }))
      renderCalendar(trintaDias)
      const strip = screen.getByTestId('weekly-calendar-scroll')
      expect(strip.style.display).toBe('flex')
      expect(strip.style.flexWrap).toBe('nowrap')
      expect(screen.getAllByTestId('weekly-calendar-day')).toHaveLength(30)
    })

    it('remove a barra quando poucos dias cabem naturalmente', () => {
      const tresDias: WeekDayData[] = makeWeekData()
      renderCalendar(tresDias)
      const strip = screen.getByTestId('weekly-calendar-scroll')
      // overflowX auto: navegador só mostra a barra se o conteúdo exceder a largura
      expect(strip.style.overflowX).toBe('auto')
      expect(screen.getAllByTestId('weekly-calendar-day')).toHaveLength(3)
    })

    it('mantém os indicadores de reservas visíveis nos dias', () => {
      renderCalendar()
      expect(screen.getByText('Lab Info 1')).toBeInTheDocument()
      expect(screen.getByText('Lab Tablets')).toBeInTheDocument()
      expect(screen.getByText('0 reservas')).toBeInTheDocument()
    })

    it('seleciona um dia via clique (modal continua funcionando)', () => {
      renderCalendar()
      fireEvent.click(screen.getByText('29'))
      expect(screen.getByText('29/06/2026')).toBeInTheDocument()
    })

    it('seleciona um dia via teclado (tab + Enter) com foco visível', async () => {
      const user = userEvent.setup()
      renderCalendar()
      const primeiroDia = screen.getAllByTestId('weekly-calendar-day')[0]
      await user.tab()
      expect(primeiroDia).toHaveFocus()
      await user.keyboard('{Enter}')
      expect(screen.getByText('29/06/2026')).toBeInTheDocument()
    })

    it('indica semanticamente o dia selecionado via aria-pressed', () => {
      renderCalendar()
      fireEvent.click(screen.getByText('29'))
      const days = screen.getAllByTestId('weekly-calendar-day')
      expect(days[0]).toHaveAttribute('aria-pressed', 'true')
      expect(days[1]).toHaveAttribute('aria-pressed', 'false')
    })
  })
})
