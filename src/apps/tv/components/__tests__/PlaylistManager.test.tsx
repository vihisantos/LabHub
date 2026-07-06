import { type ReactElement } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PlaylistManager } from '../PlaylistManager'
import { TooltipProvider } from '../../../../lib/components/ui'
import type { TvPlaylist } from '../../types'

function makePlaylist(overrides: Partial<TvPlaylist> = {}): TvPlaylist {
  return {
    id: 'pl-1',
    name: 'Playlist Teste',
    source: 'youtube',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    duration_seconds: 30,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderWithTooltip(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

describe('PlaylistManager', () => {
  it('renderiza título "Playlists"', () => {
    renderWithTooltip(<PlaylistManager playlists={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Playlists de Vídeo')).toBeInTheDocument()
  })

  it('renderiza mensagem de vazio quando não há playlists', () => {
    renderWithTooltip(<PlaylistManager playlists={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Nenhuma playlist cadastrada')).toBeInTheDocument()
  })

  it('renderiza lista de playlists', () => {
    const playlists = [
      makePlaylist({ name: 'Vídeos Aula' }),
      makePlaylist({ id: 'pl-2', name: 'Músicas' }),
    ]
    renderWithTooltip(<PlaylistManager playlists={playlists} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('Vídeos Aula')).toBeInTheDocument()
    expect(screen.getByText('Músicas')).toBeInTheDocument()
  })

  it('renderiza source e duração da playlist', () => {
    const playlists = [makePlaylist({ source: 'youtube', duration_seconds: 45 })]
    renderWithTooltip(<PlaylistManager playlists={playlists} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText(/YouTube · 45s/)).toBeInTheDocument()
  })

  it('abre formulário ao clicar em "Nova Playlist"', () => {
    renderWithTooltip(<PlaylistManager playlists={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Nova Playlist/ }))
    expect(screen.getByPlaceholderText('Nome')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/URL do YouTube/)).toBeInTheDocument()
  })

  it('abre formulário com opção de upload para Cloudinary', () => {
    renderWithTooltip(<PlaylistManager playlists={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Nova Playlist/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Upload de Vídeo' }))
    expect(screen.getByText(/Upload/)).toBeInTheDocument()
  })

  it('chama onAdd ao submeter nova playlist com URL válida', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderWithTooltip(<PlaylistManager playlists={[]} onAdd={onAdd} onEdit={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Nova Playlist/ }))
    fireEvent.change(screen.getByPlaceholderText('Nome'), { target: { value: 'Minha Playlist' } })
    fireEvent.change(screen.getByPlaceholderText(/URL do YouTube/), {
      target: { value: 'https://www.youtube.com/watch?v=test123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar playlist' }))

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Minha Playlist', source: 'youtube' })
    )
  })

  it('mostra erro para URL do YouTube inválida', () => {
    renderWithTooltip(<PlaylistManager playlists={[]} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Nova Playlist/ }))
    fireEvent.change(screen.getByPlaceholderText('Nome'), { target: { value: 'Teste' } })
    fireEvent.change(screen.getAllByPlaceholderText(/URL/)[0], {
      target: { value: 'https://google.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar playlist' }))

    expect(screen.getByText('URL do YouTube inválida')).toBeInTheDocument()
  })

  it('não submete quando nome está vazio', () => {
    const onAdd = vi.fn()
    renderWithTooltip(<PlaylistManager playlists={[]} onAdd={onAdd} onEdit={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Nova Playlist/ }))
    fireEvent.change(screen.getAllByPlaceholderText(/URL/)[0], {
      target: { value: 'https://www.youtube.com/watch?v=test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar playlist' }))

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('chama onDelete ao clicar no botão de deletar', () => {
    const onDelete = vi.fn()
    const playlists = [makePlaylist({ id: 'pl-1' })]
    const { container } = renderWithTooltip(
      <PlaylistManager playlists={playlists} onAdd={vi.fn()} onEdit={vi.fn()} onDelete={onDelete} />
    )

    const trashIcon = container.querySelector('.lucide-trash-2')
    const deleteBtn = trashIcon?.closest('button')
    expect(deleteBtn).toBeDefined()
    fireEvent.click(deleteBtn!)

    const confirmBtn = screen.getByRole('button', { name: 'Excluir' })
    fireEvent.click(confirmBtn)
    expect(onDelete).toHaveBeenCalledWith('pl-1')
  })

  it('chama onEdit ao submeter edição de playlist', () => {
    const onEdit = vi.fn().mockResolvedValue(undefined)
    const playlists = [makePlaylist({ id: 'pl-1', name: 'Original' })]
    const { container } = renderWithTooltip(
      <PlaylistManager playlists={playlists} onAdd={vi.fn()} onEdit={onEdit} onDelete={vi.fn()} />
    )

    const pencilIcon = container.querySelector('.lucide-pencil')
    const editBtn = pencilIcon?.closest('button')
    expect(editBtn).toBeDefined()
    fireEvent.click(editBtn!)

    fireEvent.change(screen.getByPlaceholderText('Nome'), { target: { value: 'Atualizada' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))

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
    const { container } = renderWithTooltip(
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
    const { container } = renderWithTooltip(
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
