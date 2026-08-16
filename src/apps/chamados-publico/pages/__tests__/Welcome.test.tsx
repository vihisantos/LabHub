import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../../test/helpers'

import { Welcome } from '../Welcome'

function renderWelcome() {
  return renderWithProviders(
    <Routes>
      <Route path="/chamados-publico" element={<Welcome />} />
      <Route path="/chamados-publico/new" element={<div>formulario novo</div>} />
      <Route path="/chamados-publico/scan" element={<div>escaneamento</div>} />
      <Route path="/chamados-publico/track" element={<div>acompanhar</div>} />
    </Routes>,
    { initialEntries: ['/chamados-publico'] },
  )
}

describe('Welcome', () => {
  it('renderiza as opções principais', () => {
    renderWelcome()

    expect(screen.getByText('Abrir Chamado')).toBeInTheDocument()
    expect(screen.getByText('Escanear QR Code da sala')).toBeInTheDocument()
    expect(screen.getByText('Acompanhar chamado')).toBeInTheDocument()
  })

  it('navega para o scan ao tocar em escanear', () => {
    renderWelcome()
    fireEvent.click(screen.getByText('Escanear QR Code da sala'))
    expect(screen.getByText('escaneamento')).toBeInTheDocument()
  })

  it('navega para o acompanhamento', () => {
    renderWelcome()
    fireEvent.click(screen.getByText('Acompanhar chamado'))
    expect(screen.getByText('acompanhar')).toBeInTheDocument()
  })

  it('desabilita continuar sem nome de sala', () => {
    renderWelcome()
    expect(screen.getByText('Continuar')).toBeDisabled()
  })

  it('envia nome de sala digitado', () => {
    renderWelcome()
    fireEvent.change(screen.getByPlaceholderText('Digite o nome da sala'), {
      target: { value: 'Lab 2' },
    })
    fireEvent.click(screen.getByText('Continuar'))
    expect(screen.getByText('formulario novo')).toBeInTheDocument()
  })
})
