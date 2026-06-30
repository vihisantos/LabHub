const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars')
}

function createClient(url, key) {
  const baseUrl = `${url}/rest/v1`

  function api(path, options = {}) {
    const fullUrl = `${baseUrl}${path}`
    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    return fetch(fullUrl, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: options.signal || controller.signal,
    }).then(async (res) => {
      clearTimeout(timeout)
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Supabase error: ${res.status} — ${fullUrl}${body ? ' | ' + body.slice(0, 200) : ''}`)
      }
      return res
    }).catch((err) => {
      clearTimeout(timeout)
      throw err
    })
  }

      return {
        from(table) {
          return {
            async select({ select = '*', order, filters } = {}) {
              const params = new URLSearchParams({ select })
              if (order) params.set('order', order)
              if (filters) {
                filters.forEach(({ field, op, value }) => {
                  params.append(field, `${op}.${value}`)
                })
              }
              const qs = params.toString()
              const res = await api(`/${table}${qs ? '?' + qs : ''}`)
              return { data: await res.json(), error: null }
            },

            async insert(values) {
              const res = await api(`/${table}`, {
                method: 'POST',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify(values),
              })
              return { data: await res.json(), error: null }
            },

            async update(values, match) {
              const filters = Object.entries(match)
                .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
                .join('&')
              const res = await api(`/${table}?${filters}`, {
                method: 'PATCH',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify(values),
              })
              return { data: await res.json(), error: null }
            },

            async delete(match) {
              const filters = Object.entries(match)
                .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
                .join('&')
              await api(`/${table}?${filters}`, { method: 'DELETE' })
              return { data: null, error: null }
            },

            async deleteWhere(filters) {
              const qs = filters
                .map(({ field, op, value }) => `${field}=${op}.${encodeURIComponent(value)}`)
                .join('&')
              await api(`/${table}?${qs}`, { method: 'DELETE' })
              return { data: null, error: null }
            },
          }
        },
      }
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function cleanupOldCancelledTablets() {
  try {
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('tablet_reservations').deleteWhere([
      { field: 'status', op: 'eq', value: 'cancelada' },
      { field: 'horario_inicio', op: 'lt', value: seteDiasAtras },
    ])
  } catch (err) {
    console.error('Erro ao limpar reservas antigas:', err)
  }
}
