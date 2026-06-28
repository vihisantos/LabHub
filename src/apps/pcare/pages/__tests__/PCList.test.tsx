import { screen, fireEvent } from '@testing-library/react'
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
    expect(screen.getByText('Adicionar PC')).toBeInTheDocument()
  })

  it('filtra por laboratorio', () => {
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001' }),
      makePC({ id: 'pc-2', labName: 'Lab B', pcNumber: 'PC-002' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pcare/pcs'] })

    const labSelect = screen.getByDisplayValue('Todos os laboratórios')
    fireEvent.change(labSelect, { target: { value: 'Lab A' } })

    expect(screen.getByText(/PC-001/)).toBeInTheDocument()
    expect(screen.queryByText(/PC-002/)).not.toBeInTheDocument()
  })

  it('filtra por status', () => {
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', cleaningStatus: 'done', pcNumber: 'PC-001' }),
      makePC({ id: 'pc-2', cleaningStatus: 'pending', pcNumber: 'PC-002' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pcare/pcs'] })

    const statusSelect = screen.getByDisplayValue('Todos os status')
    fireEvent.change(statusSelect, { target: { value: 'done' } })

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
