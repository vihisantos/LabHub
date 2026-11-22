import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { TvDisplay } from '../TvDisplay'
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
  const item = {
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
      currentItem: item,
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
      markCurrentCompleted: vi.fn(),
      resetInformativoCounter: vi.fn(),
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
  VideoPlayer: ({ onEnd }: { onEnd?: () => void }) => (
    <button data-testid="video-player" onClick={() => onEnd?.()}>
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

const WEATHER_MS = 15000

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

    // WeatherSlideEnhanced dura 15s e então a fase avança para o relógio.
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

  it('registra cada conteúdo exibido uma única vez', () => {
    programming.contentShown = 3

    renderDisplay()

    expect(programming.markContentShown).toHaveBeenCalledTimes(1)

    endPhase() // vai para o relógio, que não é conteúdo
    expect(programming.markContentShown).toHaveBeenCalledTimes(1)
  })
})
