import { render, screen, fireEvent } from '@testing-library/react'
import { FilterBar } from '../FilterBar'

describe('FilterBar', () => {
  it('renderiza selects com opcoes', () => {
    const onChange = vi.fn()
    render(<FilterBar labs={['Lab A', 'Lab B']} onFilterChange={onChange} />)
    expect(screen.getByText('Todos os laboratórios')).toBeInTheDocument()
    expect(screen.getByText('Lab A')).toBeInTheDocument()
    expect(screen.getByText('Lab B')).toBeInTheDocument()
    expect(screen.getByText('Todos os status')).toBeInTheDocument()
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    expect(screen.getByText('Em andamento')).toBeInTheDocument()
    expect(screen.getByText('Concluído')).toBeInTheDocument()
  })

  it('chama onFilterChange ao selecionar laboratorio', () => {
    const onChange = vi.fn()
    render(<FilterBar labs={['Lab A']} onFilterChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('Todos os laboratórios'), { target: { value: 'Lab A' } })
    expect(onChange).toHaveBeenCalledWith({ lab: 'Lab A', status: 'all' })
  })

  it('chama onFilterChange ao selecionar status', () => {
    const onChange = vi.fn()
    render(<FilterBar labs={['Lab A']} onFilterChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('Todos os status'), { target: { value: 'done' } })
    expect(onChange).toHaveBeenCalledWith({ lab: '', status: 'done' })
  })
})
