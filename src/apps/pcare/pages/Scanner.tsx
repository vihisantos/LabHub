import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrReader } from 'react-qr-reader'
import { usePCs } from '../hooks/usePCs'

export function Scanner() {
  const navigate = useNavigate()
  const { pcs } = usePCs()
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)
  const processedRef = useRef(false)

  function handleScan(text: string) {
    if (processedRef.current) return
    processedRef.current = true

    setScanResult(text)
    setScanning(false)

    const parts = text.split('/')
    if (parts.length === 2) {
      const [lab, pcNum] = parts
      const found = pcs.find((p) => p.labName === lab && p.pcNumber === pcNum)
      if (found) {
        navigate(`/pcare/pcs/${found.id}`)
        return
      }
    }
    setError('PC não encontrado para este QR Code')
  }

  function handleReset() {
    setScanResult(null)
    setError(null)
    setScanning(true)
    processedRef.current = false
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">QR Code</h2>

      <div className="mx-auto max-w-sm overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
        {scanning ? (
          <div className="relative">
            <QrReader
              onResult={(result, _err) => {
                if (result && !processedRef.current) {
                  handleScan(result.getText())
                }
              }}
              constraints={{ facingMode: 'environment' }}
              containerStyle={{ width: '100%' }}
              videoStyle={{ objectFit: 'cover' }}
            />
            <div className="pointer-events-none absolute inset-0 border-[3px] border-cyan-400/50" />
          </div>
        ) : (
          <div className="flex flex-col items-center px-4 py-16">
            {error ? (
              <>
                <span className="mb-2 text-4xl">❌</span>
                <p className="mb-1 text-sm text-red-400">{error}</p>
                <p className="mb-4 text-xs text-slate-500">Código lido: {scanResult}</p>
              </>
            ) : (
              <>
                <span className="mb-2 text-4xl">✅</span>
                <p className="mb-1 text-sm text-slate-300">QR Code lido!</p>
                <p className="mb-4 text-xs text-slate-500">{scanResult}</p>
              </>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm shadow-cyan-500/20 transition-all hover:shadow-md"
            >
              Escanear outro
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        Aponte a câmera para o QR Code do computador
      </p>
    </div>
  )
}
