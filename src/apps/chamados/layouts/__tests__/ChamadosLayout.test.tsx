import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../../test/helpers'

vi.mock('../../../lib/useOnlineSync', () => ({ useOnlineSync: vi.fn() }))
vi.mock('../../../lib/useFastSync', () => ({ useFastSync: vi.fn() }))
vi.mock('../../components/ChamadosBottomNav', () => ({ ChamadosBottomNav: () => <div>nav</div> }))
vi.mock('../../hooks/useTickets', () => ({
  useTickets: () => ({ tickets: [], loading: false, syncing: false, reload: vi.fn() }),
}))

import { ChamadosLayout } from '../ChamadosLayout'

function renderLayout(path: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<ChamadosLayout />}>
        <Route path="/chamados" element={<div>dashboard</div>} />
        <Route path="/chamados/tickets" element={<div>tickets</div>} />
        <Route path="/chamados/tickets/:id" element={<div>detalhe</div>} />
        <Route path="/chamados/reports" element={<div>reports</div>} />
        <Route path="/chamados/settings" element={<div>settings</div>} />
      </Route>
    </Routes>,
    { initialEntries: [path] },
  )
}

describe('ChamadosLayout', () => {
  it('mostra o título correspondente à rota', () => {
    renderLayout('/chamados/tickets')
    expect(screen.getByRole('heading', { level: 1, name: 'Chamados' })).toBeInTheDocument()
    expect(screen.getByText('tickets')).toBeInTheDocument()
  })

  it('usa título do dashboard na raiz /chamados', () => {
    renderLayout('/chamados')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('usa título de relatórios e configurações', () => {
    const { unmount } = renderLayout('/chamados/reports')
    expect(screen.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeInTheDocument()
    unmount()
    renderLayout('/chamados/settings')
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
  })

  it('mostra botão voltar apenas em páginas de detalhe', () => {
    renderLayout('/chamados/tickets/t-1')
    expect(screen.getByLabelText('Voltar')).toBeInTheDocument()
  })

  it('sem botão voltar em listagens', () => {
    renderLayout('/chamados/tickets')
    expect(screen.queryByLabelText('Voltar')).not.toBeInTheDocument()
  })

  it('alterna silenciamento de alertas sonoros', () => {
    renderLayout('/chamados')
    const toggle = screen.getByLabelText('Silenciar alertas sonoros')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Ativar alertas sonoros')).toBeInTheDocument()
  })

  it('botão de alternar tema presente', () => {
    renderLayout('/chamados')
    expect(screen.getByLabelText('Alternar tema')).toBeInTheDocument()
  })
})
