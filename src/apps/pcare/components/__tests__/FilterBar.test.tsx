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
    vi.useRealTimers()
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterBar labs={['Lab A']} onFilterChange={onChange} />)
    const [labTrigger] = screen.getAllByRole('combobox')
    await user.click(labTrigger)
    const option = await screen.findByText('Lab A')
    await user.click(option)
    expect(onChange).toHaveBeenCalledWith({ lab: 'Lab A', status: 'all' })
  })

  it('chama onFilterChange ao selecionar status', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterBar labs={['Lab A']} onFilterChange={onChange} />)
    const [, statusTrigger] = screen.getAllByRole('combobox')
    await user.click(statusTrigger)
    const option = await screen.findByText('Concluído')
    await user.click(option)
    expect(onChange).toHaveBeenCalledWith({ lab: 'all', status: 'done' })
  })
})
