import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { PlaylistManager } from '../PlaylistManager'
import type { TvPlaylist } from '../../types'

function makePlaylist(overrides: Partial<TvPlaylist> = {}): TvPlaylist {
  return {
    id: 'pl-1',
    name: 'Playlist Teste',
    type: 'video',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration_seconds: 30,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('PlaylistManager', () => {
  it('renderiza título "Playlists"', () => {
    render(<PlaylistManager playlists={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Playlists')).toBeInTheDocument()
  })

  it('renderiza mensagem de vazio quando não há playlists', () => {
    render(<PlaylistManager playlists={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Nenhuma playlist cadastrada')).toBeInTheDocument()
  })

  it('renderiza lista de playlists', () => {
    const playlists = [
      makePlaylist({ name: 'Vídeos Aula' }),
      makePlaylist({ id: 'pl-2', name: 'Músicas' }),
    ]
    render(<PlaylistManager playlists={playlists} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Vídeos Aula')).toBeInTheDocument()
    expect(screen.getByText('Músicas')).toBeInTheDocument()
  })

  it('renderiza tipo e duração da playlist', () => {
    const playlists = [makePlaylist({ type: 'video', duration_seconds: 45 })]
    render(<PlaylistManager playlists={playlists} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText(/Vídeo/)).toBeInTheDocument()
    expect(screen.getByText(/45s/)).toBeInTheDocument()
  })

  it('renderiza tipo música corretamente', () => {
    const playlists = [makePlaylist({ type: 'music' })]
    render(<PlaylistManager playlists={playlists} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText(/Música/)).toBeInTheDocument()
  })

  it('abre formulário ao clicar em "Nova Playlist"', () => {
    render(<PlaylistManager playlists={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Nova Playlist/ }))
    expect(screen.getByPlaceholderText('Nome')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/URL do YouTube/)).toBeInTheDocument()
  })

  it('chama onAdd ao submeter nova playlist com URL válida', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<PlaylistManager playlists={[]} onAdd={onAdd} onEdit={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Nova Playlist/ }))
    fireEvent.change(screen.getByPlaceholderText('Nome'), { target: { value: 'Minha Playlist' } })
    fireEvent.change(screen.getByPlaceholderText(/URL do YouTube/), {
      target: { value: 'https://www.youtube.com/watch?v=test123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Minha Playlist', type: 'video' })
    )
  })

  it('mostra erro para URL do YouTube inválida', () => {
    render(<PlaylistManager playlists={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Nova Playlist/ }))
    fireEvent.change(screen.getByPlaceholderText('Nome'), { target: { value: 'Teste' } })
    fireEvent.change(screen.getByPlaceholderText(/URL do YouTube/), {
      target: { value: 'https://google.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))

    expect(screen.getByText('URL do YouTube inválida')).toBeInTheDocument()
  })

  it('não submete quando nome está vazio', () => {
    const onAdd = vi.fn()
    render(<PlaylistManager playlists={[]} onAdd={onAdd} onEdit={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Nova Playlist/ }))
    fireEvent.change(screen.getByPlaceholderText(/URL do YouTube/), {
      target: { value: 'https://www.youtube.com/watch?v=test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('permite alternar tipo para música', () => {
    render(<PlaylistManager playlists={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Nova Playlist/ }))

    const musicBtn = screen.getByRole('button', { name: /Música/ })
    fireEvent.click(musicBtn)
    expect(musicBtn).toHaveStyle({ fontWeight: 600 })
  })

  it('chama onDelete ao clicar no botão de deletar', () => {
    const onDelete = vi.fn()
    const playlists = [makePlaylist({ id: 'pl-1' })]
    const { container } = render(
      <PlaylistManager playlists={playlists} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={onDelete} />
    )

    const trashIcon = container.querySelector('.lucide-trash2')
    const deleteBtn = trashIcon?.closest('button')
    expect(deleteBtn).toBeDefined()
    fireEvent.click(deleteBtn!)
    expect(onDelete).toHaveBeenCalledWith('pl-1')
  })

  it('chama onEdit ao submeter edição de playlist', () => {
    const onEdit = vi.fn().mockResolvedValue(undefined)
    const playlists = [makePlaylist({ id: 'pl-1', name: 'Original' })]
    const { container } = render(
      <PlaylistManager playlists={playlists} onAdd={vi.fn()} onEdit={onEdit} onDelete={vi.fn()} />
    )

    const pencilIcon = container.querySelector('.lucide-pencil')
    const editBtn = pencilIcon?.closest('button')
    expect(editBtn).toBeDefined()
    fireEvent.click(editBtn!)

    fireEvent.change(screen.getByPlaceholderText('Nome'), { target: { value: 'Atualizada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(onEdit).toHaveBeenCalledWith(
      'pl-1',
      expect.objectContaining({ name: 'Atualizada' })
    )
  })

  it('move playlist para cima', async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined)
    const playlists = [
      makePlaylist({ id: 'pl-1', name: 'A', sort_order: 0 }),
      makePlaylist({ id: 'pl-2', name: 'B', sort_order: 1 }),
    ]
    const { container } = render(
      <PlaylistManager playlists={playlists} onAdd={vi.fn()} onEdit={onEdit} onDelete={vi.fn()} />
    )

    const upIcons = container.querySelectorAll('.lucide-chevron-up')
    const secondUpBtn = upIcons[1]?.closest('button')
    expect(secondUpBtn).toBeDefined()

    await act(async () => {
      fireEvent.click(secondUpBtn!)
    })

    expect(onEdit).toHaveBeenCalledWith('pl-2', { sort_order: 0 })
    expect(onEdit).toHaveBeenCalledWith('pl-1', { sort_order: 1 })
  })

  it('move playlist para baixo', async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined)
    const playlists = [
      makePlaylist({ id: 'pl-1', name: 'A', sort_order: 0 }),
      makePlaylist({ id: 'pl-2', name: 'B', sort_order: 1 }),
    ]
    const { container } = render(
      <PlaylistManager playlists={playlists} onAdd={vi.fn()} onEdit={onEdit} onDelete={vi.fn()} />
    )

    const downIcons = container.querySelectorAll('.lucide-chevron-down')
    const firstDownBtn = downIcons[0]?.closest('button')
    expect(firstDownBtn).toBeDefined()

    await act(async () => {
      fireEvent.click(firstDownBtn!)
    })

    expect(onEdit).toHaveBeenCalledWith('pl-1', { sort_order: 1 })
    expect(onEdit).toHaveBeenCalledWith('pl-2', { sort_order: 0 })
  })
})
