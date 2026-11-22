import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { render, screen } from '@testing-library/react'
import { ClockSlide } from '../ClockSlide'

// Instantes sempre em UTC: o slide fixa America/Sao_Paulo (UTC-3), então o
// resultado esperado não depende do fuso da máquina que roda os testes.
describe('ClockSlide', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('exibe a hora atual', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T17:30:45Z')) // 14:30 em Brasília

    render(<ClockSlide />)

    expect(screen.getByText('14:30')).toBeInTheDocument()
  })

  it('exibe o dia da semana e data', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T13:00:00Z')) // quarta-feira, 15 de julho de 2026

    render(<ClockSlide />)

    expect(screen.getByText(/quarta-feira/)).toBeInTheDocument()
    expect(screen.getByText(/15 de julho/)).toBeInTheDocument()
  })

  it('atualiza a hora a cada segundo', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T17:30:00Z'))

    render(<ClockSlide />)
    expect(screen.getByText('14:30')).toBeInTheDocument()

    act(() => {
      vi.setSystemTime(new Date('2026-07-15T17:31:00Z'))
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByText('14:31')).toBeInTheDocument()
  })

  it('usa America/Sao_Paulo, não o fuso do aparelho', () => {
    vi.useFakeTimers()
    // 02:00 UTC do dia 16 ainda é o dia 15 (23:00) em Brasília. Se o componente
    // usasse o fuso local, um kiosk em UTC mostraria 02:00 / 16 de julho.
    vi.setSystemTime(new Date('2026-07-16T02:00:00Z'))

    render(<ClockSlide />)

    expect(screen.getByText('23:00')).toBeInTheDocument()
    expect(screen.getByText(/15 de julho/)).toBeInTheDocument()
  })

  it('tem o layout correto com identidade visual do LabHub', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T17:30:00Z'))

    render(<ClockSlide />)

    const hourElement = screen.getByText('14:30')
    expect(hourElement).toBeInTheDocument()
    expect(hourElement.style.fontSize).toBe('clamp(6rem, 15vw, 13rem)')

    expect(screen.getByText('Horário')).toBeInTheDocument()
    expect(screen.getByText('LabHub TV')).toBeInTheDocument()
    expect(screen.getByText('Horário de Brasília')).toBeInTheDocument()
    expect(screen.getByText('Piracicaba · SP')).toBeInTheDocument()
  })
})
