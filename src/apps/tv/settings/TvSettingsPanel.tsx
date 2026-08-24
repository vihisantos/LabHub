import { useCallback, useEffect, useState } from 'react'

import type { AppSettingsPanelProps } from '../../../core/appSettings/types'
import { appSettingsService } from '../../../core/appSettings/service'
import { defaultDb as supabase } from '../../../lib/supabase'
import { icons } from '../../../lib/icons'
import { tvApi } from '../utils/apiBase'
import {
  TV_REFRESH_MAX,
  TV_REFRESH_MIN,
  clampRefreshInterval,
  validateTvSettings,
} from './definition'
import type { TvAppSettings, TvSourcePreview } from './types'

const inputClass =
  'w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg placeholder:text-fg-dim focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-50'
const labelClass = 'mb-1.5 block text-xs font-semibold text-fg-muted'

type TestPhase =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'preview'; preview: TvSourcePreview }
  | { kind: 'error'; message: string }

/** Painel de configuração da TV Corporativa (slot SettingsPanel do shell genérico). */
export function TvSettingsPanel({ appId }: AppSettingsPanelProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [testPhase, setTestPhase] = useState<TestPhase>({ kind: 'idle' })

  const [sourceEnabled, setSourceEnabled] = useState(false)
  const [url, setUrl] = useState('')
  const [sheetName, setSheetName] = useState('')
  const [semester, setSemester] = useState('')
  const [endDate, setEndDate] = useState('')
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState(300)
  const [weatherCities, setWeatherCities] = useState('')
  const [tickerLabel, setTickerLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    appSettingsService
      .getSettings<TvAppSettings>(appId)
      .then((settings) => {
        if (cancelled) return
        setSourceEnabled(settings.eventSource.enabled)
        setUrl(settings.eventSource.url)
        setSheetName(settings.eventSource.sheetName ?? '')
        setSemester(settings.period.semester ?? '')
        setEndDate(settings.period.endDate ?? '')
        setRefreshIntervalSeconds(settings.display.refreshIntervalSeconds)
        setWeatherCities((settings.display.weatherCities ?? []).join(', '))
        setTickerLabel(settings.display.tickerLabel ?? '')
        setSavedAt(settings.syncedAt ?? null)
      })
      .catch(() => {
        if (!cancelled) setLoadError('Não foi possível carregar a configuração')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [appId])

  const buildSettings = useCallback(
    (syncedAt?: string): TvAppSettings => ({
      eventSource: {
        enabled: sourceEnabled,
        type: 'sharepoint_excel',
        url: url.trim(),
        ...(sheetName.trim() ? { sheetName: sheetName.trim() } : {}),
      },
      period: {
        ...(semester.trim() ? { semester: semester.trim() } : {}),
        ...(endDate.trim() ? { endDate: endDate.trim() } : {}),
      },
      display: {
        refreshIntervalSeconds: clampRefreshInterval(refreshIntervalSeconds),
        ...(weatherCities.trim()
          ? {
              weatherCities: weatherCities
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean),
            }
          : {}),
        ...(tickerLabel.trim() ? { tickerLabel: tickerLabel.trim() } : {}),
      },
      ...(syncedAt ? { syncedAt } : {}),
    }),
    [
      sourceEnabled,
      url,
      sheetName,
      semester,
      endDate,
      refreshIntervalSeconds,
      weatherCities,
      tickerLabel,
    ],
  )

  const handleSave = useCallback(async () => {
    setSaveError(null)
    setSaving(true)
    try {
      const candidate = buildSettings(new Date().toISOString())
      // Valida ANTES de gravar — patch inválido não sai daqui.
      validateTvSettings(candidate)
      const saved = await appSettingsService.upsertSettings<TvAppSettings>(appId, candidate)
      setSavedAt(saved.syncedAt ?? candidate.syncedAt ?? null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar configuração')
    } finally {
      setSaving(false)
    }
  }, [appId, buildSettings])

  const handleTestSource = useCallback(async () => {
    setTestPhase({ kind: 'running' })
    try {
      if (!supabase) throw new Error('Supabase não configurado')
      const { data: sessData } = await supabase.auth.getSession()
      const token = sessData.session?.access_token
      if (!token) throw new Error('Sessão ausente — faça login novamente')

      const res = await fetch(tvApi('/api/tv/source/fetch'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || !body.ok) {
        throw new Error(
          typeof body.error === 'string' ? body.error : `Erro na requisição (${res.status})`,
        )
      }
      setTestPhase({ kind: 'preview', preview: body as unknown as TvSourcePreview })
    } catch (err) {
      setTestPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Erro ao testar fonte',
      })
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-3 py-2" data-testid="tv-panel-loading">
        <div className="h-9 animate-pulse rounded-xl bg-input" />
        <div className="h-9 animate-pulse rounded-xl bg-input" />
        <div className="h-9 w-2/3 animate-pulse rounded-xl bg-input" />
      </div>
    )
  }

  if (loadError) {
    return <p className="py-2 text-sm text-red-500">{loadError}</p>
  }

  const preview = testPhase.kind === 'preview' ? testPhase.preview : null
  const phaseError = testPhase.kind === 'error' ? testPhase.message : null

  return (
    <div className="space-y-5 py-1">
      {/* ── Fonte ── */}
      <section aria-label="Fonte de eventos">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-dim">Fonte</h4>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2.5">
          <span className="text-sm font-medium text-fg">Fonte externa de eventos</span>
          <input
            type="checkbox"
            role="switch"
            checked={sourceEnabled}
            onChange={(e) => setSourceEnabled(e.target.checked)}
            aria-label="Habilitar fonte externa"
            data-testid="tv-source-toggle"
            className="h-4 w-4 accent-indigo-500"
          />
        </label>

        <div className="mt-3">
          <label htmlFor="tv-url" className={labelClass}>
            URL da planilha (link anônimo SharePoint/OneDrive){sourceEnabled ? ' *' : ''}
          </label>
          <input
            id="tv-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://exemplo.sharepoint.com/.../planilha.xlsx?download=1"
            disabled={!sourceEnabled}
            data-testid="tv-url-input"
            className={inputClass}
          />
        </div>

        <div className="mt-3">
          <label htmlFor="tv-sheet" className={labelClass}>
            Nome da aba (opcional)
          </label>
          <input
            id="tv-sheet"
            type="text"
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            placeholder="Primeira aba, se vazio"
            disabled={!sourceEnabled}
            className={inputClass}
          />
        </div>
      </section>

      {/* ── Período ── */}
      <section aria-label="Período">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-dim">Período</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tv-semester" className={labelClass}>
              Semestre
            </label>
            <input
              id="tv-semester"
              type="text"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              placeholder="Ex.: 26/2"
              maxLength={20}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="tv-end-date" className={labelClass}>
              Data final
            </label>
            <input
              id="tv-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* ── Exibição ── */}
      <section aria-label="Exibição">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-dim">Exibição</h4>
        <div>
          <label htmlFor="tv-refresh" className={labelClass}>
            Intervalo de atualização ({TV_REFRESH_MIN}–{TV_REFRESH_MAX}s)
          </label>
          <input
            id="tv-refresh"
            type="number"
            min={TV_REFRESH_MIN}
            max={TV_REFRESH_MAX}
            value={refreshIntervalSeconds}
            onChange={(e) => setRefreshIntervalSeconds(parseInt(e.target.value, 10) || 0)}
            onBlur={() =>
              setRefreshIntervalSeconds(clampRefreshInterval(refreshIntervalSeconds))
            }
            data-testid="tv-refresh-input"
            className={inputClass}
          />
        </div>
        <div className="mt-3">
          <label htmlFor="tv-cities" className={labelClass}>
            Cidades do clima (separadas por vírgula)
          </label>
          <input
            id="tv-cities"
            type="text"
            value={weatherCities}
            onChange={(e) => setWeatherCities(e.target.value)}
            placeholder="Ex.: Piracicaba, Campinas"
            className={inputClass}
          />
        </div>
        <div className="mt-3">
          <label htmlFor="tv-ticker" className={labelClass}>
            Texto do ticker
          </label>
          <input
            id="tv-ticker"
            type="text"
            value={tickerLabel}
            onChange={(e) => setTickerLabel(e.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </div>
      </section>

      {(saveError || phaseError) && (
        <p role="alert" className="text-xs text-red-500" data-testid="tv-panel-error">
          {saveError ?? phaseError}
        </p>
      )}

      {preview && (
        <div
          role="status"
          data-testid="tv-preview"
          className={`rounded-xl border px-3 py-2.5 text-xs ${
            preview.freshness === 'stale'
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          <p className="font-medium">
            {preview.validCount} eventos encontrados, {preview.ignoredCount} ignorados.
          </p>
          {preview.freshness === 'stale' ? (
            <p className="mt-0.5">
              Não foi possível atualizar. Exibindo última sincronização válida.
            </p>
          ) : null}
          <p className="mt-0.5 text-fg-muted">
            Última sincronização:{' '}
            {new Date(preview.syncedAt).toLocaleString('pt-BR')}
          </p>
          {preview.warning && <p className="mt-0.5">{preview.warning}</p>}
        </div>
      )}

      {savedAt && !preview && (
        <p className="text-xs text-fg-dim" data-testid="tv-saved-at">
          Última sincronização: {new Date(savedAt).toLocaleString('pt-BR')}
        </p>
      )}

      <div className="flex flex-col gap-3 pt-1 sm:flex-row-reverse">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          data-testid="tv-save-button"
          className="flex-1 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50 sm:flex-none sm:px-8"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={handleTestSource}
          disabled={testPhase.kind === 'running'}
          data-testid="tv-test-button"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-input disabled:opacity-50"
        >
          {testPhase.kind === 'running' ? (
            <>
              <icons.ui.refresh size={14} className="animate-spin" />
              Testando…
            </>
          ) : (
            <>
              <icons.ui.refresh size={14} />
              Testar fonte agora
            </>
          )}
        </button>
      </div>
    </div>
  )
}
