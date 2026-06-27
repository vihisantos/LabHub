import { render, screen, fireEvent } from '@testing-library/react'
import { StockCard } from '../StockCard'
import type { GeneralItem } from '../../types'

const mockItem: GeneralItem = {
  id: 'item-1',
  name: 'Papel A4',
  category: 'papel',
  quantity: 100,
  minQuantity: 10,
  unit: 'un',
  location: 'Armário 1',
  notes: 'Comprado na loja X',
  createdAt: { seconds: 1000, nanoseconds: 0 } as any,
  updatedAt: { seconds: 1000, nanoseconds: 0 } as any,
}

describe('StockCard', () => {
  const defaultProps = {
    item: mockItem,
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onAdjust: vi.fn(),
  }

  it('renderiza nome e quantidade', () => {
    render(<StockCard {...defaultProps} />)
    expect(screen.getByText('Papel A4')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('renderiza categoria e localizacao', () => {
    render(<StockCard {...defaultProps} />)
    expect(screen.getByText('Papel')).toBeInTheDocument()
    expect(screen.getByText(/Armário 1/)).toBeInTheDocument()
  })

  it('renderiza notas', () => {
    render(<StockCard {...defaultProps} />)
    expect(screen.getByText('Comprado na loja X')).toBeInTheDocument()
  })

  it('chama onAdjust ao clicar em +', () => {
    render(<StockCard {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade' }))
    expect(defaultProps.onAdjust).toHaveBeenCalledWith('item-1', 1)
  })

  it('chama onAdjust ao clicar em -', () => {
    render(<StockCard {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir quantidade' }))
    expect(defaultProps.onAdjust).toHaveBeenCalledWith('item-1', -1)
  })

  it('chama onEdit ao clicar em Editar', () => {
    render(<StockCard {...defaultProps} />)
    fireEvent.click(screen.getByText('Editar'))
    expect(defaultProps.onEdit).toHaveBeenCalledWith(mockItem)
  })

  it('mostra texto "Sem estoque" quando quantity=0', () => {
    const empty: GeneralItem = { ...mockItem, quantity: 0 }
    render(<StockCard {...defaultProps} item={empty} />)
    expect(screen.getByText('Sem estoque')).toBeInTheDocument()
  })

  it('mostra texto "Abaixo do mínimo" quando abaixo do minimo', () => {
    const low: GeneralItem = { ...mockItem, quantity: 5, minQuantity: 10 }
    render(<StockCard {...defaultProps} item={low} />)
    expect(screen.getByText('Abaixo do mínimo')).toBeInTheDocument()
  })
})
