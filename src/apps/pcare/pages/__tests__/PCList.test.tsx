import { screen, fireEvent } from '@testing-library/react'
import { PCList } from '../PCList'
import { renderWithProviders, seedLocalStorage, makePC } from '../../../../test/helpers'

describe('PCList', () => {
  it('renderiza ativos carregados', () => {
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001', assetTag: 'TAG-001', cleaningStatus: 'done' }),
      makePC({ id: 'pc-2', labName: 'Lab B', pcNumber: 'PC-002', assetTag: 'TAG-002', cleaningStatus: 'pending' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pc-care/pcs'] })

    expect(screen.getByText('TAG-001')).toBeInTheDocument()
    expect(screen.getByText('TAG-002')).toBeInTheDocument()
    expect(screen.getByText('Ativos')).toBeInTheDocument()
  })

  it('filtra por busca', () => {
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001', assetTag: 'TAG-001' }),
      makePC({ id: 'pc-2', labName: 'Lab B', pcNumber: 'PC-002', assetTag: 'TAG-002' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pc-care/pcs'] })

    const search = screen.getByPlaceholderText(/Buscar/)
    fireEvent.change(search, { target: { value: 'TAG-002' } })

    expect(screen.getByText('TAG-002')).toBeInTheDocument()
    expect(screen.queryByText('TAG-001')).not.toBeInTheDocument()
  })

  it('mostra empty state quando nenhum ativo encontrado na busca', () => {
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pc-care/pcs'] })

    const search = screen.getByPlaceholderText(/Buscar/)
    fireEvent.change(search, { target: { value: 'inexistente' } })

    expect(screen.getByText('Nenhum ativo encontrado')).toBeInTheDocument()
  })

  it('mostra empty state quando nao ha ativos', () => {
    renderWithProviders(<PCList />, { initialEntries: ['/pc-care/pcs'] })

    expect(screen.getByText('Nenhum ativo encontrado')).toBeInTheDocument()
  })

  it('botao novo ativo funciona', () => {
    seedLocalStorage('pcs', [
      makePC({ id: 'pc-1', labName: 'Lab A', pcNumber: 'PC-001' }),
    ])
    renderWithProviders(<PCList />, { initialEntries: ['/pc-care/pcs'] })

    expect(screen.getByText('+ Novo ativo')).toBeInTheDocument()
  })
})
