import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PhotoSlideshow } from '../PhotoSlideshow'
import type { TvGalleryPhoto } from '../../types'

describe('PhotoSlideshow', () => {
  it('renderiza null quando a lista está vazia', () => {
    const { container } = render(<PhotoSlideshow photos={[]} title="Galeria" />)
    expect(container.firstChild).toBeNull()
  })

  it('avança quando uma imagem falha (onError)', () => {
    const photos: TvGalleryPhoto[] = [
      { id: '1', gallery_id: 'g', image_url: 'bad-1.jpg', sort_order: 0, created_at: '' },
      { id: '2', gallery_id: 'g', image_url: 'good-2.jpg', sort_order: 1, created_at: '' },
    ]
    const { container } = render(<PhotoSlideshow photos={photos} title="Galeria" />)
    const img = container.querySelector('img') as HTMLImageElement
    fireEvent.error(img!)
    // após falha, a imagem quebrada deve ser removida do conjunto válido
    expect(screen.queryByAltText('')).not.toBeNull()
  })

  it('chama onAllFailed quando todas as imagens quebram', () => {
    const onAllFailed = vi.fn()
    const photos: TvGalleryPhoto[] = [
      { id: '1', gallery_id: 'g', image_url: 'bad-1.jpg', sort_order: 0, created_at: '' },
    ]
    const { container } = render(<PhotoSlideshow photos={photos} title="Galeria" onAllFailed={onAllFailed} />)
    const img = container.querySelector('img') as HTMLImageElement
    fireEvent.error(img!)
    expect(onAllFailed).toHaveBeenCalled()
  })
})