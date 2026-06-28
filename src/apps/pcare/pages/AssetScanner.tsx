import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarcodeFormat } from '@zxing/library'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { usePCs } from '../hooks/usePCs'
import { icons } from '../../../lib/icons'
import type { PC } from '../types/pc'

const ZOOM_MIN = 1
const ZOOM_MAX = 3
const ZOOM_STEP = 0.25

function clampZoom(v: number) {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v)) / ZOOM_STEP) * ZOOM_STEP
}

function onlyDigits(s: string) {
  return s.replace(/\D/g, '')
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const SCAN_DELAY_FRAMES = 6

export function AssetScanner() {
  const navigate = useNavigate()
  const { pcs } = usePCs()
  const videoRef = useRef<HTMLVideoElement>(null)
  const regionCanvasRef = useRef<HTMLCanvasElement>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)
  const [loading, setLoading] = useState(true)
  const [modelLoading, setModelLoading] = useState(true)
  const [modelError, setModelError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const controlsRef = useRef<IScannerControls | null>(null)
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)
  const processedRef = useRef(false)
  const mountedRef = useRef(true)
  const rafRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const handLandmarkerRef = useRef<any>(null)

  const fingerRectRef = useRef<Rect | null>(null)
  const [scanningPinch, setScanningPinch] = useState(false)
  const [debug, setDebug] = useState(false)
  const [handVisible, setHandVisible] = useState(false)
  const frameCountRef = useRef(0)
  const noHandFramesRef = useRef(0)
  const lastRectRef = useRef<Rect | null>(null)
  const landmarksRef = useRef<any[] | null>(null)
  const handTimerRef = useRef(0)
  const [confirmImage, setConfirmImage] = useState<string | null>(null)
  const [suggestedText, setSuggestedText] = useState('')
  const [foundPC, setFoundPC] = useState<PC | null>(null)
  const [ocrAttempt, setOcrAttempt] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function initHand() {
      try {
        const { HandLandmarker, FilesetResolver } = await import(
          '@mediapipe/tasks-vision'
        )
        if (cancelled) return
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm/'
        )
        if (cancelled) return
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        if (cancelled) return
        handLandmarkerRef.current = handLandmarker
        setModelLoading(false)
      } catch (e: any) {
        if (!cancelled) {
          setModelLoading(false)
          setModelError(e?.message || 'Falha ao carregar modelo de mão')
        }
      }
    }
    initHand()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!scanning || !videoRef.current) return

    mountedRef.current = true
    setLoading(true)
    setCameraError(null)

    const codeReader = new BrowserMultiFormatReader()
    codeReaderRef.current = codeReader
    codeReader.possibleFormats = [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
    ]

    codeReader
      .decodeFromConstraints(
        {
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        videoRef.current,
        (result) => {
          if (!mountedRef.current || processedRef.current) return
          if (result) {
            processedRef.current = true

            const text = onlyDigits(result.getText())
            if (!text) {
              processedRef.current = false
              return
            }

            const v = videoRef.current
            if (v && v.videoWidth) {
              const snap = document.createElement('canvas')
              snap.width = v.videoWidth
              snap.height = v.videoHeight
              const sctx = snap.getContext('2d')
              if (sctx) {
                sctx.drawImage(v, 0, 0)
                setConfirmImage(snap.toDataURL('image/jpeg', 0.85))
              }
            }

            setSuggestedText(text)
            setFoundPC(pcs.find((p) => p.assetTag === text) ?? null)
            setScanning(false)
            setLoading(false)
          }
        },
      )
      .then((controls) => {
        if (mountedRef.current) {
          controlsRef.current = controls
          setLoading(false)
        } else {
          controls.stop()
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setCameraError('Não foi possível acessar a câmera. Verifique as permissões.')
          setLoading(false)
        }
      })

    return () => {
      mountedRef.current = false
      cancelAnimationFrame(rafRef.current)
      if (controlsRef.current) {
        controlsRef.current.stop()
        controlsRef.current = null
      }
    }
  }, [scanning, pcs, navigate])

  useEffect(() => {
    function draw() {
      const regionCanvas = regionCanvasRef.current
      const video = videoRef.current
      if (!regionCanvas || !video) return

      const container = containerRef.current
      if (!container) return

      const w = container.clientWidth
      const h = container.clientHeight
      regionCanvas.width = w
      regionCanvas.height = h

      const rctx = regionCanvas.getContext('2d')
      if (!rctx) { rafRef.current = requestAnimationFrame(draw); return }

      rctx.clearRect(0, 0, w, h)

      frameCountRef.current++

      if (
        frameCountRef.current % 3 === 0 &&
        video.videoWidth > 0 &&
        !processedRef.current &&
        handLandmarkerRef.current
      ) {
        const result = handLandmarkerRef.current.detectForVideo(video, performance.now())
        landmarksRef.current = result.landmarks

        if (result.landmarks && result.landmarks.length > 0) {
          const l = result.landmarks[0]
          const thumb = l[4]
          const index = l[8]
          if (thumb && index) {
            handTimerRef.current = 0
            noHandFramesRef.current = 0
            if (!handVisible) setHandVisible(true)

            fingerRectRef.current = {
              x: Math.min(thumb.x, index.x) * w,
              y: Math.min(thumb.y, index.y) * h,
              width: Math.abs(thumb.x - index.x) * w,
              height: Math.abs(thumb.y - index.y) * h,
            }
            lastRectRef.current = fingerRectRef.current
          }
        } else {
          handTimerRef.current++
          if (handTimerRef.current > 6 && handVisible) setHandVisible(false)
          noHandFramesRef.current++
          fingerRectRef.current = null

          if (noHandFramesRef.current === SCAN_DELAY_FRAMES && lastRectRef.current) {
            const r = lastRectRef.current
            if (r.width > 10 && r.height > 10) {
              scanRegion(r)
            }
            lastRectRef.current = null
          }
        }
      }

      if (debug && !processedRef.current) {
        const lm = landmarksRef.current
        if (lm && lm.length > 0) {
          const pts = lm[0]
          rctx.fillStyle = '#22c55e'
          for (let i = 0; i < pts.length; i++) {
            rctx.beginPath()
            rctx.arc(pts[i].x * w, pts[i].y * h, 4, 0, Math.PI * 2)
            rctx.fill()
          }
          rctx.font = '10px monospace'
          rctx.fillStyle = '#fff'
          rctx.fillText(`hand: ${pts.length} landmarks`, 6, 14)
        }
      }

      const rect = fingerRectRef.current
      if (rect && !processedRef.current) {
        rctx.fillStyle = 'rgba(0,0,0,0.35)'
        rctx.fillRect(0, 0, w, h)
        rctx.clearRect(rect.x, rect.y, rect.width, rect.height)

        rctx.fillStyle = 'rgba(34,197,94,0.08)'
        rctx.fillRect(rect.x, rect.y, rect.width, rect.height)

        rctx.strokeStyle = '#22c55e'
        rctx.lineWidth = 2.5
        rctx.shadowColor = '#22c55e80'
        rctx.shadowBlur = 10
        rctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
        rctx.shadowBlur = 0

        const s = 8
        rctx.fillStyle = '#22c55e'
        const corners = [
          [rect.x, rect.y],
          [rect.x + rect.width, rect.y],
          [rect.x, rect.y + rect.height],
          [rect.x + rect.width, rect.y + rect.height],
        ]
        for (const [cx, cy] of corners) {
          rctx.fillRect(cx - s / 2, cy - s / 2, s, s)
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    if (scanning) {
      rafRef.current = requestAnimationFrame(draw)
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [scanning, debug, handVisible])

  async function scanRegion(rect: Rect) {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container || !video.videoWidth) return

    setScanningPinch(true)
    setOcrAttempt(false)

    const containerW = container.clientWidth
    const containerH = container.clientHeight
    const scaleX = video.videoWidth / containerW
    const scaleY = video.videoHeight / containerH

    const sx = Math.round(rect.x * scaleX)
    const sy = Math.round(rect.y * scaleY)
    const sw = Math.round(rect.width * scaleX)
    const sh = Math.round(rect.height * scaleY)

    const offscreen = document.createElement('canvas')
    offscreen.width = video.videoWidth
    offscreen.height = video.videoHeight
    const octx = offscreen.getContext('2d')
    if (!octx) { setScanningPinch(false); return }
    octx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = sw
    cropCanvas.height = sh
    const cctx = cropCanvas.getContext('2d')
    if (!cctx) { setScanningPinch(false); return }
    cctx.drawImage(offscreen, sx, sy, sw, sh, 0, 0, sw, sh)

    const dataUrl = cropCanvas.toDataURL('image/jpeg', 0.9)

    try {
      if (!codeReaderRef.current) {
        codeReaderRef.current = new BrowserMultiFormatReader()
        codeReaderRef.current.possibleFormats = [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
        ]
      }
      const result = await codeReaderRef.current.decodeFromCanvas(cropCanvas)
      if (result && mountedRef.current) {
        const text = onlyDigits(result.getText())
        if (text) {
          setConfirmImage(dataUrl)
          setSuggestedText(text)
          setFoundPC(pcs.find((p) => p.assetTag === text) ?? null)
          setScanning(false)
          setLoading(false)
          setScanningPinch(false)
          return
        }
      }
    } catch {
      if (!mountedRef.current) { setScanningPinch(false); return }
    }

    setOcrAttempt(true)
    try {
      const Tesseract = await import('tesseract.js')
      const { data } = await Tesseract.recognize(
        dataUrl,
        'eng',
        { logger: () => {} }
      )
      if (!mountedRef.current) { setScanningPinch(false); return }
      const cleaned = onlyDigits(data.text)
      if (cleaned) {
        setConfirmImage(dataUrl)
        setSuggestedText(cleaned)
        setFoundPC(pcs.find((p) => p.assetTag === cleaned) ?? null)
        setScanning(false)
        setLoading(false)
        setScanningPinch(false)
        return
      }
    } catch {
    }

    if (mountedRef.current) {
      setConfirmImage(dataUrl)
      setSuggestedText('')
      setFoundPC(null)
      setScanning(false)
      setLoading(false)
    }
    setScanningPinch(false)
  }

  function zoomIn() {
    setZoom((z) => clampZoom(z + ZOOM_STEP))
  }

  function zoomOut() {
    setZoom((z) => clampZoom(z - ZOOM_STEP))
  }

  function handleReset() {
    setSuggestedText('')
    setFoundPC(null)
    setCameraError(null)
    setConfirmImage(null)
    setScanning(true)
    setLoading(true)
    setZoom(1)
    setHandVisible(false)
    setDebug(false)
    setOcrAttempt(false)
    fingerRectRef.current = null
    lastRectRef.current = null
    noHandFramesRef.current = 0
    frameCountRef.current = 0
    processedRef.current = false
  }

  function handleConfirm() {
    const text = onlyDigits(suggestedText)
    if (!text) return
    const found = pcs.find((p) => p.assetTag === text)
    if (found) {
      navigate(`/pcare/pcs/${found.id}`)
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Leitor de Etiqueta</h2>

      <div className="mx-auto max-w-sm overflow-hidden rounded-xl border border-line bg-card/50">
        {scanning ? (
          <div className="relative">
            {loading && (
              <div className="flex h-64 flex-col items-center justify-center gap-2">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                <p className="text-xs text-fg-muted">Iniciando câmera...</p>
              </div>
            )}
            <div className={`relative ${loading || cameraError ? 'hidden' : ''}`}>
              <div
                ref={containerRef}
                className="relative overflow-hidden"
              >
                {modelLoading && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-card/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
                      <p className="text-xs text-fg-dim">Carregando modelo de mão...</p>
                    </div>
                  </div>
                )}
                {modelError && !modelLoading && (
                  <div className="absolute right-2 top-2 rounded bg-red-100 dark:bg-red-900/60 px-2 py-1 text-[10px] text-red-700 dark:text-red-300 backdrop-blur-sm">
                    Mão: {modelError}
                  </div>
                )}
                <div
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <video
                    ref={videoRef}
                    className="w-full"
                    playsInline
                  />
                </div>
                <canvas
                  ref={regionCanvasRef}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
                {!cameraError && (
                  <div className="pointer-events-none absolute inset-0 border-[3px] border-cyan-400/50" />
                )}

                {scanningPinch && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                    <div className="rounded-lg bg-card/80 px-4 py-2 text-sm text-fg backdrop-blur-sm">
                      {ocrAttempt ? 'Lendo número...' : 'Escaneando região...'}
                    </div>
                  </div>
                )}

                {handVisible && !scanningPinch && !processedRef.current && (
                  <button
                    type="button"
                    onClick={() => {
                      if (fingerRectRef.current) scanRegion(fingerRectRef.current)
                    }}
                    className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-green-500/90 px-5 py-2 text-sm font-semibold text-fg shadow-lg shadow-green-500/30 backdrop-blur-sm transition-all hover:bg-green-400 active:scale-95"
                  >
                    <icons.nav.scanner size={16} className="inline" /> Capturar
                  </button>
                )}

                <div className="absolute left-2 top-2 z-20 flex items-center gap-2">
                  <div
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${
                      handVisible ? 'bg-green-400 shadow-[0_0_8px_#22c55e]' : 'bg-fg-dim'
                    }`}
                  />
                  <span className="text-[10px] text-fg-muted">{handVisible ? 'Mão detectada' : 'Sem mão'}</span>
                  <button
                    type="button"
                    onClick={() => setDebug((d) => !d)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      debug ? 'bg-cyan-600 text-fg' : 'bg-input text-fg-dim'
                    }`}
                  >
                    debug
                  </button>
                </div>

                {zoom !== 1 && (
                  <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-fg backdrop-blur-sm">
                    {zoom}x
                  </div>
                )}

                <div className="absolute bottom-2 right-2 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={zoomIn}
                    disabled={zoom >= ZOOM_MAX}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-sm text-fg backdrop-blur-sm transition-colors hover:bg-black/70 disabled:opacity-30"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={zoomOut}
                    disabled={zoom <= ZOOM_MIN}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-sm text-fg backdrop-blur-sm transition-colors hover:bg-black/70 disabled:opacity-30"
                  >
                    −
                  </button>
                </div>
              </div>
            </div>
            {cameraError && (
              <div className="flex flex-col items-center px-4 py-16">
                <icons.nav.scanner size={40} />
                <p className="mb-1 text-sm text-red-600 dark:text-red-400">{cameraError}</p>
                <p className="mb-4 text-xs text-fg-muted">
                  Verifique as permissões da câmera nas configurações
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
                >
                  Tentar novamente
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center px-4 py-6">
            {confirmImage && (
              <img
                src={confirmImage}
                alt="Captura"
                className="mb-3 max-h-40 rounded-lg border border-line object-contain"
              />
            )}

            <div className="mb-3 flex w-full max-w-xs gap-2">
              <input
                type="text"
                value={suggestedText}
                onChange={(e) => {
                  const digits = onlyDigits(e.target.value)
                  setSuggestedText(digits)
                  setFoundPC(pcs.find((p) => p.assetTag === digits) ?? null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                placeholder="Digite o número da etiqueta"
                className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg placeholder:text-fg-muted outline-none transition-colors focus:border-cyan-500"
                autoFocus
              />
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!suggestedText}
                className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md disabled:opacity-40"
              >
                Confirmar
              </button>
            </div>

            {foundPC && (
              <div className="mb-4 w-full max-w-xs rounded-lg border border-line bg-card/50 p-3">
                <p className="mb-1 text-sm font-semibold text-fg">
                  {foundPC.labName} — PC {foundPC.pcNumber}
                </p>
                <div className="space-y-0.5 text-xs text-fg-dim">
                  <p>Patrimônio: <span className="text-fg-dim">{foundPC.assetTag}</span></p>
                  <p>Local: <span className="text-fg-dim">{foundPC.roomLocation}</span></p>
                  <p>Limpeza: <span className="text-fg-dim">{foundPC.cleaningStatus}</span></p>
                </div>
              </div>
            )}

            {!foundPC && suggestedText && (
              <p className="mb-4 text-sm text-red-600 dark:text-red-400">
                Nenhum PC encontrado com este patrimônio
              </p>
            )}

            {!suggestedText && (
              <p className="mb-4 text-sm text-fg-dim">
                Nenhum código identificado. Digite o número manualmente.
              </p>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-fg shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
            >
              Escanear outra
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-fg-muted">
        Aproxime o polegar e o indicador para enquadrar o código, depois toque em <strong>Capturar</strong>
      </p>
    </div>
  )
}
