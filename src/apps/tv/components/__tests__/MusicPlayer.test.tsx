import { render, screen } from '@testing-library/react'
import { MusicPlayer } from '../MusicPlayer'

describe('MusicPlayer', () => {
  it('renderiza versão completa com texto "Tocando música..."', () => {
    render(<MusicPlayer />)
    expect(screen.getByText('Tocando música...')).toBeInTheDocument()
  })

  it('renderiza ícone de música na versão completa', () => {
    const { container } = render(<MusicPlayer />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('renderiza barras de equalizer na versão completa', () => {
    const { container } = render(<MusicPlayer />)
    const bars = container.querySelectorAll('div[style*="equalizer"]')
    expect(bars.length).toBe(10)
  })

  it('renderiza versão compacta com label "Música"', () => {
    render(<MusicPlayer compact />)
    expect(screen.getByText('Música')).toBeInTheDocument()
  })

  it('renderiza barras de equalizer na versão compacta', () => {
    const { container } = render(<MusicPlayer compact />)
    const bars = container.querySelectorAll('div[style*="equalizer"]')
    expect(bars.length).toBe(7)
  })

  it('não renderiza "Tocando música..." na versão compacta', () => {
    render(<MusicPlayer compact />)
    expect(screen.queryByText('Tocando música...')).not.toBeInTheDocument()
  })
})
