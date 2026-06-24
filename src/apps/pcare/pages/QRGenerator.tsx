import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { usePCs } from '../hooks/usePCs'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { EmptyState } from '../components/EmptyState'

interface QRItem {
  id: string
  label: string
  dataUrl: string
}

export function QRGenerator() {
  const navigate = useNavigate()
  const { pcs, loading } = usePCs()
  const [qrItems, setQrItems] = useState<QRItem[]>([])
  const [generating, setGenerating] = useState(true)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function generate() {
      setGenerating(true)
      const items: QRItem[] = []
      for (const pc of pcs) {
        const code = `${pc.labName}/${pc.pcNumber}`
        try {
          const dataUrl = await QRCode.toDataURL(code, {
            width: 300,
            margin: 2,
            color: { dark: '#1e293b', light: '#ffffff' },
          })
          items.push({ id: pc.id, label: `${pc.labName} — ${pc.pcNumber}`, dataUrl })
        } catch {
          // skip if generation fails
        }
      }
      setQrItems(items)
      setGenerating(false)
    }
    generate()
  }, [pcs])

  function handlePrint() {
    window.print()
  }

  if (loading || generating) return <LoadingSpinner />

  if (pcs.length === 0) {
    return (
      <EmptyState
        icon="🔲"
        title="Nenhum PC cadastrado"
        description="Adicione PCs primeiro para gerar QR Codes."
        action={{ label: 'Adicionar PC', onClick: () => navigate('/pcare/pcs/new') }}
      />
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/pcare/pcs')}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-200"
          >
            ←
          </button>
          <h2 className="text-xl font-semibold">QR Codes</h2>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
        >
          Imprimir
        </button>
      </div>

      <p className="mb-4 text-sm text-slate-400">
        {qrItems.length} QR Codes gerados. Use o scanner para identificar rapidamente cada PC.
      </p>

      <div
        ref={printRef}
        className="grid grid-cols-2 gap-4 print:grid-cols-4"
      >
        {qrItems.map((item) => (
          <div
            key={item.id}
            className="flex flex-col items-center rounded-xl border border-slate-700 bg-white p-4"
          >
            <img
              src={item.dataUrl}
              alt={item.label}
              className="mb-2 h-32 w-32"
            />
            <p className="text-center text-xs font-medium text-slate-800">
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
