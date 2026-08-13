import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { saveAs } from 'file-saver'
import { QrPoster } from '../components/QrPoster'
import { renderPosterPng } from '../utils/posterToPng'
import { useAppAccess } from '../../../core/permissions/usePermissions'
import { icons } from '../../../lib/icons'

export function UnitQR() {
  const navigate = useNavigate()
  const { canManageQr } = useAppAccess()

  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const qrContent = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/chamados-publico/new`
  }, [])

  useEffect(() => {
    if (!qrContent) return
    QRCode.toDataURL(qrContent, {
      width: 900,
      margin: 2,
      color: { dark: '#1e293b', light: '#ffffff' },
    }).then(setQrDataUrl)
  }, [qrContent])

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
    if (!qrContent || downloading) return
    setDownloading(true)
    try {
      const blob = await renderPosterPng(qrContent)
      saveAs(blob, 'qr-chamados-poster.png')
    } finally {
      setDownloading(false)
    }
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
          body * { visibility: hidden; }
          .qr-poster, .qr-poster * {
            visibility: visible;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .qr-poster {
            position: fixed;
            top: 0;
            left: 0;
            width: 210mm !important;
            height: 297mm !important;
            aspect-ratio: auto !important;
          }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>

      <div className="no-print rounded-xl bg-card p-4 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold text-fg">QR único de chamados</p>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          O professor escaneia o QR, escolhe a unidade (campus) e depois a sala. Um só QR para toda a escola —
          imprima o pôster e fixe nas salas.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {qrDataUrl ? (
          <QrPoster qrDataUrl={qrDataUrl} url={qrContent} />
        ) : (
          <div className="flex aspect-[210/297] items-center justify-center text-sm text-fg-dim">
            Gerando pôster...
          </div>
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
          disabled={downloading || !qrDataUrl}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <icons.ui.download size={16} />
          {downloading ? 'Gerando...' : 'Baixar pôster'}
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
