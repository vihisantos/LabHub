import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/helpers'
import { StockHeader } from '../StockHeader'

describe('StockHeader', () => {
  it('mostra o título da área e a identificação do Estoque', () => {
    renderWithProviders(<StockHeader title="Dashboard" />, { initialEntries: ['/stock'] })

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Estoque')).toBeInTheDocument()
  })

  it('exibe a unidade ativa quando disponível', () => {
    renderWithProviders(<StockHeader title="Materiais" unitName="Laboratório Central" />, {
      initialEntries: ['/stock/items'],
    })

    expect(screen.getByText('Estoque · Laboratório Central')).toBeInTheDocument()
  })

  it('não acrescenta a unidade quando ela não está disponível', () => {
    renderWithProviders(<StockHeader title="Materiais" unitName={null} />, {
      initialEntries: ['/stock/items'],
    })

    expect(screen.getByText('Estoque')).toBeInTheDocument()
    expect(screen.queryByText(/·/)).not.toBeInTheDocument()
  })

  it('não mostra o botão de voltar nas rotas principais', () => {
    renderWithProviders(<StockHeader title="Dashboard" />, { initialEntries: ['/stock'] })

    expect(screen.queryByRole('link', { name: 'Voltar' })).not.toBeInTheDocument()
  })

  it('mostra o botão de voltar em páginas de detalhe, apontando para o destino', () => {
    renderWithProviders(<StockHeader title="Detalhe" canGoBack backTo="/stock/items" />, {
      initialEntries: ['/stock/items/123'],
    })

    const back = screen.getByRole('link', { name: 'Voltar' })
    expect(back).toHaveAttribute('href', '/stock/items')
  })

  it('dispara a ação do título (rolar ao topo) ao clicar', () => {
    const onTitleClick = vi.fn()
    renderWithProviders(<StockHeader title="Dashboard" onTitleClick={onTitleClick} />, {
      initialEntries: ['/stock'],
    })

    fireEvent.click(screen.getByRole('button'))

    expect(onTitleClick).toHaveBeenCalledTimes(1)
  })
})
