import { describe, expect, it } from 'vitest'
import {
  discoverWeatherVideos,
  weatherVideoKeyFromName,
  weatherVisual,
} from '../weatherPresentation'
import { discoverLocalStructure, libraryFingerprint } from '../localProgramming'

describe('weatherPresentation — mapeamento Open-Meteo', () => {
  it('cobre todos os códigos de precipitação e usa variante noturna', () => {
    const cases: Array<[number, string, string | null]> = [
      [0, 'ensolarado', 'ensolarado-noite'],
      [1, 'ensolarado', 'ensolarado-noite'],
      [2, 'parcialmente-nublado', 'parcialmente-nublado-noite'],
      [3, 'nublado', 'nublado-noite'],
      [45, 'neblina', 'neblina-noite'],
      [48, 'neblina', 'neblina-noite'],
      [51, 'garoa', 'garoa-noite'],
      [53, 'garoa', 'garoa-noite'],
      [55, 'garoa', 'garoa-noite'],
      [61, 'chuva', 'chuva-noite'],
      [63, 'chuva', 'chuva-noite'],
      [80, 'chuva', 'chuva-noite'],
      [81, 'chuva', 'chuva-noite'],
      [65, 'chuva-forte', 'chuva-forte-noite'],
      [82, 'chuva-forte', 'chuva-forte-noite'],
      [95, 'tempestade', 'tempestade-noite'],
      [96, 'tempestade', 'tempestade-noite'],
      [99, 'tempestade', 'tempestade-noite'],
    ]
    for (const [code, dayKey, nightKey] of cases) {
      expect(weatherVisual(code, true).videoKey).toBe(dayKey)
      expect(weatherVisual(code, false).videoKey).toBe(nightKey)
    }
  })

  it('neve e congelante usam ícone sobre fundo neutro, sem vídeo', () => {
    for (const code of [56, 57, 66, 67, 71, 73, 75, 77, 85, 86]) {
      const visual = weatherVisual(code, true)
      expect(visual.videoKey).toBeNull()
      expect(visual.icon).toMatch(/\.svg$/)
    }
  })

  it('reconhece apenas os nomes previstos na pasta Clima', () => {
    expect(weatherVideoKeyFromName('CHUVA-FORTE-NOITE.MP4')).toBe('chuva-forte-noite')
    expect(weatherVideoKeyFromName('tempestade.mp4')).toBe('tempestade')
    expect(weatherVideoKeyFromName('aula-01.mp4')).toBeNull()
  })

  it('descobre vídeos apenas em Clima/ e ignora imagens', () => {
    const videos = discoverWeatherVideos([
      { name: 'chuva.mp4', path: 'G:\\Drive\\LabHub -TV\\Clima\\chuva.mp4', relativePath: 'Clima/chuva.mp4', fileType: 'video' },
      { name: 'nublado.png', path: 'G:\\Drive\\LabHub -TV\\Clima\\nublado.png', relativePath: 'Clima/nublado.png', fileType: 'image' },
      { name: 'ensolarado.mp4', path: 'G:\\Drive\\LabHub -TV\\Cursos\\Direito\\ensolarado.mp4', relativePath: 'Cursos/Direito/ensolarado.mp4', fileType: 'video' },
    ])
    expect(videos).toEqual({ chuva: 'G:\\Drive\\LabHub -TV\\Clima\\chuva.mp4' })
  })

  it('nunca transforma a pasta Clima em curso acadêmico', () => {
    const discovery = discoverLocalStructure([
      {
        name: 'chuva.mp4',
        path: 'G:\\Drive\\LabHub -TV\\Clima\\chuva.mp4',
        relativePath: 'Clima/chuva.mp4',
        fileType: 'video',
        size: 2048,
      },
    ])
    expect(discovery.totalContents).toBe(0)
    expect(discovery.courses).toEqual([])
  })

  it('trocas de vídeos do clima não alteram a versão da biblioteca acadêmica', () => {
    const academic = {
      name: 'aula.mp4',
      path: 'G:\\Drive\\LabHub -TV\\Cursos\\Direito\\aula.mp4',
      relativePath: 'Cursos/Direito/aula.mp4',
      fileType: 'video' as const,
      size: 2048,
    }
    const before = libraryFingerprint([academic])
    const after = libraryFingerprint([
      academic,
      {
        name: 'chuva.mp4',
        path: 'G:\\Drive\\LabHub -TV\\Clima\\chuva.mp4',
        relativePath: 'Clima/chuva.mp4',
        fileType: 'video',
        size: 9999,
      },
    ])
    expect(after).toBe(before)
  })
})
