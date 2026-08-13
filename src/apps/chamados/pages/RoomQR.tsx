import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useRooms } from '../hooks/useRooms'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { icons } from '../../../lib/icons'

const sizeOptions = [
  { value: 100, label: '100px — Pequeno' },
  { value: 150, label: '150px — Médio' },
  { value: 200, label: '200px — Grande' },
  { value: 300, label: '300px — Extragrande' },
]

export function RoomQR() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { rooms } = useRooms()
  const { canManageQr } = useAppAccess()
  const room = rooms.find((r) => r.id === id)

  const [qrDataUrl, setQrDataUrl] = useState('')
  const [size, setSize] = useState(200)
  const [copied, setCopied] = useState(false)

  const qrContent = useMemo(() => {
    if (!room) return ''
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const workspace = room.workspace_id ? `&workspace=${encodeURIComponent(room.workspace_id)}` : ''
    return `${base}/chamados-publico/new?room=${encodeURIComponent(room.name)}${workspace}`
  }, [room])

  useEffect(() => {
    if (!qrContent) return
    QRCode.toDataURL(qrContent, {
      width: size,
      margin: 2,
      color: { dark: '#1e293b', light: '#ffffff' },
    }).then(setQrDataUrl)
  }, [qrContent, size])

  const handlePrint = () => {
    window.print()
  }

  const handleCopyLink = async () => {
    if (!qrContent) return
    try {
      await navigator.clipboard.writeText(qrContent)
    } catch {
      // Clipboard indisponível: usa fallback legado
      const ta = document.createElement('textarea')
      ta.value = qrContent
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = async () => {
    if (!qrDataUrl || !room) return
    const base64 = qrDataUrl.split(',')[1]
    const zip = new JSZip()
    zip.file(`QR-${room.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`, base64, { base64: true })
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, `QR-${room.name}.zip`)
  }

  if (!canManageQr()) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-input text-fg-dim">
          <icons.ui.shield size={22} />
        </div>
        <div>
          <p className="text-sm font-semibold text-fg">Acesso restrito</p>
          <p className="mt-1 text-xs text-fg-muted">
            Seu cargo não tem permissão para gerar QR de salas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/chamados/rooms')}
          className="rounded-xl bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-400"
        >
          Voltar às salas
        </button>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center py-12">
        <icons.ui.alertCircle size={40} className="text-fg-muted" />
        <p className="mt-3 text-sm text-fg-muted">Sala não encontrada</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-area { display: flex !important; justify-content: center !important; }
        }
      `}</style>

      <div className="no-print flex items-center gap-2">
        {sizeOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSize(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              size === opt.value ? 'bg-amber-500 text-white' : 'bg-card text-fg-dim border border-line hover:text-fg'
            }`}
          >
            {opt.value}px
          </button>
        ))}
      </div>

      <div className="print-area flex flex-col items-center rounded-xl bg-card p-6 shadow-[var(--shadow-card)]">
        {qrDataUrl && (
          <img src={qrDataUrl} alt={`QR Code - ${room.name}`} className="mb-3" style={{ width: size }} />
        )}
        <p className="text-sm font-semibold text-fg">{room.name}</p>
        {room.location && (
          <p className="text-xs text-fg-muted">{room.location}</p>
        )}
      </div>

      <div className="no-print flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handlePrint}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-card border border-line px-4 py-3 text-sm font-medium text-fg transition-colors hover:bg-input"
        >
          <icons.ui.printer size={16} />
          Imprimir
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
        >
          <icons.ui.download size={16} />
          Download
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-card border border-line px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input"
        >
          <icons.ui.link size={16} />
          {copied ? 'Link copiado!' : 'Copiar link'}
        </button>
      </div>
    </div>
  )
}
