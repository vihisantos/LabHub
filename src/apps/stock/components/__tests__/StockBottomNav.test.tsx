import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'

const mockUseStock = vi.hoisted(() => vi.fn())
const mockUseKits = vi.hoisted(() => vi.fn())
const mockUseMovements = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/useStock', () => ({ useStock: mockUseStock }))
vi.mock('../../hooks/useKits', () => ({ useKits: mockUseKits }))
vi.mock('../../hooks/useMovements', () => ({ useMovements: mockUseMovements }))

import { StockBottomNav } from '../StockBottomNav'

function isActive(label: string): boolean {
  const btn = screen.getByText(label).closest('button')
  expect(btn).not.toBeNull()
  return btn!.classList.contains('text-indigo-500')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseStock.mockReturnValue({ items: [] })
  mockUseKits.mockReturnValue({ kits: [] })
  mockUseMovements.mockReturnValue({ movements: [] })
})

describe('StockBottomNav', () => {
  it('renderiza Início, itens principais e menu "Mais"', () => {
    renderWithProviders(<StockBottomNav />, { initialEntries: ['/stock'] })

    expect(screen.getByText('Início')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Estoque')).toBeInTheDocument()
    expect(screen.getByText('Ent/Sai')).toBeInTheDocument()
    expect(screen.getByLabelText('Mais opções')).toBeInTheDocument()
  })

  it('destaca somente o Dashboard na raiz /stock', () => {
    renderWithProviders(<StockBottomNav />, { initialEntries: ['/stock'] })

    expect(isActive('Dashboard')).toBe(true)
    expect(isActive('Estoque')).toBe(false)
    expect(isActive('Ent/Sai')).toBe(false)
  })

  it('em /stock/items destaca somente Estoque (Dashboard não fica selecionado)', () => {
    renderWithProviders(<StockBottomNav />, { initialEntries: ['/stock/items'] })

    expect(isActive('Estoque')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
    expect(isActive('Ent/Sai')).toBe(false)
  })

  it('em /stock/entry-exit destaca somente Ent/Sai', () => {
    renderWithProviders(<StockBottomNav />, { initialEntries: ['/stock/entry-exit'] })

    expect(isActive('Ent/Sai')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
    expect(isActive('Estoque')).toBe(false)
  })

  it('em /general-stock/items normaliza o caminho e destaca Estoque', () => {
    renderWithProviders(<StockBottomNav />, { initialEntries: ['/general-stock/items'] })

    expect(isActive('Estoque')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
  })

  it('em rota do menu "Mais" mostra o item ativo no botão e desativa o Dashboard', () => {
    renderWithProviders(<StockBottomNav />, { initialEntries: ['/stock/kits'] })

    const moreBtn = screen.getByLabelText('Mais opções')
    expect(moreBtn).toHaveTextContent('Kits')
    expect(moreBtn.classList.contains('text-indigo-500')).toBe(true)
    expect(isActive('Dashboard')).toBe(false)
  })
})
