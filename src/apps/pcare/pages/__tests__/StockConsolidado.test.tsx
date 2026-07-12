import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/usePCs', () => ({ usePCs: vi.fn() }))
vi.mock('../../hooks/useParts', () => ({ useParts: vi.fn() }))
vi.mock('../../services/partUsageService', () => ({
  partUsageService: { getAll: vi.fn(), getByPartId: vi.fn() },
}))

import { usePCs } from '../../hooks/usePCs'
import { useParts } from '../../hooks/useParts'
import { partUsageService } from '../../services/partUsageService'
import { StockConsolidado } from '../StockConsolidado'

const mockPCs = [
  { id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001' },
  { id: 'pc-2', labName: 'Lab B', pcNumber: 'PC-002' },
]
const mockParts = [
  { id: 'part-1', name: 'Teclado', category: 'keyboard', quantity: 10, minQuantity: 2 },
  { id: 'part-2', name: 'Mouse', category: 'mouse', quantity: 1, minQuantity: 3 },
  { id: 'part-3', name: 'SSD 240GB', category: 'ssd', quantity: 5, minQuantity: 1 },
]
const mockUsage = [
  { id: 'u1', partId: 'part-1', pcId: 'pc-1', quantity: 2, timestamp: '2026-01-10' },
]

function renderConsolidado() {
  return render(<MemoryRouter><StockConsolidado /></MemoryRouter>)
}

describe('StockConsolidado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(usePCs as any).mockReturnValue({ pcs: mockPCs })
    ;(useParts as any).mockReturnValue({ parts: mockParts })
    ;(partUsageService.getAll as any).mockReturnValue(mockUsage)
  })

  it('renderiza título', () => {
    renderConsolidado()
    expect(screen.getByText('Consolidado de Estoque')).toBeInTheDocument()
  })

  it('exibe botão "Ver Peças"', () => {
    renderConsolidado()
    expect(screen.getByText('Ver Peças')).toBeInTheDocument()
  })

  it('exibe filtros de laboratório', () => {
    renderConsolidado()
    expect(screen.getByText('Todas')).toBeInTheDocument()
    expect(screen.getAllByText('Lab A').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Lab B').length).toBeGreaterThanOrEqual(1)
  })

  it('exibe stats cards', () => {
    renderConsolidado()
    expect(screen.getByText('Peças')).toBeInTheDocument()
    expect(screen.getByText('Itens em estoque')).toBeInTheDocument()
    expect(screen.getByText('Categorias')).toBeInTheDocument()
    expect(screen.getByText('Estoque baixo')).toBeInTheDocument()
  })

  it('exibe valor total de peças', () => {
    renderConsolidado()
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1)
  })

  it('exibe análise por categoria', () => {
    renderConsolidado()
    expect(screen.getByText('Por Categoria')).toBeInTheDocument()
  })

  it('exibe seção de estoque baixo', () => {
    renderConsolidado()
    expect(screen.getByText('Estoque Baixo')).toBeInTheDocument()
    expect(screen.getAllByText('Mouse').length).toBeGreaterThanOrEqual(1)
  })

  it('exibe uso por laboratório', () => {
    renderConsolidado()
    expect(screen.getByText('Uso por Laboratório')).toBeInTheDocument()
  })

  it('filtra por laboratório ao clicar', () => {
    renderConsolidado()
    fireEvent.click(screen.getAllByText('Lab A')[0])
    expect(screen.getAllByText('Lab A').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Teclado')).toBeInTheDocument()
  })
})
