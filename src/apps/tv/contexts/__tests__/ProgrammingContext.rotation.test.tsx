import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIBRARY_REFRESH_MS, ProgrammingProvider, useProgramming } from '../ProgrammingContext'
import { localId } from '../../services/localProgramming'

interface SavedState {
  cycle: number
  position: number
  academic_completed: number
  academic_since_last_fixed: number
  completed_ids: string[]
  pending_queue: string[]
  next_fixed_id: string | null
  library_version: string | null
  error_contents: string[]
  completed_fixed_ids: string[]
  academic_since_last_informativo: number
  completed_informativo_ids?: string[]
  next_informativo_id?: string | null
  last_video_played_at?: Record<string, number>
  fixed_round_ids?: string[]
  fixed_round_cursor?: number
  informativo_round_ids?: string[]
  informativo_round_cursor?: number
}

type LocalFile = {
  name: string
  size: number
  path: string
  relativePath: string
  parentFolder: string
  file_type: 'video' | 'image'
  isAvailable: boolean
}

const ACADEMICOS = [
  'G:\\LabHub-TV\\Cursos\\Direito\\a1.mp4',
  'G:\\LabHub-TV\\Cursos\\Biomedicina\\a2.mp4',
  'G:\\LabHub-TV\\Cursos\\Direito\\a3.mp4',
  'G:\\LabHub-TV\\Cursos\\Biomedicina\\a4.mp4',
  'G:\\LabHub-TV\\Cursos\\Direito\\a5.mp4',
  'G:\\LabHub-TV\\Cursos\\Biomedicina\\a6.mp4',
  'G:\\LabHub-TV\\Cursos\\Direito\\a7.mp4',
  'G:\\LabHub-TV\\Cursos\\Biomedicina\\a8.mp4',
]

/** Cinco vídeos em ordem não alfabética no Drive. */
const FIXOS = [
  'G:\\LabHub-TV\\Fixos\\zeta.mp4',
  'G:\\LabHub-TV\\Fixos\\beta.mp4',
  'G:\\LabHub-TV\\Fixos\\delta.mp4',
  'G:\\LabHub-TV\\Fixos\\alfa.mp4',
  'G:\\LabHub-TV\\Fixos\\gamma.mp4',
]
/** Quatro avisos, misturando imagens e vídeos. */
const INFORMATIVOS = [
  'G:\\LabHub-TV\\Informativos\\ultimo.mp4',
  'G:\\LabHub-TV\\Informativos\\segundo.jpg',
  'G:\\LabHub-TV\\Informativos\\primeiro.mp4',
  'G:\\LabHub-TV\\Informativos\\terceiro.png',
]

function academicFile(path: string): LocalFile {
  return {
    name: path.split('\\').pop()!, size: 2048, path,
    relativePath: path.slice(path.indexOf('Cursos')),
    parentFolder: path.split('\\').slice(-2)[0], file_type: 'video', isAvailable: true,
  }
}

function specialFile(path: string, category: 'Fixos' | 'Informativos'): LocalFile {
  const name = path.split('\\').pop()!
  return {
    name, size: 2048, path,
    relativePath: path.slice(path.indexOf(category)),
    parentFolder: category,
    file_type: name.endsWith('.mp4') ? 'video' : 'image',
    isAvailable: true,
  }
}

const rig = vi.hoisted(() => ({
  invoke: vi.fn(),
  savedState: null as SavedState | null,
  files: [] as LocalFile[],
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: Record<string, unknown>) => rig.invoke(command, args),
  convertFileSrc: (path: string) => `asset://${path}`,
  isTauri: () => true,
}))

let latest: ReturnType<typeof useProgramming> | undefined
function Probe() {
  latest = useProgramming()
  return <span data-testid="ready">{String(latest.ready)}</span>
}
function api() {
  if (!latest) throw new Error('Provider não montado')
  return latest
}
function renderProvider() {
  return render(<ProgrammingProvider><Probe /></ProgrammingProvider>)
}
async function remount() {
  cleanup()
  latest = undefined
  renderProvider()
  await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
}
function expectedOrder(paths: string[]): string[] {
  return [...paths]
    .sort(function(a, b) {
      return a.split('\\').pop()!.localeCompare(b.split('\\').pop()!, 'pt-BR', { sensitivity: 'base' })
    })
    .map(localId)
}
function baseState(): SavedState {
  return {
    cycle: 1, position: 0, academic_completed: 0, academic_since_last_fixed: 0,
    completed_ids: [], pending_queue: ACADEMICOS.map(localId), next_fixed_id: null,
    library_version: 'v1', error_contents: [], completed_fixed_ids: [],
    academic_since_last_informativo: 0, completed_informativo_ids: [],
    next_informativo_id: null, last_video_played_at: {},
  }
}

beforeEach(() => {
  vi.useRealTimers()
  latest = undefined
  rig.savedState = null
  rig.files = [
    ...ACADEMICOS.map(academicFile),
    ...FIXOS.map(function(p) { return specialFile(p, 'Fixos') }),
    ...INFORMATIVOS.map(function(p) { return specialFile(p, 'Informativos') }),
  ]
  rig.invoke.mockReset()
  rig.invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === 'list_synced_files') return Promise.resolve(rig.files)
    if (command === 'programming_state_get') return Promise.resolve(rig.savedState)
    if (command === 'programming_state_set') {
      rig.savedState = (args?.state as SavedState) ?? null
      return Promise.resolve()
    }
    return Promise.resolve(null)
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('rodízio com 5 fixos e 4 informativos noProgrammingContext', () => {
  it('os cinco fixos participam uma vez cada, em ordem determinística e persistida', async () => {
    const seen: string[] = []
    for (let round = 0; round < FIXOS.length; round++) {
      rig.savedState = {
        ...(rig.savedState ?? baseState()),
        academic_since_last_fixed: 4,
        completed_fixed_ids: [...seen],
        next_fixed_id: null,
      }
      await remount()

      const id = api().nextFixedId!
      expect(id).toBeTruthy()
      expect(seen).not.toContain(id)
      seen.push(id)

      act(() => api().markSpecialContentCompleted('fixed', id))
      expect(api().completedFixedIds).toEqual(seen)
      await waitFor(() => expect(rig.savedState?.completed_fixed_ids).toEqual(seen))
    }

    expect(seen).toHaveLength(5)
    expect(new Set(seen).size).toBe(5)
    expect(seen).toEqual(expectedOrder(FIXOS))
    // Vídeos entram no histórico individual com cooldown de 10 minutos.
    for (const id of seen) {
      expect(rig.savedState?.last_video_played_at?.[id]).toBeGreaterThan(0)
    }
  })

  it('os quatro informativos (imagens e vídeos) participam sem repetir', async () => {
    const seen: string[] = []
    for (let round = 0; round < INFORMATIVOS.length; round++) {
      rig.savedState = {
        ...(rig.savedState ?? baseState()),
        academic_since_last_informativo: 7,
        completed_informativo_ids: [...seen],
        next_informativo_id: null,
      }
      await remount()

      const id = api().nextInformativo!.id
      expect(seen).not.toContain(id)
      seen.push(id)

      act(() => api().resetInformativoCounter(id))
      await waitFor(() => expect(rig.savedState?.completed_informativo_ids).toEqual(seen))
    }

    expect(seen).toHaveLength(4)
    expect(new Set(seen).size).toBe(4)
    expect(seen).toEqual(expectedOrder(INFORMATIVOS))
    // Imagens não têm cooldown; somente os vídeos aparecem no histórico.
    const videos = INFORMATIVOS.filter(function(p) { return p.endsWith('.mp4') })
    expect(Object.keys(rig.savedState?.last_video_played_at ?? {}).sort())
      .toEqual(videos.map(localId).sort())
  })

  it('fixo em cooldown cede lugar a outro elegível, sem perder a pendência', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-11-27T18:00:00Z').getTime()
    vi.setSystemTime(now)
    const first = expectedOrder(FIXOS)[0]
    rig.savedState = {
      ...baseState(), academic_since_last_fixed: 4, next_fixed_id: null,
      last_video_played_at: { [first]: now - 60_000 },
    }
    renderProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

    expect(api().nextFixedId).toBe(expectedOrder(FIXOS)[1])
    expect(api().completedFixedIds).not.toContain(first)
    vi.useRealTimers()
  })

  it('falha de um fixo não o marca como concluído e outro é agendado', async () => {
    rig.savedState = { ...baseState(), academic_since_last_fixed: 4 }
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))

    const failed = api().nextFixedId!
    act(() => api().reportMediaFailure(failed))
    await waitFor(() => expect(api().nextFixedId).not.toBe(failed))
    expect(api().nextFixedId).toBeTruthy()
    expect(api().completedFixedIds).not.toContain(failed)
    await waitFor(() => expect(rig.savedState?.error_contents).toContain(failed))
  })

  it('novo fixo do Drive entra na fila sem descartar a rodada em andamento', async () => {
    vi.useFakeTimers()
    const existing = expectedOrder(FIXOS).slice(0, 4)
    rig.savedState = {
      ...baseState(), academic_since_last_fixed: 4,
      completed_fixed_ids: existing, next_fixed_id: null,
    }
    renderProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

    const extra = 'G:\\LabHub-TV\\Fixos\\novo.mp4'
    rig.files = [...rig.files, specialFile(extra, 'Fixos')]
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * LIBRARY_REFRESH_MS) })
    act(() => api().markCurrentCompleted())
    vi.useRealTimers()

    await waitFor(() => {
      expect(rig.savedState?.fixed_round_ids).toContain(localId(extra))
    })
    expect(rig.savedState?.fixed_round_ids?.slice(0, 4)).toEqual(existing)
  })
})
