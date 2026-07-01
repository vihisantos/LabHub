import { parseYouTubeUrl } from '../youtubeUtils'

describe('parseYouTubeUrl', () => {
  describe('vídeos', () => {
    it('extrai videoId de URL youtube.com com parâmetro v', () => {
      const result = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(result).toEqual({ type: 'video', videoId: 'dQw4w9WgXcQ' })
    })

    it('extrai videoId de URL youtu.be (curta)', () => {
      const result = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')
      expect(result).toEqual({ type: 'video', videoId: 'dQw4w9WgXcQ' })
    })

    it('extrai videoId de URL m.youtube.com', () => {
      const result = parseYouTubeUrl('https://m.youtube.com/watch?v=abc123')
      expect(result).toEqual({ type: 'video', videoId: 'abc123' })
    })

    it('extrai videoId de URL sem www', () => {
      const result = parseYouTubeUrl('https://youtube.com/watch?v=xyz789')
      expect(result).toEqual({ type: 'video', videoId: 'xyz789' })
    })
  })

  describe('playlists', () => {
    it('extrai playlistId de URL com list e v', () => {
      const result = parseYouTubeUrl('https://www.youtube.com/watch?v=abc123&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')
      expect(result).toEqual({
        type: 'playlist',
        videoId: 'abc123',
        playlistId: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf',
      })
    })

    it('extrai playlistId de URL com apenas list', () => {
      const result = parseYouTubeUrl('https://www.youtube.com/watch?v=abc123&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')
      expect(result?.type).toBe('playlist')
      expect(result?.playlistId).toBe('PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')
    })

    it('extrai playlistId de URL com listType=playlist', () => {
      const result = parseYouTubeUrl('https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')
      expect(result).toEqual({
        type: 'playlist',
        playlistId: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf',
      })
    })
  })

  describe('URLs inválidas', () => {
    it('retorna null para URL vazia', () => {
      expect(parseYouTubeUrl('')).toBeNull()
    })

    it('retorna null para URL que não é do YouTube', () => {
      expect(parseYouTubeUrl('https://www.google.com')).toBeNull()
    })

    it('retorna null para string que não é URL', () => {
      expect(parseYouTubeUrl('not-a-url')).toBeNull()
    })

    it('retorna null para URL do YouTube sem parâmetros', () => {
      expect(parseYouTubeUrl('https://www.youtube.com')).toBeNull()
    })

    it('retorna null para youtu.be sem path', () => {
      expect(parseYouTubeUrl('https://youtu.be/')).toBeNull()
    })

    it('retorna null para URL com v vazio', () => {
      expect(parseYouTubeUrl('https://www.youtube.com/watch?v=')).toBeNull()
    })
  })

  describe('formatação de URL', () => {
    it('aceita URL com http://', () => {
      const result = parseYouTubeUrl('http://www.youtube.com/watch?v=test123')
      expect(result).toEqual({ type: 'video', videoId: 'test123' })
    })

    it('aceita URL com parâmetros extras', () => {
      const result = parseYouTubeUrl('https://www.youtube.com/watch?v=abc123&list=PLtest&index=1&pp=iAQB')
      expect(result).toEqual({
        type: 'playlist',
        videoId: 'abc123',
        playlistId: 'PLtest',
      })
    })

    it('extrai videoId de youtu.be com timestamp', () => {
      const result = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=30')
      expect(result).toEqual({ type: 'video', videoId: 'dQw4w9WgXcQ' })
    })
  })
})
