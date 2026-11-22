import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listLocalMediaWithStatus } from '../localProgramming'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  convertFileSrc: (path: string) => `asset://${path}`,
}))

function raw(name: string, size: number, overrides: Record<string, unknown> = {}) {
  return {
    name,
    size,
    path: `G:\\LabHub-TV\\Cursos\\Direito\\${name}`,
    relativePath: `Cursos\\Direito\\${name}`,
    parentFolder: 'Direito',
    file_type: name.endsWith('.jpg') ? 'image' : 'video',
    isAvailable: true,
    ...overrides,
  }
}

beforeEach(() => {
  mocks.invoke.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('listLocalMediaWithStatus — Fase 5', () => {
  it('ignora arquivos vazios, temporários e indisponíveis sem perder os válidos', async () => {
    mocks.invoke.mockResolvedValue([
      raw('A.mp4', 1024),
      raw('vazio.mp4', 0),
      raw('parcial.mp4.crdownload', 4096),
      raw('rascunho.tmp', 4096),
      raw('backup~', 4096),
      raw('offline.mp4', 2048, { isAvailable: false }),
      raw('audio.mp3', 2048, { file_type: 'audio' }),
      raw('foto.jpg', 2048),
    ])

    const result = await listLocalMediaWithStatus()

    expect(result.error).toBeNull()
    expect(result.files.map((f) => f.name)).toEqual(['A.mp4', 'foto.jpg'])
  })

  it('sinaliza falha de leitura em vez de transformar a pasta em biblioteca vazia', async () => {
    mocks.invoke.mockRejectedValue(new Error('pasta indisponível'))

    const result = await listLocalMediaWithStatus()

    expect(result.files).toEqual([])
    expect(result.error).toContain('pasta indisponível')
  })
})
