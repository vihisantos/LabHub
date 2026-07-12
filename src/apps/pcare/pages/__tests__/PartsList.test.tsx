import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../hooks/useParts', () => ({ useParts: vi.fn() }))
vi.mock('../../hooks/usePCs', () => ({ usePCs: vi.fn() }))
vi.mock('../../services/partUsageService', () => ({ partUsageService: { getByPartId: vi.fn(), getAll: vi.fn() } }))
vi.mock('../../components/EmptyState', () => ({ EmptyState: ({ title, action }: any) => (
  <div data-testid="empty-state"><p>{title}</p>{action && <button onClick={action.onClick}>{action.label}</button>}</div>
)}))
vi.mock('../../components/Skeletons', () => ({ SkeletonCard: () => <div data-testid="skeleton" /> }))

import { useParts } from '../../hooks/useParts'
import { usePCs } from '../../hooks/usePCs'
import { partUsageService } from '../../services/partUsageService'
import { PartsList } from '../PartsList'

const mockParts = [
  { id: 'part-1', name: 'Teclado', category: 'keyboard', quantity: 10, minQuantity: 2, serialNumber: 'SN-001', notes: 'USB' },
  { id: 'part-2', name: 'Mouse', category: 'mouse', quantity: 1, minQuantity: 3, serialNumber: '', notes: '' },
]

function renderPartsList() {
  return render(<MemoryRouter><PartsList /></MemoryRouter>)
}

describe('PartsList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useParts as any).mockReturnValue({
      parts: mockParts, loading: false,
      create: vi.fn(), update: vi.fn(), remove: vi.fn(), reload: vi.fn(),
    })
    ;(usePCs as any).mockReturnValue({ pcs: [], loading: false, update: vi.fn(), reload: vi.fn() })
    ;(partUsageService.getByPartId as any).mockReturnValue([])
  })

  it('renderiza título', () => {
    renderPartsList()
    expect(screen.getByText('Estoque de Peças')).toBeInTheDocument()
  })

  it('exibe botão "+ Nova Peça"', () => {
    renderPartsList()
    expect(screen.getByText('+ Nova Peça')).toBeInTheDocument()
  })

  it('exibe lista de peças', () => {
    renderPartsList()
    expect(screen.getByText('Teclado')).toBeInTheDocument()
    expect(screen.getByText('Mouse')).toBeInTheDocument()
  })

  it('exibe estoque baixo para Mouse (1 <= 3)', () => {
    renderPartsList()
    const lowStock = screen.getAllByText('Estoque baixo')
    expect(lowStock.length).toBeGreaterThanOrEqual(1)
  })

  it('exibe skeleton durante loading', () => {
    ;(useParts as any).mockReturnValue({ parts: [], loading: true, create: vi.fn(), update: vi.fn(), remove: vi.fn(), reload: vi.fn() })
    renderPartsList()
    expect(screen.getAllByTestId('skeleton').length).toBe(5)
  })

  it('exibe empty state quando vazio', () => {
    ;(useParts as any).mockReturnValue({ parts: [], loading: false, create: vi.fn(), update: vi.fn(), remove: vi.fn(), reload: vi.fn() })
    renderPartsList()
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('abre formulário ao clicar "+ Nova Peça"', () => {
    renderPartsList()
    fireEvent.click(screen.getByText('+ Nova Peça'))
    expect(screen.getByText('Adicionar ao Estoque')).toBeInTheDocument()
  })

  it('abre formulário de edição ao clicar "Editar"', () => {
    renderPartsList()
    const editBtns = screen.getAllByText('Editar')
    fireEvent.click(editBtns[0])
    expect(screen.getByText('Editar Peça')).toBeInTheDocument()
  })

  it('exibe botões de ajuste de quantidade', () => {
    renderPartsList()
    const minusBtns = screen.getAllByText('−')
    const plusBtns = screen.getAllByText('+')
    expect(minusBtns.length).toBeGreaterThanOrEqual(1)
    expect(plusBtns.length).toBeGreaterThanOrEqual(1)
  })

  it('exibe abas "Uso" para cada peça', () => {
    renderPartsList()
    const usageBtns = screen.getAllByText('Uso')
    expect(usageBtns.length).toBeGreaterThanOrEqual(1)
  })

  it('exibe "Nenhum PC utilizou esta peça" no painel de uso', () => {
    renderPartsList()
    const usageBtns = screen.getAllByText('Uso')
    fireEvent.click(usageBtns[0])
    expect(screen.getByText('Nenhum PC utilizou esta peça ainda.')).toBeInTheDocument()
  })
})
