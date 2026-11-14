import { useCallback, useEffect, useRef, useState } from 'react'
import type { DriveFile, DriveSyncStatus } from './useDriveSync'

/**
 * Mídia da pasta do Drive para o modo TV Ambiente.
 *
 * Fonte de verdade: o backend Tauri (drive-sync.json + armazenamento local
 * sincronizado), exatamente como o painel de manutenção e o VideoPlayer.
 * Contratos (src-tauri/src/drive_sync.rs):
 *   - `drive_sync_status` → `DriveSyncStatus` (camelCase: configured,
 *     folderPath, pendingDownloads, lastError…);
 *   - `sync_drive_content` → `LocalDriveFile[]` (`file_type` snake_case);
 *   - `list_synced_files` → fallback somente-leitura do storage local.
 *
 * Resiliência (mesma política do VideoPlayer):
 *   - sincroniza na montagem e a cada 30s;
 *   - em caso de falha parcial, preserva a lista atual via
 *     `list_synced_files` para não interromper a exibição — o erro real
 *     continua exposto em `error` para o banner da UI;
 *   - a lista só substitui a anterior quando muda de verdade (comparação por
 *     nome+caminho+tamanho), para não reiniciar a rotação a cada 30s.
 */
export function useAmbientDriveMedia() {
  const [files, setFiles] = useState<DriveFile[]>([])
  const [status, setStatus] = useState<DriveSyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const syncingRef = useRef(false)
  const initializedRef = useRef(false)

  /** Invoke do bridge Tauri. `args` é opcional (comandos sem parâmetros). */
  const invoke = <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
    window.__TAURI__!.core.invoke<T>(cmd, args)

  const syncOnce = useCallback(async (showLoading: boolean) => {
    if (!window.__TAURI__) {
      setError('A TV Ambiente requer o app nativo da TV com a pasta do Drive sincronizada.')
      setLoading(false)
      return
    }
    if (syncingRef.current) return
    syncingRef.current = true
    if (showLoading) setLoading(true)

    const failMsg = (e: unknown) =>
      e instanceof Error && e.message ? e.message : String(e ?? 'Falha ao sincronizar a pasta do Drive')

    try {
      const st = await invoke<DriveSyncStatus>('drive_sync_status')
      setStatus(st && typeof st === 'object' ? st : null)

      const synced = await invoke<DriveFile[]>('sync_drive_content')
      const next = Array.isArray(synced)
        ? synced.filter((f) => f && (f.file_type === 'video' || f.file_type === 'image'))
        : []
      setFiles((prev) => (sameMediaList(prev, next) ? prev : next))
      setError(null)
      initializedRef.current = true
    } catch (e) {
      const message = failMsg(e)
      /* Falha parcial/nova: preserva a rotação com o storage local */
      try {
        const listed = await invoke<DriveFile[]>('list_synced_files')
        const next = Array.isArray(listed)
          ? listed.filter((f) => f && (f.file_type === 'video' || f.file_type === 'image'))
          : []
        if (next.length > 0) {
          setFiles((prev) => (sameMediaList(prev, next) ? prev : next))
          setError((prev) => prev ?? message)
        } else if (initializedRef.current) {
          /* Storage vazio MAS já houve sincronização válida antes: não zera a
           * rotação por uma falha transitória (mesma política do VideoPlayer).
           * Se a pasta foi realmente esvaziada, o próximo sync bem-sucedido
           * devolve [] e o estado vazio honesto aparece. */
          setError((prev) => prev ?? message)
        } else {
          setError(message)
        }
      } catch {
        if (!initializedRef.current) setError(message)
      }
    } finally {
      syncingRef.current = false
      if (showLoading) setLoading(false)
    }
  }, [])

  /* ── Dev: pasta apontada pelo .env (VITE_DRIVE_FOLDER) ─────────────────
   * Em DEV, se o backend ainda não tem pasta configurada e o .env aponta
   * uma pasta local, ela é configurada ANTES da primeira sincronização —
   * sem isso, cada máquina nova precisaria passar pelo menu de manutenção
   * (Ctrl+Alt+K → selecionar pasta) só para ver a TV Ambiente rodando.
   * NUNCA sobrescreve uma pasta já escolhida pelo operador. */
  const bootstrap = useCallback(async () => {
    if (window.__TAURI__ && import.meta.env.DEV) {
      const folder = (import.meta.env.VITE_DRIVE_FOLDER as string | undefined)?.trim()
      if (folder) {
        try {
          const status = await invoke<DriveSyncStatus>('drive_sync_status')
          if (!status?.configured) {
            // Em ambiente dev, assumimos conta confirmada automaticamente
            // Para produção, o fluxo de admin deve ser usado
            await invoke<DriveSyncStatus>('configure_drive_folder', { 
              folder_path: folder, 
              account_confirmed: true 
            })
          }
        } catch (e) {
          /* Erro real da configuração (ex.: pasta inexistente) vem à tela
           * antes de qualquer sincronização — não fica escondido. */
          setError(e instanceof Error && e.message ? e.message : String(e))
          setLoading(false)
          return
        }
      }
    }
    await syncOnce(true)
  }, [syncOnce])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!cancelled) await bootstrap()
    }
    void run()
    const timer = window.setInterval(() => { void syncOnce(false) }, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [bootstrap, syncOnce])

  return {
    files,
    videos: files.filter((f) => f.file_type === 'video'),
    images: files.filter((f) => f.file_type === 'image'),
    status,
    loading,
    error,
    sync: syncOnce,
  }
}

/** Duas listas representam a mesma rotação quando todo arquivo coincide. */
export function sameMediaList(a: DriveFile[], b: DriveFile[]): boolean {
  if (a.length !== b.length) return false
  const key = (f: DriveFile) => `${f.name}|${f.path}|${f.size}`
  const setB = new Set(b.map(key))
  return a.every((f) => setB.has(key(f)))
}

/** Fisher–Yates puro (fonte de aleatoriedade injetada para testes). */
export function shuffledIndices(length: number, random: () => number = Math.random): number[] {
  const indices = Array.from({ length }, (_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices
}
