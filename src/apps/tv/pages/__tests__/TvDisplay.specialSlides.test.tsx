import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { CLOCK_DISPLAY_MS, CLOCK_WAIT_DISPLAY_MS, TvDisplay, WEATHER_DISPLAY_MS, WEATHER_WAIT_DISPLAY_MS } from '../TvDisplay'
import type { ProgrammingQueueItem, TvInformativo } from '../../types'

/**
 * TvDisplay local (Tauri): a sequência de fases vem do ProgrammingContext
 * (currentItem + contadores). Os slides especiais entram DEPOIS do conteúdo
 * que fecha o marco, contando TODO conteúdo exibido (acadêmico, fixo e
 * informativo — base = contentShown):
 *   relógio → quando o conteúdo é o 4º, 8º, 12º... (múltiplo de 4)
 *   clima   → quando o conteúdo é múltiplo de 8 (antes do relógio)
 */

const { programming, academicItem } = vi.hoisted(() => {
  const item: ProgrammingQueueItem = {
    id: 'content-1',
    type: 'academic',
    course_id: 'course_a',
    course_name: 'Curso A',
    course_trailer: null,
    file_path: '/media/curso-a/aula-1.mp4',
    file_name: 'aula-1.mp4',
    file_type: 'video',
    duration_seconds: 60,
    is_trailer: false,
    is_fixed: false,
  }

  return {
    academicItem: item,
    programming: {
      queue: [item],
      currentItem: item as ProgrammingQueueItem | null,
      academicCompleted: 0,
      contentShown: 0,
      markContentShown: vi.fn(),
      fixedContent: [] as ProgrammingQueueItem[],
      nextFixedId: null as string | null,
      isFixedDue: false,
      nextInformativo: null as Record<string, unknown> | null,
      informativoDue: false,
      galleries: [],
      photosMap: {},
      ready: true,
      discoveryError: null,
      isWaitingForEligible: false,
      markCurrentCompleted: vi.fn(),
      reportMediaFailure: vi.fn(),
      resetInformativoCounter: vi.fn(),
      failedIds: [] as string[],
    },
  }
})

const FIXED: ProgrammingQueueItem = {
  id: 'fixed-1',
  type: 'fixed',
  course_id: undefined,
  course_name: undefined,
  course_trailer: undefined,
  file_path: '/media/fixos/comercial.mp4',
  file_name: 'comercial.mp4',
  file_type: 'video',
  duration_seconds: 30,
  is_trailer: false,
  is_fixed: true,
}

const INFORMATIVO: TvInformativo = {
  id: 'info-1',
  workspace_id: null,
  file_name: 'aviso.png',
  file_path: '/media/informativos/aviso.png',
  file_type: 'image',
  duration_seconds: 10,
  display_count: 0,
  last_displayed: null,
  thumbnail_url: null,
  sort_order: 0,
  is_available: true,
  created_at: '2026-01-01T00:00:00Z',
}

vi.mock('../../contexts/ProgrammingContext', () => ({
  useProgramming: () => programming,
}))

vi.mock('../../services/localProgramming', () => ({
  toLocalUrl: (path: string) => path,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(''),
}))

// O player expõe um botão que encerra a fase, simulando o fim do vídeo.
vi.mock('../../components/VideoPlayer', () => ({
  VideoPlayer: ({ onEnd, url, contentType }: { onEnd?: () => void; url: string; contentType?: string }) => (
    <button
      data-testid="video-player"
      data-url={url}
      data-content-type={contentType}
      onClick={() => onEnd?.()}
    >
      VideoPlayer
    </button>
  ),
}))

vi.mock('../../components/PhotoSlideshow', () => ({
  PhotoSlideshow: () => <div data-testid="photo-slideshow" />,
}))

vi.mock('../../components/UpdateBadge', () => ({
  UpdateBadge: () => null,
}))

vi.mock('../../components/WeatherSlideEnhanced', () => ({
  WeatherSlideEnhanced: () => <div data-testid="weather-slide" />,
}))

vi.mock('../../components/ClockSlide', () => ({
  ClockSlide: () => <div data-testid="clock-slide" />,
}))

vi.mock('../../components/ScreenSaver', () => ({
  ScreenSaver: () => <div data-testid="screensaver" />,
}))

vi.mock('../../components/SeasonalEffects', () => ({
  SeasonalEffects: () => null,
}))

vi.mock('../../utils/kiosk', () => ({
  isKiosk: () => false,
}))

const WEATHER_MS = WEATHER_DISPLAY_MS

function renderDisplay() {
  return render(<TvDisplay deviceId="tv-1" />)
}

/** Encerra a fase atual do player (equivale ao vídeo chegar ao fim). */
function endPhase() {
  fireEvent.click(screen.getByTestId('video-player'))
}

describe('TvDisplay — cadência dos slides especiais', () => {
  beforeEach(() => {
    vi.useRealTimers()
    programming.queue = [academicItem]
    programming.currentItem = academicItem
    programming.contentShown = 0
    programming.academicCompleted = 0
    programming.fixedContent = []
    programming.nextFixedId = null
    programming.isFixedDue = false
    programming.nextInformativo = null
    programming.informativoDue = false
    programming.galleries = []
    programming.photosMap = {}
    programming.ready = true
    programming.discoveryError = null
    programming.isWaitingForEligible = false
    programming.markCurrentCompleted.mockClear()
    programming.markContentShown.mockClear()
    programming.resetInformativoCounter.mockClear()
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('não exibe slides especiais antes do 4º conteúdo', () => {
    programming.contentShown = 2 // o próximo conteúdo é o 3º

    renderDisplay()
    endPhase()

    expect(screen.queryByTestId('clock-slide')).toBeNull()
    expect(screen.queryByTestId('weather-slide')).toBeNull()
  })

  it('exibe o relógio depois do 4º conteúdo', () => {
    programming.contentShown = 3 // o próximo conteúdo é o 4º

    renderDisplay()
    endPhase()

    expect(screen.getByTestId('clock-slide')).toBeInTheDocument()
    expect(screen.queryByTestId('weather-slide')).toBeNull()
  })

  it('exibe o relógio nos múltiplos de 4 que não são múltiplos de 8', () => {
    // próximos conteúdos: 12º, 20º e 28º
    for (const shownBefore of [11, 19, 27]) {
      programming.contentShown = shownBefore

      const { unmount } = renderDisplay()
      endPhase()

      expect(screen.getByTestId('clock-slide')).toBeInTheDocument()
      expect(screen.queryByTestId('weather-slide')).toBeNull()

      unmount()
    }
  })

  it('exibe o clima depois do 8º conteúdo', () => {
    programming.contentShown = 7 // o próximo conteúdo é o 8º

    renderDisplay()
    endPhase()

    expect(screen.getByTestId('weather-slide')).toBeInTheDocument()
  })

  it('exibe o clima nos múltiplos de 8', () => {
    // próximos conteúdos: 16º e 24º
    for (const shownBefore of [15, 23]) {
      programming.contentShown = shownBefore

      const { unmount } = renderDisplay()
      endPhase()

      expect(screen.getByTestId('weather-slide')).toBeInTheDocument()

      unmount()
    }
  })

  it('no múltiplo de 8 toca clima e depois relógio, nessa ordem', () => {
    programming.contentShown = 7
    vi.useFakeTimers()

    renderDisplay()
    endPhase()

    expect(screen.getByTestId('weather-slide')).toBeInTheDocument()
    expect(screen.queryByTestId('clock-slide')).toBeNull()

    // WeatherSlideEnhanced dura 30s na programação normal e então vem o relógio.
    act(() => {
      vi.advanceTimersByTime(WEATHER_MS)
    })

    expect(screen.getByTestId('clock-slide')).toBeInTheDocument()
    expect(screen.queryByTestId('weather-slide')).toBeNull()
  })

  it('mostra o conteúdo apenas uma vez por fase, sem repetir o slide', () => {
    programming.contentShown = 3

    renderDisplay()
    endPhase()

    // O relógio é uma fase única: não pode haver dois slides montados.
    expect(screen.getAllByTestId('clock-slide')).toHaveLength(1)
  })

  it('conta fixos e informativos na cadência', () => {
    // Conteúdo #2 = fixo, #3 = informativo, #4 = acadêmico → relógio no fim do bloco.
    programming.contentShown = 1
    programming.fixedContent = [FIXED]
    programming.nextFixedId = FIXED.id
    programming.isFixedDue = true
    programming.nextInformativo = INFORMATIVO as unknown as Record<string, unknown>
    programming.informativoDue = true

    renderDisplay()

    // fixo → informativo (ainda sem slide especial)
    endPhase()
    expect(screen.queryByTestId('clock-slide')).toBeNull()

    // informativo → acadêmico
    endPhase()
    expect(screen.queryByTestId('clock-slide')).toBeNull()

    // acadêmico (4º conteúdo) → relógio
    endPhase()
    expect(screen.getByTestId('clock-slide')).toBeInTheDocument()
  })

  it('insere o slide logo após o conteúdo que fecha o marco (fixo)', () => {
    // conteúdos #1 e #2 já passaram; #3 = informativo; #4 = fixo → relógio após o fixo
    programming.contentShown = 2
    programming.fixedContent = [FIXED]
    programming.nextFixedId = FIXED.id
    programming.isFixedDue = true
    programming.nextInformativo = INFORMATIVO as unknown as Record<string, unknown>
    programming.informativoDue = true

    renderDisplay()

    // informativo (#3) → fixo (#4)
    endPhase()
    expect(screen.queryByTestId('clock-slide')).toBeNull()

    // o fixo fecha o marco: o relógio entra antes do conteúdo acadêmico
    endPhase()
    expect(screen.getByTestId('clock-slide')).toBeInTheDocument()
    expect(screen.queryByTestId('video-player')).toBeNull()
  })

  it('fixo em vídeo nunca reinicia o contador de informativos', () => {
    programming.fixedContent = [FIXED]
    programming.nextFixedId = FIXED.id
    programming.isFixedDue = true
    renderDisplay()
    expect(screen.getByTestId('video-player')).toHaveAttribute('data-url', FIXED.file_path)
    endPhase()
    expect(programming.resetInformativoCounter).not.toHaveBeenCalled()
    expect(screen.getByTestId('video-player')).toHaveAttribute('data-url', academicItem.file_path)
    endPhase()
    expect(programming.resetInformativoCounter).not.toHaveBeenCalled()
  })

  it('informativo em vídeo reinicia o próprio contador apenas após a sequência', () => {
    programming.nextInformativo = {...INFORMATIVO, file_type: 'video', file_path: '/media/informativos/aviso.mp4'}
    programming.informativoDue = true
    renderDisplay()
    expect(screen.getByTestId('video-player')).toHaveAttribute('data-url', '/media/informativos/aviso.mp4')
    endPhase()
    expect(programming.resetInformativoCounter).not.toHaveBeenCalled()
    expect(screen.getByTestId('video-player')).toHaveAttribute('data-url', academicItem.file_path)
    endPhase()
    expect(programming.resetInformativoCounter).toHaveBeenCalledTimes(1)
  })

  it('informativo em imagem aguarda 15 segundos e não pula o conteúdo acadêmico', () => {
    vi.useFakeTimers()
    programming.nextInformativo = INFORMATIVO as unknown as Record<string, unknown>
    programming.informativoDue = true
    renderDisplay()
    expect(screen.getByTestId('video-player')).toHaveAttribute('data-content-type', 'image')
    act(() => { vi.advanceTimersByTime(14999) })
    expect(screen.getByTestId('video-player')).toHaveAttribute('data-url', INFORMATIVO.file_path)
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByTestId('video-player')).toHaveAttribute('data-url', academicItem.file_path)
    expect(programming.resetInformativoCounter).not.toHaveBeenCalled()
    endPhase()
    expect(programming.resetInformativoCounter).toHaveBeenCalledTimes(1)
  })

  it('imagem acadêmica usa o player de imagem e termina após 15 segundos', () => {
    vi.useFakeTimers()
    programming.currentItem = {
      ...academicItem,
      file_type: 'image',
      file_path: '/media/cursos/direito/foto.jpg',
      duration_seconds: 15,
    }
    renderDisplay()
    const player = screen.getByTestId('video-player')
    expect(player).toHaveAttribute('data-content-type', 'image')
    expect(player).toHaveAttribute('data-url', '/media/cursos/direito/foto.jpg')
    act(() => { vi.advanceTimersByTime(14_999) })
    expect(programming.markCurrentCompleted).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(programming.markCurrentCompleted).toHaveBeenCalledTimes(1)
  })

  it('fixo em imagem usa o player de imagem e não atrasa o conteúdo acadêmico', () => {
    vi.useFakeTimers()
    const banner: ProgrammingQueueItem = { ...FIXED, file_type: 'image', file_path: '/media/fixos/banner.png' }
    programming.fixedContent = [banner]
    programming.nextFixedId = banner.id
    programming.isFixedDue = true
    renderDisplay()
    expect(screen.getByTestId('video-player')).toHaveAttribute('data-content-type', 'image')
    act(() => { vi.advanceTimersByTime(15_000) })
    expect(screen.getByTestId('video-player')).toHaveAttribute('data-url', academicItem.file_path)
    expect(programming.resetInformativoCounter).not.toHaveBeenCalled()
  })

  it('registra cada conteúdo exibido uma única vez', () => {
    programming.contentShown = 3

    renderDisplay()

    expect(programming.markContentShown).toHaveBeenCalledTimes(1)

    endPhase() // vai para o relógio, que não é conteúdo
    expect(programming.markContentShown).toHaveBeenCalledTimes(1)
  })

  it('usa 20 segundos para o relógio na programação normal', () => {
    vi.useFakeTimers()
    programming.contentShown = 3

    renderDisplay()
    endPhase() // conteúdo fecha o marco → relógio

    act(() => { vi.advanceTimersByTime(CLOCK_DISPLAY_MS - 1) })
    expect(screen.getByTestId('clock-slide')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByTestId('video-player')).toBeInTheDocument()
  })

  it('estende a espera para 45s no relógio e 60s no clima, sem contar conteúdo', () => {
    vi.useFakeTimers()
    programming.queue = [academicItem]
    programming.currentItem = null
    programming.isWaitingForEligible = true

    renderDisplay()
    expect(screen.getByTestId('clock-slide')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(CLOCK_WAIT_DISPLAY_MS - 1) })
    expect(screen.getByTestId('clock-slide')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByTestId('weather-slide')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(WEATHER_WAIT_DISPLAY_MS - 1) })
    expect(screen.getByTestId('weather-slide')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByTestId('clock-slide')).toBeInTheDocument()
    expect(programming.markContentShown).not.toHaveBeenCalled()
  })

  it('retoma no meio do slide prolongado com vinheta antes do vídeo elegível', () => {
    vi.useFakeTimers()
    const eligibleItem = { ...academicItem, course_trailer: '/media/vinheta-curso-a.mp4' }
    programming.queue = [eligibleItem]
    programming.currentItem = null
    programming.isWaitingForEligible = true

    const { rerender } = renderDisplay()
    act(() => { vi.advanceTimersByTime(CLOCK_WAIT_DISPLAY_MS) })
    expect(screen.getByTestId('weather-slide')).toBeInTheDocument()

    // O contexto libera o vídeo sem reiniciar o app; a transição acontece
    // imediatamente, sem esperar os 60s do clima.
    programming.currentItem = eligibleItem
    programming.isWaitingForEligible = false
    rerender(<TvDisplay deviceId="tv-1" />)

    expect(screen.queryByTestId('weather-slide')).toBeNull()
    expect(screen.getByTestId('video-player')).toHaveAttribute('data-url', '/media/vinheta-curso-a.mp4')
  })

  it('não marca o vídeo como assistido ao retomar de uma sequência mais curta', () => {
    vi.useFakeTimers()
    programming.queue = [academicItem]
    programming.currentItem = null
    programming.isWaitingForEligible = true

    const { rerender } = renderDisplay()
    act(() => { vi.advanceTimersByTime(CLOCK_WAIT_DISPLAY_MS) })
    expect(screen.getByTestId('weather-slide')).toBeInTheDocument()

    programming.currentItem = academicItem
    programming.isWaitingForEligible = false
    rerender(<TvDisplay deviceId="tv-1" />)

    expect(screen.getByTestId('video-player')).toHaveAttribute('data-url', academicItem.file_path)
    expect(programming.markCurrentCompleted).not.toHaveBeenCalled()
  })
})
