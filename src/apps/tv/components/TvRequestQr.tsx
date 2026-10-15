import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { defaultDb as supabase } from '../../../lib/supabase'
import { tvApi } from '../utils/apiBase'
import { isKiosk } from '../utils/kiosk'

interface QrData { url: string; expires_at: number }

interface Props {
  /** Exibir o QR (configurável pelo admin; default ligado). */
  show?: boolean
}

export function TvRequestQr({ show = true }: Props) {
  const [data, setData] = useState<QrData | null>(null)
  const [visible, setVisible] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!show) { setVisible(false); return }

    let cancelled = false
    let expiredTimer: number | undefined

    const fetchQr = async () => {
      try {
        const session = await supabase?.auth.getSession()
        const token = session?.data?.session?.access_token
        const res = await fetch(tvApi('/api/tv/request-qr'), {
          headers: token ? { Authorization: 'Bearer ' + token } : {},
        })
        if (!res.ok) throw new Error('request-qr failed')
        const json = await res.json() as QrData
        if (cancelled) return
        setData(json)
        setVisible(true)
        // agenda ocultar caso expire sem renovar
        if (expiredTimer) window.clearTimeout(expiredTimer)
        expiredTimer = window.setTimeout(() => {
          if (!cancelled) setVisible(false)
        }, Math.max(0, (json.expires_at - Date.now() / 1000) * 1000))
      } catch (e) {
        // manter QR anterior até expirar; depois oculta
        if (isKiosk()) console.warn('[TV kiosk] request-qr falhou', e)
        if (data && Date.now() / 1000 > data.expires_at) {
          if (!cancelled) setVisible(false)
        }
      }
    }

    fetchQr()
    const interval = window.setInterval(fetchQr, 4 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      if (expiredTimer) window.clearTimeout(expiredTimer)
    }
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, data.url, { width: 112, margin: 1 }).catch(() => {})
  }, [data])

  if (!show || !visible || !data) return null

  return (
    <div className="fixed bottom-3 right-3 z-40 rounded-xl bg-white/90 p-2 shadow-lg backdrop-blur-sm">
      <canvas ref={canvasRef} aria-label="QR para pedir música" />
      <p className="mt-1 text-center text-[10px] font-medium text-slate-700">Peça sua música</p>
      <p className="max-w-[112px] break-all text-center text-[9px] text-slate-500">{data.url.replace(/^https?:\/\//, '')}</p>
    </div>
  )
}
