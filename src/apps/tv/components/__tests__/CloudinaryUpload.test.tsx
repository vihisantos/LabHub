import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CloudinaryUpload } from '../CloudinaryUpload'

describe('CloudinaryUpload', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ secure_url: 'https://res.cloudinary.com/test.jpg' }),
      ok: true,
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renderiza botão Upload', () => {
    render(<CloudinaryUpload onUpload={vi.fn()} />)
    expect(screen.getByText('Upload')).toBeInTheDocument()
  })

  it('renderiza input de arquivo oculto com accept image/*', () => {
    const { container } = render(<CloudinaryUpload onUpload={vi.fn()} />)
    const input = container.querySelector('input[type="file"]')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('accept', 'image/*')
  })

  it('abre seletor de arquivo ao clicar no botão', () => {
    const { container } = render(<CloudinaryUpload onUpload={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByText('Upload'))
    expect(clickSpy).toHaveBeenCalled()
  })

  it('chama endpoint image/upload ao selecionar imagem', async () => {
    const { container } = render(<CloudinaryUpload onUpload={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    const file = new File(['(binary)'], 'test.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.cloudinary.com/v1_1/horytsxg/image/upload',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('chama onUpload com URL segura ao enviar com sucesso', async () => {
    const onUpload = vi.fn()
    const { container } = render(<CloudinaryUpload onUpload={onUpload} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    const file = new File(['(binary)'], 'test.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith('https://res.cloudinary.com/test.jpg')
    })
  })

  it('mostra estado Enviando... durante upload', async () => {
    let resolveFetch!: (v: any) => void
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((r) => { resolveFetch = r }) as Promise<Response>)

    const { container } = render(<CloudinaryUpload onUpload={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    const file = new File(['(binary)'], 'test.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await screen.findByText('Enviando...')
    expect(screen.getByText('Enviando...')).toBeInTheDocument()

    resolveFetch({ json: async () => ({ secure_url: 'https://test.jpg' }), ok: true })
  })

  it('mostra estado Enviado após sucesso', async () => {
    const { container } = render(<CloudinaryUpload onUpload={vi.fn()} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    const file = new File(['(binary)'], 'test.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('Enviado')).toBeInTheDocument()
    })
  })

  it('não chama onUpload quando fetch retorna sem secure_url', async () => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ error: 'invalid' }),
      ok: true,
    } as Response)

    const onUpload = vi.fn()
    const { container } = render(<CloudinaryUpload onUpload={onUpload} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    const file = new File(['(binary)'], 'test.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    })
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('renderiza botão Upload Vídeo quando resourceType=video', () => {
    render(<CloudinaryUpload onUpload={vi.fn()} resourceType="video" />)
    expect(screen.getByText('Upload Vídeo')).toBeInTheDocument()
  })

  it('renderiza input com accept video/* quando resourceType=video', () => {
    const { container } = render(<CloudinaryUpload onUpload={vi.fn()} resourceType="video" />)
    const input = container.querySelector('input[type="file"]')
    expect(input).toHaveAttribute('accept', 'video/*')
  })

  it('chama endpoint video/upload ao selecionar vídeo', async () => {
    const { container } = render(<CloudinaryUpload onUpload={vi.fn()} resourceType="video" />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    const file = new File(['(binary)'], 'test.mp4', { type: 'video/mp4' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.cloudinary.com/v1_1/horytsxg/video/upload',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})
