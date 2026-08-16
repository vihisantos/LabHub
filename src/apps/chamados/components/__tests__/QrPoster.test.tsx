import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QrPoster } from '../QrPoster'

describe('QrPoster', () => {
  it('renderiza título, QR, passos e URL', () => {
    render(<QrPoster qrDataUrl="data:image/png;base64,AAA" url="https://labhub.app/chamados" />)

    expect(screen.getByText('Abrir Chamado')).toBeInTheDocument()
    const img = screen.getByAltText('QR Code de chamados')
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AAA')
    expect(screen.getByText('Escaneie o QR Code')).toBeInTheDocument()
    expect(screen.getByText('Escolha o campus e a sala')).toBeInTheDocument()
    expect(screen.getByText('Descreva o problema')).toBeInTheDocument()
    expect(screen.getByText('https://labhub.app/chamados')).toBeInTheDocument()
  })
})
