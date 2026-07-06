import { render, screen } from '@testing-library/react'
import { VideoPlayer } from '../VideoPlayer'

vi.mock('react-youtube', () => ({
  default: function MockYouTube({ videoId, className, onReady, onError }: any) {
    return (
      <div data-testid="youtube-iframe" data-video-id={videoId} className={className}>
        <button data-testid="mock-ready" onClick={() => onReady?.({ target: { playVideo: vi.fn(), pauseVideo: vi.fn() } })}>
          Ready
        </button>
        <button data-testid="mock-error" onClick={() => onError?.({ data: 100 })}>
          Error
        </button>
      </div>
    )
  },
}))

describe('VideoPlayer (YouTube)', () => {
  it('renderiza URL inválida quando URL não é do YouTube', () => {
    render(<VideoPlayer url="https://google.com" source="youtube" />)
    expect(screen.getByText('URL inválida')).toBeInTheDocument()
  })

  it('renderiza URL inválida para string vazia', () => {
    render(<VideoPlayer url="" source="youtube" />)
    expect(screen.getByText('URL inválida')).toBeInTheDocument()
  })

  it('renderiza URL inválida para string que não é URL', () => {
    render(<VideoPlayer url="not-a-url" source="youtube" />)
    expect(screen.getByText('URL inválida')).toBeInTheDocument()
  })

  it('renderiza player do YouTube para URL válida', () => {
    render(<VideoPlayer url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" source="youtube" />)
    expect(screen.getByTestId('youtube-iframe')).toBeInTheDocument()
    expect(screen.getByTestId('youtube-iframe')).toHaveAttribute('data-video-id', 'dQw4w9WgXcQ')
  })

  it('aceita URL youtu.be curta', () => {
    render(<VideoPlayer url="https://youtu.be/dQw4w9WgXcQ" source="youtube" />)
    expect(screen.getByTestId('youtube-iframe')).toHaveAttribute('data-video-id', 'dQw4w9WgXcQ')
  })

  it('aceita URL de playlist', () => {
    render(<VideoPlayer url="https://www.youtube.com/playlist?list=PLtest123" source="youtube" />)
    expect(screen.getByTestId('youtube-iframe')).toBeInTheDocument()
  })

  it('aplica className personalizada', () => {
    render(<VideoPlayer url="https://www.youtube.com/watch?v=test" source="youtube" className="custom-class" />)
    expect(screen.getByTestId('youtube-iframe')).toHaveClass('custom-class')
  })
})
