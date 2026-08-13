import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { icons } from '../../../lib/icons'

const sizeOptions = [
  { value: 100, label: '100px — Pequeno' },
  { value: 150, label: '150px — Médio' },
  { value: 200, label: '200px — Grande' },
  { value: 300, label: '300px — Extragrande' },
]

export function UnitQR() {
  const navigate = useNavigate()
  const { canManageQr } = useAppAccess()

  const [qrDataUrl, setQrDataUrl] = useState('')
  const [size, setSize] = useState(200)
  const [copied, setCopied] = useState(false)

  const qrContent = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/chamados-publico/new`
  }, [])

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
    if (!qrDataUrl) return
    const base64 = qrDataUrl.split(',')[1]
    const zip = new JSZip()
    zip.file('QR-chamados.png', base64, { base64: true })
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, 'QR-chamados.zip')
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
            Seu cargo não tem permissão para gerar o QR Code de chamados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/chamados')}
          className="rounded-xl bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-400"
        >
          Voltar ao painel
        </button>
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

      <div className="rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold text-fg">QR único de chamados</p>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          O professor escaneia o QR, escolhe a unidade (campus) e depois a sala. Um só QR para toda a escola —
          imprima e fixe nos pontos de uso.
        </p>
      </div>

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
          <img src={qrDataUrl} alt="QR Code de chamados" className="mb-3" style={{ width: size }} />
        )}
        <p className="text-sm font-semibold text-fg">Abrir chamado</p>
        <p className="text-xs text-fg-muted">{qrContent}</p>
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
