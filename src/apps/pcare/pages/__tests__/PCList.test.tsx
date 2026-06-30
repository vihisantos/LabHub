import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PCList } from '../PCList'
import { renderWithProviders, seedLocalStorage, makePC } from '../../../../test/helpers'

describe('PCList', () => {
  it('renderiza PCs carregados', () => {
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001', cleaningStatus: 'done' }),
      makePC({ id: 'pc-2', labName: 'Lab B', pcNumber: 'PC-002', cleaningStatus: 'pending' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pcare/pcs'] })

    expect(screen.getByText(/PC-001/)).toBeInTheDocument()
    expect(screen.getByText(/PC-002/)).toBeInTheDocument()
    expect(screen.getByText('Computadores')).toBeInTheDocument()
  })

  it('filtra por busca', () => {
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001' }),
      makePC({ id: 'pc-2', labName: 'Lab B', pcNumber: 'PC-002' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pcare/pcs'] })

    const search = screen.getByPlaceholderText('Buscar por laboratório, PC ou sala...')
    fireEvent.change(search, { target: { value: 'PC-002' } })

    expect(screen.getByText(/PC-002/)).toBeInTheDocument()
    expect(screen.queryByText(/PC-001/)).not.toBeInTheDocument()
  })

  it('mostra empty state quando nenhum PC encontrado na busca', () => {
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pcare/pcs'] })

    const search = screen.getByPlaceholderText('Buscar por laboratório, PC ou sala...')
    fireEvent.change(search, { target: { value: 'inexistente' } })

    expect(screen.getByText('Nenhum PC encontrado')).toBeInTheDocument()
  })

  it('mostra empty state quando nao ha PCs', () => {
    renderWithProviders(<PCList />, { initialEntries: ['/pcare/pcs'] })

    expect(screen.getByText('Nenhum PC encontrado')).toBeInTheDocument()
  })

  it('filtra por laboratorio', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001' }),
      makePC({ id: 'pc-2', labName: 'Lab B', pcNumber: 'PC-002' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pcare/pcs'] })

    const [labTrigger] = screen.getAllByRole('combobox')
    await user.click(labTrigger)
    const labOption = await screen.findByText('Lab A')
    await user.click(labOption)

    expect(screen.getByText(/PC-001/)).toBeInTheDocument()
    expect(screen.queryByText(/PC-002/)).not.toBeInTheDocument()
  })

  it('filtra por status', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', cleaningStatus: 'done', pcNumber: 'PC-001' }),
      makePC({ id: 'pc-2', cleaningStatus: 'pending', pcNumber: 'PC-002' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pcare/pcs'] })

    const [, statusTrigger] = screen.getAllByRole('combobox')
    await user.click(statusTrigger)
    const doneOption = await screen.findByRole('option', { name: 'Concluído' })
    await user.click(doneOption)

    expect(screen.getByText(/PC-001/)).toBeInTheDocument()
    expect(screen.queryByText(/PC-002/)).not.toBeInTheDocument()
  })

  it('alterna modo de selecao', () => {
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001' }),
      makePC({ id: 'pc-2', labName: 'Lab B', pcNumber: 'PC-002' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pcare/pcs'] })

    fireEvent.click(screen.getByText('Selecionar'))
    expect(screen.getByText('Cancelar')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.getByText('Selecionar')).toBeInTheDocument()
  })
})
