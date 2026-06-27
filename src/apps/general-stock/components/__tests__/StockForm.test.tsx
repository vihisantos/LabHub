import { render, screen, fireEvent } from '@testing-library/react'
import { StockForm } from '../StockForm'

describe('StockForm', () => {
  it('renderiza campos do formulario', () => {
    render(<StockForm onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByPlaceholderText('Ex: Caneta azul')).toBeInTheDocument()
    expect(screen.getByText('Salvar')).toBeInTheDocument()
    expect(screen.getByText('Cancelar')).toBeInTheDocument()
  })

  it('preenche campos com initial data', () => {
    render(<StockForm onSave={vi.fn()} onCancel={vi.fn()} initial={{ name: 'Papel A4', quantity: 10 }} />)
    expect(screen.getByDisplayValue('Papel A4')).toBeInTheDocument()
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
  })

  it('chama onSave com dados ao submit', () => {
    const onSave = vi.fn()
    render(<StockForm onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Ex: Caneta azul'), { target: { value: 'Caneta' } })
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '5' } })
    fireEvent.click(screen.getByText('Salvar'))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Caneta' })
    )
  })

  it('chama onCancel ao clicar Cancelar', () => {
    const onCancel = vi.fn()
    render(<StockForm onSave={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancelar'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('nao chama onSave se nome estiver vazio', () => {
    const onSave = vi.fn()
    render(<StockForm onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByText('Salvar'))
    expect(onSave).not.toHaveBeenCalled()
  })
})
