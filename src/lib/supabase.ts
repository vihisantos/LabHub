import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let defaultDb: SupabaseClient | null = null
let pcareDb: any = null
let stockDb: any = null

if (url && anonKey) {
  try {
    const client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
    defaultDb = client
    pcareDb = client.schema('pcare')
    stockDb = client.schema('stock')
  } catch (e) {
    console.warn('[Supabase] Failed to initialize:', e)
  }
}

export { pcareDb, stockDb, defaultDb }
