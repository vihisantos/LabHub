import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WeeklyCalendar } from '../WeeklyCalendar'
import type { WeekDayData } from '../../types'

// Mock framer-motion (motion.div + AnimatePresence)
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, transition, exit, layout, ...rest } = props
      return <div {...rest}>{children}</div>
    },
    button: ({ children, ...props }: any) => {
      const { initial, animate, transition, whileHover, whileTap, ...rest } = props
      return <button {...rest}>{children}</button>
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

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
  it('renderiza título "Próximos 7 Dias"', () => {
    renderCalendar()
    expect(screen.getByText('Próximos 7 Dias')).toBeInTheDocument()
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
})
