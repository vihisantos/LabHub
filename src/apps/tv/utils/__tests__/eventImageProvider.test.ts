import { describe, it, expect } from 'vitest'
import { getSafeEventImageUrl, SAFE_IMAGE_PRESETS } from '../eventImageProvider'

describe('eventImageProvider', () => {
  it('retorna imagem neutra acadêmica (padrão) quando o evento não é especial', () => {
    const url = getSafeEventImageUrl('Matemática')
    expect(url).toMatch(/^https:\/\/images\.unsplash\.com\/photo-/)
    expect(SAFE_IMAGE_PRESETS.academico).toContain(url)
  })

  it('detecta provas pela palavra "prova"', () => {
    const url = getSafeEventImageUrl('Prova de Cálculo')
    expect(url).toMatch(/^https:\/\/images\.unsplash\.com\/photo-/)
    expect(SAFE_IMAGE_PRESETS.provas).toContain(url)
  })

  it('usa imagem customizada quando fornecida', () => {
    const url = getSafeEventImageUrl('Evento', null, 'https://example.com/img.jpg')
    expect(url).toBe('https://example.com/img.jpg')
  })

  it('é determinístico para o mesmo título', () => {
    const a = getSafeEventImageUrl('Química Orgânica')
    const b = getSafeEventImageUrl('Química Orgânica')
    expect(a).toBe(b)
  })

  it('nunca usa imagem de festa/evento para eventos genéricos acadêmicos', () => {
    const url = getSafeEventImageUrl('Álgebra Linear')
    expect(SAFE_IMAGE_PRESETS.geral).not.toContain(url)
  })
})