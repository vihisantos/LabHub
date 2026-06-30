import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterBar } from '../FilterBar'

describe('FilterBar', () => {
  it('renderiza selects com opcoes', () => {
    const onChange = vi.fn()
    render(<FilterBar labs={['Lab A', 'Lab B']} onFilterChange={onChange} />)
    expect(screen.getByText('Todos os laboratórios')).toBeInTheDocument()
    expect(screen.getByText('Todos os status')).toBeInTheDocument()
  })

  it('chama onFilterChange ao selecionar laboratorio', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterBar labs={['Lab A']} onFilterChange={onChange} />)
    const trigger = screen.getByText('Todos os laboratórios')
    await user.click(trigger)
    const option = screen.getByText('Lab A')
    await user.click(option)
    expect(onChange).toHaveBeenCalledWith({ lab: 'Lab A', status: 'all' })
  })

  it('chama onFilterChange ao selecionar status', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterBar labs={['Lab A']} onFilterChange={onChange} />)
    const trigger = screen.getByText('Todos os status')
    await user.click(trigger)
    const option = screen.getByText('Concluído')
    await user.click(option)
    expect(onChange).toHaveBeenCalledWith({ lab: 'all', status: 'done' })
  })
})
