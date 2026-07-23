import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserQRCodeReader } from '@zxing/browser'
import { usePCs } from '../hooks/usePCs'
import { icons } from '../../../lib/icons'

export function QRScanner() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const cancelledRef = useRef(false)
  const [manualCode, setManualCode] = useState('')
  const [feedback, setFeedback] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle')
  const navigate = useNavigate()
  const { pcs } = usePCs()

  const navigateToPC = useCallback((code: string) => {
    const parts = code.split('/')
    if (parts.length < 2) {
      setFeedback('error')
      return
    }
    const labName = parts[0].trim()
    const pcNumber = parts.slice(1).join('/').trim()
    const pc = pcs.find((p) => p.labName === labName && p.pcNumber === pcNumber)
    if (pc) {
      setFeedback('success')
      controlsRef.current?.stop?.()
      setTimeout(() => navigate(`/pc-care/pcs/${pc.id}`), 300)
    } else {
      setFeedback('error')
    }
  }, [pcs, navigate])

  function stopStream() {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
  }

  const startCamera = useCallback(() => {
    if (!videoRef.current || cancelledRef.current) return
    stopStream()
    setFeedback('scanning')
    cancelledRef.current = false

    const reader = new BrowserQRCodeReader()
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
      if (cancelledRef.current) return
      if (result) {
        const text = result.getText() || ''
        navigateToPC(text)
      }
    }).then((ctrl) => {
      controlsRef.current = ctrl
    }).catch(() => {
      if (!cancelledRef.current) setFeedback('idle')
    })
  }, [navigateToPC])

  useEffect(() => {
    cancelledRef.current = false
    startCamera()
    return () => {
      cancelledRef.current = true
      controlsRef.current?.stop?.()
      stopStream()
    }
  }, [startCamera])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualCode.trim()) return
    navigateToPC(manualCode.trim())
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-fg">
      <header className="flex items-center gap-2 border-b border-line bg-card/80 px-3 py-2.5 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-dim transition-colors hover:bg-input hover:text-fg"
          aria-label="Voltar"
        >
          <icons.ui.back size={18} />
        </button>
        <h1 className="text-sm font-semibold text-fg">Escanear QR</h1>
      </header>

      <div className="flex flex-1 flex-col items-center px-5 pb-8 pt-4">
        <div className="relative mb-6 w-full max-w-sm overflow-hidden rounded-2xl bg-black shadow-lg">
          <video
            ref={videoRef}
            className="aspect-[4/3] w-full object-cover"
            playsInline
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={`relative h-48 w-48 rounded-xl border-2 transition-all ${
              feedback === 'success' ? 'border-emerald-400' : feedback === 'error' ? 'border-red-400' : 'border-white/40'
            }`}>
              <div className="absolute left-0 top-0 h-6 w-6 rounded-tl-xl border-l-2 border-t-2 border-emerald-400" />
              <div className="absolute right-0 top-0 h-6 w-6 rounded-tr-xl border-r-2 border-t-2 border-emerald-400" />
              <div className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-xl border-b-2 border-l-2 border-emerald-400" />
              <div className="absolute bottom-0 right-0 h-6 w-6 rounded-br-xl border-b-2 border-r-2 border-emerald-400" />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-4">
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium text-white backdrop-blur-sm transition-opacity ${
              feedback === 'scanning' ? 'bg-white/20 opacity-100' : 'opacity-0'
            }`}>
              Escaneando...
            </span>
          </div>

          {feedback === 'error' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="inline-block rounded-full bg-red-500/80 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                QR não encontrado
              </span>
            </div>
          )}

          {feedback === 'success' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/80 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                <icons.ui.check size={16} />
                Redirecionando...
              </div>
            </div>
          )}

          {feedback === 'idle' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="inline-block rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                Câmera desativada
              </span>
            </div>
          )}
        </div>

        {feedback === 'idle' && (
          <button
            type="button"
            onClick={startCamera}
            className="mb-6 flex items-center gap-2 rounded-xl bg-card px-5 py-3 text-sm font-medium shadow-[var(--shadow-card)] transition-colors hover:bg-input"
          >
            <icons.ui.scanBarcode size={18} />
            Ativar Câmera
          </button>
        )}

        <div className="mb-4 flex w-full max-w-sm items-center gap-3">
          <span className="flex-1 border-t border-line" />
          <span className="text-xs font-medium text-fg-muted">ou digite o código</span>
          <span className="flex-1 border-t border-line" />
        </div>

        <form onSubmit={handleManualSubmit} className="flex w-full max-w-sm gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Ex: Lab 105/PC-12"
            className="flex-1 rounded-xl bg-input px-4 py-3 text-sm text-fg placeholder:text-fg-dim focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400"
          >
            Buscar
          </button>
        </form>

        {feedback === 'error' && (
          <p className="mt-3 text-xs text-red-400">Nenhum PC encontrado com esse código</p>
        )}
      </div>
    </div>
  )
}
