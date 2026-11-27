import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIBRARY_REFRESH_MS, VIDEO_COOLDOWN_MS, nextEligiblePosition, ProgrammingProvider, useProgramming } from '../ProgrammingContext'
import { buildLocalQueue, localId, optimizeCourseDistribution, type LocalCourse } from '../../services/localProgramming'

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
}

function emptyState(): SavedState {
  return {
    cycle: 1,
    position: 0,
    academic_completed: 0,
    academic_since_last_fixed: 0,
    completed_ids: [],
    pending_queue: [],
    next_fixed_id: null,
    library_version: null,
    error_contents: [],
    completed_fixed_ids: [],
    academic_since_last_informativo: 0,
  }
}

const A = 'G:\\LabHub-TV\\Cursos\\Direito\\A.mp4'
const B = 'G:\\LabHub-TV\\Cursos\\Biomedicina\\B.mp4'

function rawFile(path: string, name: string) {
  return {
    name,
    size: 2048,
    path,
    relativePath: path.slice(path.indexOf('Cursos')),
    parentFolder: path.includes('Direito') ? 'Direito' : 'Biomedicina',
    file_type: 'video',
    isAvailable: true,
  }
}

const rig = vi.hoisted(() => ({
  invoke: vi.fn(),
  savedState: null as SavedState | null,
  files: [] as ReturnType<typeof rawFile>[],
  listError: false,
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
  return render(
    <ProgrammingProvider>
      <Probe />
    </ProgrammingProvider>,
  )
}

beforeEach(() => {
  // O setup global usa timers falsos; waitFor/render precisam dos reais.
  vi.useRealTimers()
  latest = undefined
  rig.savedState = null
  rig.listError = false
  rig.files = [
    rawFile(A, 'A.mp4'),
    rawFile(B, 'B.mp4'),
  ]
  rig.invoke.mockReset()
  rig.invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === 'list_synced_files') {
      return rig.listError
        ? Promise.reject(new Error('pasta temporariamente indisponível'))
        : Promise.resolve(rig.files)
    }
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
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ProgrammingContext — recuperação Fase 5', () => {
  it('retoma posição e fila persistidas após reinício', async () => {
    const a = localId(A)
    const b = localId(B)
    rig.savedState = {
      ...emptyState(),
      position: 1,
      academic_completed: 1,
      library_version: 'v1',
      pending_queue: [a, b],
    }

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))

    expect(api().position).toBe(1)
    expect(api().academicCompleted).toBe(1)
    expect(api().queue.map((i) => i.id)).toEqual([a, b])
    await waitFor(() => {
      expect(rig.invoke).toHaveBeenCalledWith(
        'programming_state_set',
        expect.objectContaining({
          state: expect.objectContaining({ pending_queue: [a, b], error_contents: [] }),
        }),
      )
    })
  })

  it('pasta indisponível preserva o último estado e não sobrescreve o arquivo', async () => {
    const a = localId(A)
    rig.savedState = { ...emptyState(), position: 1, academic_completed: 2, library_version: 'v1', pending_queue: [a] }
    rig.listError = true

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))

    expect(api().position).toBe(1)
    expect(api().academicCompleted).toBe(2)
    expect(api().discoveryError).toMatch(/Não foi possível ler a pasta/)
    expect(rig.invoke.mock.calls.some(([cmd]) => cmd === 'programming_state_set')).toBe(false)
  })

  it('mídia com erro não conta como assistida e não retorna na próxima rodada', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))

    const failedId = api().queue[0].id
    act(() => api().reportMediaFailure(failedId))
    act(() => api().markCurrentCompleted())

    expect(api().academicCompleted).toBe(0)

    const remainingId = api().queue[api().position]?.id
    act(() => api().markCurrentCompleted())

    expect(api().queue.some((i) => i.id === failedId)).toBe(false)
    expect(api().queue.some((i) => i.id === remainingId)).toBe(true)
  })

  it('mantém cada conteúdo uma única vez e evita consecutivos do mesmo curso', () => {
    const courses: LocalCourse[] = [
      {
        id: 'dir',
        name: 'Direito',
        slug: 'direito',
        trailer: null,
        contents: [
          { name: 'd1.mp4', path: 'd1.mp4', relativePath: 'd1.mp4', fileType: 'video', size: 1 },
          { name: 'd2.mp4', path: 'd2.mp4', relativePath: 'd2.mp4', fileType: 'video', size: 1 },
        ],
      },
      {
        id: 'bio',
        name: 'Biomedicina',
        slug: 'bio',
        trailer: null,
        contents: [
          { name: 'b1.mp4', path: 'b1.mp4', relativePath: 'b1.mp4', fileType: 'video', size: 1 },
          { name: 'b2.mp4', path: 'b2.mp4', relativePath: 'b2.mp4', fileType: 'video', size: 1 },
        ],
      },
    ]

    const queue = buildLocalQueue(courses, [])
    expect(new Set(queue.map((i) => i.id)).size).toBe(4)

    const distributed = optimizeCourseDistribution(queue)
    expect(distributed).toHaveLength(4)
    for (let i = 1; i < distributed.length; i++) {
      expect(distributed[i].course_id).not.toBe(distributed[i - 1].course_id)
    }
  })
})


describe('descoberta periódica da biblioteca', () => {
  it('confirma duas leituras e incorpora a foto apenas após advance', async () => {
    vi.useFakeTimers()
    renderProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(api().ready).toBe(true)
    const current = api().currentItem!
    const removed = api().queue.find(i => i.id !== current.id)!
    const photo = 'G:/LabHub-TV/Cursos/Direito/novo.jpg'
    rig.files = [...rig.files.filter(f => f.path !== removed.file_path), {
      ...rawFile(photo, 'novo.jpg'), file_type: 'image',
    }]
    await act(async () => { await vi.advanceTimersByTimeAsync(LIBRARY_REFRESH_MS) })
    expect(api().queue.some(i => i.file_path === photo)).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(LIBRARY_REFRESH_MS) })
    expect(api().currentItem?.id).toBe(current.id)
    act(() => api().markCurrentCompleted())
    expect(api().academicCompleted).toBe(1)
    expect(api().currentItem?.file_path).toBe(photo)
    expect(api().queue.some(i => i.id === removed.id)).toBe(false)
  })
})


describe('cooldown individual de vídeo', () => {
  it('bloqueia a repetição por dez minutos e retoma sem resetar o histórico', async () => {
    vi.useFakeTimers()
    renderProvider()
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    expect(api().ready).toBe(true)
    const first = api().currentItem!
    act(() => api().markCurrentCompleted())
    expect(api().currentItem?.id).not.toBe(first.id)
    act(() => api().markCurrentCompleted())
    expect(api().currentItem).toBeNull()
    expect(api().academicCompleted).toBe(2)
    const items = api().queue
    const now = Date.now()
    const history = Object.fromEntries(items.map(item => [item.id, now]))
    expect(nextEligiblePosition(items, 0, history, [], now + VIDEO_COOLDOWN_MS - 1)).toBe(items.length)
    expect(nextEligiblePosition(items, 0, history, [], now + VIDEO_COOLDOWN_MS)).toBe(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(VIDEO_COOLDOWN_MS) })
    act(() => api().advance())
    expect(api().currentItem).not.toBeNull()
    expect(api().academicCompleted).toBe(2)
  })
  it('não bloqueia fotos, vinhetas nem fixos', async () => {
    renderProvider()
    await waitFor(() => expect(api().ready).toBe(true))
    const item = api().currentItem!
    const now = Date.now()
    const history = { [item.id]: now }
    expect(nextEligiblePosition([{...item, file_type: 'image'}], 0, history, [], now)).toBe(0)
    expect(nextEligiblePosition([{...item, is_trailer: true}], 0, history, [], now)).toBe(0)
    expect(nextEligiblePosition([{...item, is_fixed: true}], 0, history, [], now)).toBe(0)
  })
})
