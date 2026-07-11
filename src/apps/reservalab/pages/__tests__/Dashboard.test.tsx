import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DashboardView } from '../Dashboard'

// Mock services
vi.mock('../../services/api', () => ({
  fetchReservas: vi.fn(),
}))

vi.mock('../../services/supabase', () => ({
  fetchTabletReservas: vi.fn(),
}))

// Mock useIsMobile
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}))

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const { initial, animate, transition, whileHover, ...rest } = props
      return <div {...rest}>{children}</div>
    },
    button: ({ children, ...props }: any) => {
      const { initial, animate, transition, whileHover, whileTap, ...rest } = props
      return <button {...rest}>{children}</button>
    },
    span: ({ children, ...props }: any) => {
      const { animate, transition, ...rest } = props
      return <span {...rest}>{children}</span>
    },
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock recharts - SVGs are fine in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div style={{ width: '100%', height: 200 }}>{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div>Bar</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
  CartesianGrid: () => <div>Grid</div>,
  Tooltip: () => <div>Tooltip</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div>Area</div>,
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

import { fetchReservas } from '../../services/api'
import { fetchTabletReservas } from '../../services/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'

const mockReservasData = {
  lab1_reservas: [
    { horario: '07h30 às 09h20', responsavel: 'Prof. Silva', observacao: 'Matemática', reserva_feita_por: 'João', alunos: '30', labs: ['LAB01'], lab: 'LAB01', data: '29/06/2026' },
    { horario: '09h30 às 11h20', responsavel: 'Prof. Ana', observacao: 'Física', reserva_feita_por: 'Maria', alunos: '25', labs: ['LAB01'], lab: 'LAB01', data: '29/06/2026' },
  ],
  lab2_reservas: [
    { horario: '13h30 às 15h20', responsavel: 'Prof. Carlos', observacao: 'Química', reserva_feita_por: 'Pedro', alunos: '20', labs: ['LAB02'], lab: 'LAB02', data: '29/06/2026' },
  ],
  reservas_semana: [
    { horario: '07h30 às 09h20', responsavel: 'Prof. Silva', observacao: 'Matemática', reserva_feita_por: 'João', alunos: '30', labs: ['LAB01'], lab: 'LAB01', data: '29/06/2026' },
    { horario: '13h30 às 15h20', responsavel: 'Prof. Carlos', observacao: 'Química', reserva_feita_por: 'Pedro', alunos: '20', labs: ['LAB02'], lab: 'LAB02', data: '30/06/2026' },
  ],
}

const mockTabletReservas = [
  { id: 1, sala: 'Sala 1', quantidade_tablets: 10, professor: 'Prof. Ana', horario_inicio: new Date(Date.now() + 1000).toISOString(), horario_fim: new Date(Date.now() + 7200000).toISOString(), finalidade: 'Aula prática', reservado_por: 'Maria', status: 'ativa' },
]

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardView />
    </MemoryRouter>,
  )
}

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    ;(fetchReservas as any).mockResolvedValue(mockReservasData)
    ;(fetchTabletReservas as any).mockResolvedValue(mockTabletReservas)
    ;(useIsMobile as any).mockReturnValue(false)
  })

  afterEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-25T12:00:00Z'))
  })

  it('renderiza o título "Visão Geral"', async () => {
    renderDashboard()
    expect(await screen.findByText('Visão Geral')).toBeInTheDocument()
  })

  it('exibe métricas nos StatsCards', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Reservas Hoje')).toBeInTheDocument()
      expect(screen.getByText('Total da Semana')).toBeInTheDocument()
      expect(screen.getByText('Alunos Programados')).toBeInTheDocument()
      expect(screen.getByText('Horário Pico')).toBeInTheDocument()
    })
  })

  it('exibe gráficos (BarChart e AreaChart)', async () => {
    renderDashboard()
    expect(await screen.findByTestId('bar-chart')).toBeInTheDocument()
    expect(await screen.findByTestId('area-chart')).toBeInTheDocument()
  })

  it('exibe a seção "Agora" com ocupação ao vivo', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText('Agora')).toBeInTheDocument()
    })
  })

  it('exibe link para Inventário que navega para /stock', async () => {
    renderDashboard()
    const btn = await screen.findByText('Inventário')
    btn.click()
    expect(mockNavigate).toHaveBeenCalledWith('/stock')
  })

  it('exibe data formatada no header', async () => {
    renderDashboard()
    await waitFor(() => {
      expect(screen.getByText(/Métricas em tempo real/)).toBeInTheDocument()
    })
  })

  it('exibe gráfico de Distribuição por Horário', async () => {
    renderDashboard()
    expect(await screen.findByText('Distribuição por Horário')).toBeInTheDocument()
  })

  it('exibe gráfico de Reservas por Dia', async () => {
    renderDashboard()
    expect(await screen.findByText('Reservas por Dia')).toBeInTheDocument()
  })

  it('lida com dados vazios sem quebrar', async () => {
    ;(fetchReservas as any).mockResolvedValue({ lab1_reservas: [], lab2_reservas: [], reservas_semana: [] })
    ;(fetchTabletReservas as any).mockResolvedValue([])
    renderDashboard()
    expect(await screen.findByText('Visão Geral')).toBeInTheDocument()
    expect(screen.getByText('Agora')).toBeInTheDocument()
  })

  it('lida com erro na API sem quebrar', async () => {
    ;(fetchReservas as any).mockRejectedValue(new Error('API error'))
    ;(fetchTabletReservas as any).mockRejectedValue(new Error('API error'))
    renderDashboard()
    expect(await screen.findByText('Visão Geral')).toBeInTheDocument()
  })
})
