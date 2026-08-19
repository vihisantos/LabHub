import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'

import { ChamadosBottomNav } from '../ChamadosBottomNav'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ChamadosBottomNav', () => {
  it('renderiza os itens principais e o menu "Mais"', () => {
    renderWithProviders(<ChamadosBottomNav />, { initialEntries: ['/chamados'] })

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Chamados')).toBeInTheDocument()
    expect(screen.queryByText('Salas')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Mais opções')).toBeInTheDocument()
  })

  it('mostra o contador de chamados abertos no item Chamados', () => {
    renderWithProviders(<ChamadosBottomNav openCount={3} />, { initialEntries: ['/chamados/tickets'] })

    const chamadosBtn = screen.getByText('Chamados').closest('button')
    expect(chamadosBtn).not.toBeNull()
    expect(within(chamadosBtn as HTMLElement).getByText('3')).toBeInTheDocument()
  })

  it('sem chamados abertos não mostra badge', () => {
    renderWithProviders(<ChamadosBottomNav openCount={0} />, { initialEntries: ['/chamados/tickets'] })

    const chamadosBtn = screen.getByText('Chamados').closest('button')
    expect(within(chamadosBtn as HTMLElement).queryByText('3')).not.toBeInTheDocument()
  })

  it('destaca somente a aba ativa em rota filha (pai não fica selecionado)', () => {
    renderWithProviders(<ChamadosBottomNav />, { initialEntries: ['/chamados/tickets'] })

    const dashboardBtn = screen.getByText('Dashboard').closest('button')
    const chamadosBtn = screen.getByText('Chamados').closest('button')

    expect(dashboardBtn).not.toBeNull()
    expect(chamadosBtn).not.toBeNull()
    expect(dashboardBtn!.classList.contains('text-indigo-500')).toBe(false)
    expect(chamadosBtn!.classList.contains('text-indigo-500')).toBe(true)
  })

  it('abre o menu "Mais" e navega para Relatórios', () => {
    renderWithProviders(<ChamadosBottomNav />, { initialEntries: ['/chamados'] })

    fireEvent.click(screen.getByLabelText('Mais opções'))
    expect(screen.getByText('Relatórios')).toBeInTheDocument()
    expect(screen.getByText('QR Code')).toBeInTheDocument()
    expect(screen.getByText('Config')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Relatórios'))
    expect(screen.queryByText('QR Code')).not.toBeInTheDocument()
    expect(screen.getAllByText('Relatórios')).toHaveLength(1)
  })
})
