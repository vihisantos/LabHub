import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'

vi.mock('../../services/partService', () => ({
  partService: { getAll: vi.fn(() => []) },
}))
vi.mock('../../services/maintenanceService', () => ({
  maintenanceService: { getAll: vi.fn(() => []) },
}))

import { BottomNav } from '../BottomNav'

function isActive(label: string): boolean {
  const btn = screen.getByText(label).closest('button')
  expect(btn).not.toBeNull()
  return btn!.classList.contains('text-indigo-500')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BottomNav (PC Care)', () => {
  it('renderiza Início, itens principais e menu "Mais"', () => {
    renderWithProviders(<BottomNav />, { initialEntries: ['/pc-care'] })

    expect(screen.getByText('Início')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Ativos')).toBeInTheDocument()
    expect(screen.getByText('Estoque')).toBeInTheDocument()
    expect(screen.getByText('Manutenção')).toBeInTheDocument()
    expect(screen.getByLabelText('Mais opções')).toBeInTheDocument()
  })

  it('destaca somente o Dashboard na raiz /pc-care', () => {
    renderWithProviders(<BottomNav />, { initialEntries: ['/pc-care'] })

    expect(isActive('Dashboard')).toBe(true)
    expect(isActive('Ativos')).toBe(false)
    expect(isActive('Estoque')).toBe(false)
    expect(isActive('Manutenção')).toBe(false)
  })

  it('em /pc-care/parts destaca somente Estoque (Dashboard não fica selecionado)', () => {
    renderWithProviders(<BottomNav />, { initialEntries: ['/pc-care/parts'] })

    expect(isActive('Estoque')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
    expect(isActive('Ativos')).toBe(false)
    expect(isActive('Manutenção')).toBe(false)
  })

  it('em /pc-care/assets destaca somente Ativos', () => {
    renderWithProviders(<BottomNav />, { initialEntries: ['/pc-care/assets'] })

    expect(isActive('Ativos')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
    expect(isActive('Estoque')).toBe(false)
    expect(isActive('Manutenção')).toBe(false)
  })

  it('em /pc-care/maintenance destaca somente Manutenção', () => {
    renderWithProviders(<BottomNav />, { initialEntries: ['/pc-care/maintenance'] })

    expect(isActive('Manutenção')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
    expect(isActive('Ativos')).toBe(false)
    expect(isActive('Estoque')).toBe(false)
  })

  it('em página de detalhe /pc-care/assets/:id mantém Ativos ativo', () => {
    renderWithProviders(<BottomNav />, { initialEntries: ['/pc-care/assets/pc-123'] })

    expect(isActive('Ativos')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
    expect(isActive('Estoque')).toBe(false)
    expect(isActive('Manutenção')).toBe(false)
  })

  it('em rota do menu "Mais" mostra o item ativo no botão e desativa o Dashboard', () => {
    renderWithProviders(<BottomNav />, { initialEntries: ['/pc-care/settings'] })

    const moreBtn = screen.getByLabelText('Mais opções')
    expect(moreBtn).toHaveTextContent('Config')
    expect(moreBtn.classList.contains('text-indigo-500')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
  })
})
