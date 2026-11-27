import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COOLDOWN_RECHECK_MS, LIBRARY_REFRESH_MS, VIDEO_COOLDOWN_MS, nextEligiblePosition, ProgrammingProvider, useProgramming } from '../ProgrammingContext'
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
  completed_informativo_ids?: string[]
  next_informativo_id?: string | null
  last_video_played_at?: Record<string, number>
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

const INFO1 = 'G:\\LabHub-TV\\Informativos\\aviso1.png'
const INFO2 = 'G:\\LabHub-TV\\Informativos\\aviso2.jpg'

function infoFile(path: string, name: string) {
  return {
    name,
    size: 2048,
    path,
    relativePath: path.slice(path.indexOf('Informativos')),
    parentFolder: 'Informativos',
    file_type: 'image',
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

async function flushInitialLoad() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
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
    await act(async () => { await vi.advanceTimersByTimeAsync(VIDEO_COOLDOWN_MS + COOLDOWN_RECHECK_MS) })
    // Retomada automática: sem advance() manual e sem reinício do aplicativo.
    expect(api().currentItem).not.toBeNull()
    expect(api().academicCompleted).toBe(2)
    const resumed = api().currentItem!.id
    await act(async () => { await vi.advanceTimersByTimeAsync(VIDEO_COOLDOWN_MS) })
    expect(api().currentItem!.id).toBe(resumed)
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

describe('espera por cooldown: biblioteca viva e retomada automática', () => {
  it('aplica vídeo novo confirmado durante a espera sem incrementar contadores', async () => {
    vi.useFakeTimers()
    renderProvider()
    await flushInitialLoad()
    expect(api().ready).toBe(true)

    act(() => api().markCurrentCompleted())
    act(() => api().markCurrentCompleted())
    expect(api().currentItem).toBeNull()
    expect(api().academicCompleted).toBe(2)

    const newVideo = 'G:\\LabHub-TV\\Cursos\\Direito\\C.mp4'
    rig.files = [...rig.files, rawFile(newVideo, 'C.mp4')]
    await act(async () => { await vi.advanceTimersByTimeAsync(LIBRARY_REFRESH_MS) })
    await act(async () => { await vi.advanceTimersByTimeAsync(LIBRARY_REFRESH_MS) })

    expect(api().currentItem?.file_path).toBe(newVideo)
    expect(api().academicCompleted).toBe(2)
    expect(api().academicSinceLastFixed).toBe(2)
    expect(rig.savedState?.academic_since_last_informativo).toBe(2)
    expect(api().queue.some(i => i.file_path === newVideo)).toBe(true)
  })

  it('aplica alterações confirmadas sem item atual e conta apenas o conteúdo exibido', async () => {
    vi.useFakeTimers()
    renderProvider()
    await flushInitialLoad()
    act(() => api().markCurrentCompleted())
    act(() => api().markCurrentCompleted())
    expect(api().currentItem).toBeNull()

    const newPhoto = 'G:/LabHub-TV/Cursos/Biomedicina/nova.png'
    rig.files = [...rig.files, { ...rawFile(newPhoto, 'nova.png'), file_type: 'image' }]
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * LIBRARY_REFRESH_MS) })

    expect(api().currentItem?.file_path).toBe(newPhoto)
    // O limite da espera precisa ser inofensivo: nada é contado como assistido.
    act(() => api().markCurrentCompleted())
    expect(api().academicCompleted).toBe(3)
  })

  it('inicia sozinho quando a biblioteca era vazia e um vídeo aparece', async () => {
    vi.useFakeTimers()
    rig.files = []
    renderProvider()
    await flushInitialLoad()

    expect(api().ready).toBe(true)
    expect(api().queue).toHaveLength(0)
    expect(api().currentItem).toBeNull()

    rig.files = [rawFile(A, 'A.mp4')]
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * LIBRARY_REFRESH_MS) })

    expect(api().currentItem?.file_path).toBe(A)
    expect(api().academicCompleted).toBe(0)
  })
})

describe('informativos — cadência e rodada', () => {
  const academicPaths = [
    A, B,
    'G:\\LabHub-TV\\Cursos\\Direito\\C.mp4',
    'G:\\LabHub-TV\\Cursos\\Biomedicina\\D.mp4',
    'G:\\LabHub-TV\\Cursos\\Direito\\E.mp4',
    'G:\\LabHub-TV\\Cursos\\Biomedicina\\F.mp4',
    'G:\\LabHub-TV\\Cursos\\Direito\\G.mp4',
    'G:\\LabHub-TV\\Cursos\\Biomedicina\\H.mp4',
  ]

  async function renderWithInformativos(overrides: Partial<SavedState> = {}) {
    rig.files = [
      ...academicPaths.map(function(path, index) { return rawFile(path, `A${index}.mp4`) }),
      infoFile(INFO1, 'aviso1.png'), infoFile(INFO2, 'aviso2.jpg'),
    ]
    rig.savedState = {
      ...emptyState(),
      academic_since_last_informativo: 7,
      library_version: 'v1',
      pending_queue: academicPaths.map(localId),
      ...overrides,
    }
    renderProvider()
    await waitFor(() => expect(api().ready).toBe(true))
  }

  it('não repete o mesmo aviso na rodada e reinicia a rodada ao esgotá-la', async () => {
    await renderWithInformativos()
    expect(api().informativoDue).toBe(true)
    const first = api().nextInformativo!.id

    act(() => api().resetInformativoCounter(first))
    expect(api().informativoDue).toBe(false)
    expect(api().nextInformativo).toBeNull()
    expect(rig.savedState?.completed_informativo_ids).toContain(first)

    // Retoma com a cadência vencida: escolhe o próximo da rodada, sem repetir.
    rig.savedState = {
      ...(rig.savedState as SavedState),
      academic_since_last_informativo: 7,
      pending_queue: academicPaths.map(localId),
      position: 0,
    }
    cleanup()
    latest = undefined
    renderProvider()
    await waitFor(() => expect(api().ready).toBe(true))
    const second = api().nextInformativo!.id
    expect(second).not.toBe(first)

    // Rodada esgotada: só abre a seguinte quando uma nova cadência vence.
    rig.savedState = {
      ...(rig.savedState as SavedState),
      academic_since_last_informativo: 7,
      completed_informativo_ids: [first, second],
      next_informativo_id: null, // limite da sequência já atingido
      pending_queue: academicPaths.map(localId),
      position: 0,
    }
    cleanup()
    latest = undefined
    renderProvider()
    await waitFor(() => expect(api().ready).toBe(true))
    expect(api().nextInformativo!.id).toBe(first)
    await waitFor(() => expect(rig.savedState?.completed_informativo_ids).toEqual([]))
  })

  it('retoma a rodada persistida e nunca escolhe mídia que falhou', async () => {
    await renderWithInformativos({
      completed_informativo_ids: [localId(INFO1)],
      error_contents: [localId(INFO2)],
    })
    expect(api().informativoDue).toBe(true)
    // O único arquivo válido já foi concluído; o falho nunca é escolhido e a
    // rodada recomeça em ordem determinística (sem repetição aleatória).
    expect(api().nextInformativo?.id).toBe(localId(INFO1))
    expect(api().nextInformativo?.id).not.toBe(localId(INFO2))
  })

  it('exibe o aviso restante quando apenas um falhou', async () => {
    await renderWithInformativos({ error_contents: [localId(INFO1)] })
    expect(api().nextInformativo?.id).toBe(localId(INFO2))
  })
})
