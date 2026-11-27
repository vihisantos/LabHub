import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Tv, Folder } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import './TvDisplay.css'
import { isKiosk } from '../utils/kiosk'
import { useProgramming } from '../contexts/ProgrammingContext'
import { useSignedTvUpdate } from '../hooks/useSignedTvUpdate'
import { toLocalUrl } from '../services/localProgramming'
import type { ProgrammingQueueItem } from '../types'
import { VideoPlayer } from '../components/VideoPlayer'
import { PhotoSlideshow } from '../components/PhotoSlideshow'
import { UpdateBadge } from '../components/UpdateBadge'
import { WeatherSlideEnhanced } from '../components/WeatherSlideEnhanced'
import { ClockSlide } from '../components/ClockSlide'
import { ScreenSaver } from '../components/ScreenSaver'
import { SeasonalEffects } from '../components/SeasonalEffects'

/**
 * Player de exibição da TV — modo LOCAL (Tauri Desktop).
 *
 * A sequência de fases é montada exclusivamente a partir dos arquivos
 * sincronizados do Google Drive (via ProgrammingContext local):
 *   [informativo?] → [fixo?] → conteúdo acadêmico (fila principal) →
 *   [galeria → clima]* → clima
 *
 * Fases que dependiam de tabelas administrativas (eventos, playlists do
 * banco, galerias do Storage) não existem mais aqui: sem dados locais, a
 * fase simplesmente não entra na sequência.
 *
 * SLIDES ESPECIAIS (ClockSlide e WeatherSlideEnhanced):
 * - ClockSlide: a cada 4 conteúdos, 12 segundos
 * - WeatherSlideEnhanced: a cada 8 conteúdos, 15 segundos
 * - Conta TODO conteúdo exibido: acadêmico, fixo e informativo. Slides
 *   especiais e galerias NÃO contam como conteúdo.
 * - O slide entra imediatamente depois do conteúdo que fecha o marco
 * - Quando coincidem (múltiplo de 8), ambos são exibidos sequencialmente
 */

// Duration constants (in milliseconds)
const CLOCK_DISPLAY_MS = 12000
const WEATHER_DISPLAY_MS = 15000

export function TvDisplay({ deviceId }: { deviceName?: string; deviceId?: string } = {}) {
  const programming = useProgramming()
  void deviceId // mantém para compatibilidade com chamadas existentes
  const {
    queue,
    currentItem,
    contentShown,
    markContentShown,
    fixedContent,
    nextFixedId,
    isFixedDue,
    nextInformativo,
    informativoDue,
    informativos,
    galleries,
    photosMap,
    ready,
    discoveryError,
    markCurrentCompleted,
    reportMediaFailure,
    resetInformativoCounter,
  } = programming

  const [failedGalleries, setFailedGalleries] = useState(new Set<string>())

  // Callback estável: uma galeria que falhou é removida da sequência uma única
  // vez, sem disparar novas chamadas a cada re-render do player.
  const handleGalleryAllFailed = useCallback(function(galleryId: string) {
    setFailedGalleries(function(prev) {
      if (prev.has(galleryId)) return prev
      const next = new Set(prev)
      next.add(galleryId)
      return next
    })
  }, [])

  useEffect(function() {
    if (!isKiosk()) return
    let offlineSince: number | null = null
    const onOffline = function() { offlineSince = Date.now(); console.warn('[TV kiosk] offline') }
    const onOnline = function() {
      if (offlineSince !== null) {
        console.info('[TV kiosk] reconnect after ' + Math.round((Date.now() - offlineSince) / 1000) + 's')
        offlineSince = null
      }
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return function() {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  /* ── Phase sequence (local) ── */
  interface PhaseInformative { type: 'informativo'; item: NonNullable<typeof nextInformativo> }
  interface PhaseFixed { type: 'fixed'; item: ProgrammingQueueItem }
  interface PhaseTrailer { type: 'trailer'; trailerUrl: string; courseName: string }
  interface PhaseVideo { type: 'video'; item: ProgrammingQueueItem | null }
  interface PhaseGallery { type: 'gallery'; galleryId: string }
  interface PhaseClock { type: 'clock' }
  interface PhaseWeatherEnhanced { type: 'weather-enhanced' }
  type Phase = PhaseInformative | PhaseFixed | PhaseTrailer | PhaseVideo | PhaseGallery | PhaseClock | PhaseWeatherEnhanced

  const fixedItem = useMemo(function() {
    if (!isFixedDue || !nextFixedId) return null
    return fixedContent.find(function(f) { return f.id === nextFixedId }) ?? null
  }, [isFixedDue, nextFixedId, fixedContent])

  // Quantos conteúdos já tinham sido exibidos quando o ciclo atual começou.
  // Serve de base para a cadência dos slides especiais dentro do ciclo.
  // Deve ser declarado antes do usePhaseSequence que o usa.
  const [cycleBaseContents, setCycleBaseContents] = useState(contentShown)

  // Gerar a sequência de fases incluindo vinhetas e slides especiais
  const phaseSequence = useMemo<Phase[]>(function() {
    const seq: Phase[] = []
    // Todos os vídeos acadêmicos ainda em cooldown: espera com slides, sem
    // tocar vinhetas avulsas ou consumir os contadores acadêmicos.
    if (ready && queue.length > 0 && !currentItem) {
      return [{ type: 'clock' }, { type: 'weather-enhanced' }]
    }

    // Cadência dos slides especiais: todo conteúdo exibido conta (acadêmico,
    // fixo e informativo). `played` parte da base do ciclo para que a sequência
    // seja a mesma em toda regeração — inclusive quando ela acontece no meio do
    // ciclo (ex.: contador de informativo zerado ao exibir o informativo).
    let played = cycleBaseContents
    function pushContent(phase: PhaseInformative | PhaseFixed | PhaseVideo) {
      seq.push(phase)
      played += 1
      if (played % 8 === 0) {
        // Múltiplo de 8: clima (15s) e, na sequência, o relógio (12s)
        seq.push({ type: 'weather-enhanced' })
        seq.push({ type: 'clock' })
      } else if (played % 4 === 0) {
        seq.push({ type: 'clock' })
      }
    }

    // 1. Conteúdo fixo/comercial (a cada 5 itens acadêmicos)
    if (fixedItem) {
      pushContent({ type: 'fixed', item: fixedItem })
    }

    // 2. Informativo do Drive (comunicados/avisos intercalados)
    if (informativoDue && nextInformativo) {
      pushContent({ type: 'informativo', item: nextInformativo })
    }

    // 3. Conteúdo acadêmico — fila principal do Drive
    if (currentItem) {
      // REGRA OBRIGATÓRIA DA VINHETA (Seção 4 do Plano):
      // Sempre que um conteúdo acadêmico for reproduzido, sua vinheta aparece imediatamente antes.
      // Cursos sem conteúdo acadêmico não entram na fila, garantindo que a vinheta nunca toca sozinha.
      if (currentItem.course_trailer) {
        seq.push({
          type: 'trailer',
          trailerUrl: currentItem.course_trailer,
          courseName: currentItem.course_name || 'Curso',
        })
      }

      // Conteúdo acadêmico em si (vídeo ou imagem) — também conta na cadência
      pushContent({ type: 'video', item: currentItem })
    }

    // 5. Galerias locais
    for (const g of galleries.filter(function(gItem) { return !failedGalleries.has(gItem.id) })) {
      seq.push({ type: 'gallery', galleryId: g.id })
    }

    return seq.length > 0 ? seq : ready ? [{ type: 'clock' }, { type: 'weather-enhanced' }] : [{ type: 'video', item: null }]
  }, [fixedItem, informativoDue, nextInformativo, currentItem, cycleBaseContents, galleries, failedGalleries, ready, queue.length])

  const [phaseIdx, setPhaseIdx] = useState(0)
  // Sinaliza quando um ciclo completo de fases terminou (para avançar a fila)
  const [cycleCompleted, setCycleCompleted] = useState(0)
  const currentPhase = phaseSequence[phaseIdx]
  const isVideoPhase = currentPhase?.type === 'video'

  const PHOTO_DISPLAY_MS = 15000
  const installAtBoundary = useSignedTvUpdate(ready)

  // Separa o setState do efeito colateral (markCurrentCompleted)
  // para seguir o padrão correto do React — sem chamar funções externas
  // dentro de callbacks de setState.
  const advancePhase = useCallback(function() {
    const proceed = () => {
      setPhaseIdx(function(i) {
        const next = i + 1
        if (next >= phaseSequence.length) {
          setCycleCompleted(function(c) { return c + 1 })
          return 0
        }
        return next
      })
    }
    if (phaseIdx + 1 >= phaseSequence.length && installAtBoundary(proceed)) return
    proceed()
  }, [phaseSequence.length, phaseIdx, installAtBoundary])

  // Reage ao fim de um ciclo: avança a fila de programação
  useEffect(function() {
    if (cycleCompleted === 0) return
    setCycleBaseContents(contentShown)
    markCurrentCompleted()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleCompleted])

  // Conta cada conteúdo exibido (acadêmico, fixo ou informativo) uma única vez.
  // A chave ciclo:índice evita contagem dupla quando o efeito reexecuta.
  const countedPhaseRef = useRef('')
  useEffect(function() {
    if (!currentPhase) return
    const isContent =
      currentPhase.type === 'fixed' ||
      currentPhase.type === 'informativo' ||
      (currentPhase.type === 'video' && currentPhase.item !== null)
    if (!isContent) return
    const key = cycleCompleted + ':' + phaseIdx
    if (countedPhaseRef.current === key) return
    countedPhaseRef.current = key
    markContentShown()
  }, [currentPhase, phaseIdx, cycleCompleted, markContentShown])

  const handleContentCompleted = useCallback(function(failed?: boolean) {
    if (failed) {
      const failedId = currentPhase?.type === 'fixed' || currentPhase?.type === 'informativo'
        ? currentPhase.item.id
        : currentPhase?.type === 'video' ? currentPhase.item?.id : undefined
      if (failedId) reportMediaFailure(failedId)
    }
    advancePhase()
  }, [advancePhase, currentPhase, reportMediaFailure])

  // Fila vazia: pula a fase de vídeo para não prender o ciclo.
  useEffect(function() {
    if (ready && isVideoPhase && !currentItem) {
      advancePhase()
    }
  }, [ready, isVideoPhase, currentItem, advancePhase])

  // Tela cheia: tenta no boot e, se o shell não ceder de primeira, insiste por
  // um tempo limitado. Não é re-disparada a cada fase: reentrar em fullscreen
  // no meio de um vídeo provoca reflow/redimensionamento visível na TV.
  useEffect(function() {
    if (document.fullscreenElement) return
    let attempts = 0
    const timer = setInterval(function() {
      if (document.fullscreenElement || attempts >= 6) {
        clearInterval(timer)
        return
      }
      attempts += 1
      document.documentElement.requestFullscreen().catch(function() {})
    }, 5000)
    // Primeira tentativa no boot (pode ser bloqueada sem gesto do usuário),
    // depois o intervalo tenta por até 30s.
    document.documentElement.requestFullscreen().catch(function() {})
    attempts = 1
    return function() { clearInterval(timer) }
  }, [])

  // Listener de teclado - F11 para tela cheia
  useEffect(function() {
    const onKeyDown = function(e: KeyboardEvent) {
      if (e.key === 'F11') {
        e.preventDefault()
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(function() {})
        } else {
          document.exitFullscreen().catch(function() {})
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return function() { window.removeEventListener('keydown', onKeyDown) }
  }, [])

  function isGalleryPhase(phase: Phase | undefined): phase is PhaseGallery {
    return phase?.type === 'gallery' && phase.galleryId !== undefined
  }

  const currentPhaseDurationMs = useMemo(function() {
    if (!currentPhase) return null
    if (currentPhase.type === 'weather-enhanced') return WEATHER_DISPLAY_MS
    if (currentPhase.type === 'clock') return CLOCK_DISPLAY_MS
    if (currentPhase.type === 'trailer') return null // Vídeo da vinheta: duração original (via onEnd)
    if (currentPhase.type === 'informativo') {
      return currentPhase.item.file_type === 'image' ? PHOTO_DISPLAY_MS : null
    }
    if (currentPhase.type === 'fixed') {
      return currentPhase.item.file_type === 'image' ? PHOTO_DISPLAY_MS : null
    }
    if (isVideoPhase) {
      const item = (currentPhase as PhaseVideo).item
      if (item && item.file_type === 'image') return PHOTO_DISPLAY_MS
      return null
    }
    if (isGalleryPhase(currentPhase)) {
      const photos = photosMap[currentPhase.galleryId]
      return photos && photos.length > 0 ? photos.length * PHOTO_DISPLAY_MS : 3000
    }
    return null
  }, [currentPhase, isVideoPhase, photosMap, PHOTO_DISPLAY_MS, WEATHER_DISPLAY_MS, CLOCK_DISPLAY_MS])

  useEffect(function() {
    if (currentPhaseDurationMs === null) return
    // Informativo em imagem termina pelo timer (não há onEnd): zera o contador
    // aqui também, senão ele continuaria "devido" e voltaria em todo ciclo.
    const isInformativo = currentPhase?.type === 'informativo'
    const timer = setTimeout(function() {
      if (isInformativo) resetInformativoCounter()
      advancePhase()
    }, currentPhaseDurationMs)
    return function() { clearTimeout(timer) }
  }, [currentPhaseDurationMs, currentPhase, advancePhase, phaseIdx, resetInformativoCounter])

  // Sequência mudou: preserva o índice atual. Se ela encolheu a ponto de não
  // haver mais fase nele (ex.: galeria removida por falha de carregamento),
  // encerra o ciclo em vez de voltar ao índice 0 — voltar repetiria o conteúdo
  // atual sem marcar o anterior como concluído.
  useEffect(function() {
    setPhaseIdx(function(i) {
      if (i < phaseSequence.length) return i
      setCycleCompleted(function(c) { return c + 1 })
      return 0
    })
  }, [phaseSequence.length])

  let wakeLock: WakeLockSentinel | null = null
  useEffect(function() {
    if ('wakeLock' in navigator) {
      (navigator.wakeLock as { request: (type: string) => Promise<WakeLockSentinel> }).request('screen')
        .then(function(wl) { wakeLock = wl })
        .catch(function() {})
    }
    return function() { wakeLock?.release().catch(function() {}) }
  }, [])

  const hasContent = queue.length > 0 || galleries.length > 0
    || fixedContent.length > 0 || informativos.length > 0
  const currentGallery = isGalleryPhase(currentPhase)
    ? galleries.find(function(g) { return g.id === (currentPhase as PhaseGallery).galleryId }) ?? null
    : null
  const currentGalleryPhotos = isGalleryPhase(currentPhase)
    ? photosMap[(currentPhase as PhaseGallery).galleryId] ?? []
    : []

  const mainItem = isVideoPhase ? (currentPhase as PhaseVideo).item : null

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: '#000000',
      color: '#0f172a', position: 'relative', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Vinheta do curso (imediatamente antes de cada conteúdo acadêmico) */}
      {currentPhase?.type === 'trailer' && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 1,
          pointerEvents: 'auto',
          overflow: 'hidden',
          background: '#000000',
        }}>
          <VideoPlayer
            key={currentPhase.trailerUrl}
            url={toLocalUrl(currentPhase.trailerUrl)}
            source="local"
            contentType="video"
            isPlaying={true}
            onEnd={handleContentCompleted}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}

      {/* Academic content phase (fila principal do Drive) */}
      {mainItem && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: isVideoPhase ? 1 : 0,
          pointerEvents: isVideoPhase ? 'auto' : 'none',
          transition: 'opacity 0.5s',
          overflow: 'hidden',
          background: '#000000',
        }}>
          <VideoPlayer
            key={mainItem.id}
            url={toLocalUrl(mainItem.file_path)}
            source="local"
            contentType={mainItem.file_type}
            isPlaying={true}
            onEnd={handleContentCompleted}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}

      {/* Fixed content phase (Fixos/) */}
      {currentPhase?.type === 'fixed' && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 1,
          pointerEvents: 'auto',
          transition: 'opacity 0.5s',
          overflow: 'hidden',
          background: '#000000',
        }}>
          <VideoPlayer
            key={currentPhase.item.file_path}
            url={toLocalUrl(currentPhase.item.file_path)}
            source="local"
            contentType={currentPhase.item.file_type}
            isPlaying={true}
            onEnd={function() { resetInformativoCounter(); handleContentCompleted() }}
          />
        </div>
      )}

      {/* Informativo phase (Informativos/) */}
      {currentPhase?.type === 'informativo' && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 1,
          pointerEvents: 'auto',
          transition: 'opacity 0.5s',
          overflow: 'hidden',
          background: '#000000',
        }}>
          <VideoPlayer
            key={currentPhase.item.file_path}
            url={toLocalUrl(currentPhase.item.file_path)}
            source="local"
            contentType={currentPhase.item.file_type}
            isPlaying={true}
            onEnd={function() { resetInformativoCounter(); handleContentCompleted() }}
          />
        </div>
      )}

      {/* Gallery phase (Galerias/) */}
      {isGalleryPhase(currentPhase) && currentGallery && currentGalleryPhotos.length > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000000',
          opacity: 1,
          pointerEvents: 'auto',
          transition: 'opacity 0.5s',
        }}>
          <PhotoSlideshow
            photos={currentGalleryPhotos}
            title={currentGallery.title}
            onAllFailed={() => handleGalleryAllFailed((currentPhase as PhaseGallery).galleryId)}
          />
        </div>
      )}

      {/* Weather slide (Piracicaba + detalhes, Open-Meteo) */}
      {currentPhase && currentPhase.type === 'weather-enhanced' && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 1,
          pointerEvents: 'auto',
        }}>
          <WeatherSlideEnhanced />
        </div>
      )}

      {/* Clock slide */}
      {currentPhase && currentPhase.type === 'clock' && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 1,
          pointerEvents: 'auto',
        }}>
          <ClockSlide />
        </div>
      )}

      {/* Aviso de descoberta vazia */}
      {ready && discoveryError && (
        <div style={{
          position: 'fixed', bottom: '6rem', left: '50%',
          transform: 'translateX(-50%)', zIndex: 40,
          background: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '8px',
          padding: '0.5rem 1rem',
          fontSize: '0.8rem', color: '#92400e',
          maxWidth: '80vw', textAlign: 'center',
        }}>
          {discoveryError}
        </div>
      )}

      {}

      {/* Branding */}
      <div style={{ position: 'fixed', bottom: '2rem', left: '3rem', zIndex: 10, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#333333' }}>
        <Tv size={16} />
        <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>LabHub TV</span>
      </div>

      {/* Botão de seleção da pasta do Google Drive */}
      <button onClick={async () => {
        try {
          const folderPath = await invoke<string>('open_folder_dialog')
          if (!folderPath) return
          await invoke('configure_drive_folder', { folderPath, accountConfirmed: true })
          await invoke('sync_drive_content').catch(() => {})
          // Recarrega para o ProgrammingProvider redescobrir a biblioteca local
          window.location.reload()
        } catch (err: any) {
          const msg = err?.message || String(err || '')
          if (msg.includes('User cancelled') || msg.includes('No folder selected') || msg.toLowerCase().includes('cancel')) return
          // Não registrar o erro bruto: mensagens do seletor podem conter caminhos.
          console.warn('[TV] falha ao selecionar pasta do Drive')
        }
      }} style={{ position: 'fixed', top: '1rem', right: '5rem', zIndex: 50, width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(15,23,42,0.12)', boxShadow: '0 2px 8px rgba(15,23,42,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', cursor: 'pointer', transition: 'all 0.2s' }} title="Selecionar pasta do Google Drive">
        <Folder size={18} />
      </button>

      <UpdateBadge />

      {/* Seasonal particle effects */}
      <SeasonalEffects />

      {/* Empty state → screensaver */}
      {ready && !hasContent && <ScreenSaver />}
    </div>
  )
}