import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../../test/helpers'

import { PublicLayout } from '../PublicLayout'

function renderLayout(path: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/chamados-publico" element={<div>inicio</div>} />
        <Route path="/chamados-publico/new" element={<div>formulario</div>} />
      </Route>
    </Routes>,
    { initialEntries: [path] },
  )
}

describe('PublicLayout', () => {
  it('na raiz não mostra o cabeçalho de voltar', () => {
    renderLayout('/chamados-publico')
    expect(screen.getByText('inicio')).toBeInTheDocument()
    expect(screen.queryByLabelText('Voltar')).not.toBeInTheDocument()
  })

  it('em subpáginas mostra o botão voltar e o título', () => {
    renderLayout('/chamados-publico/new')
    expect(screen.getByLabelText('Voltar')).toBeInTheDocument()
    expect(screen.getByText('Abrir Chamado')).toBeInTheDocument()
    expect(screen.getByText('formulario')).toBeInTheDocument()
  })
})
