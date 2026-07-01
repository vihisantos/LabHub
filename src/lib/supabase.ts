import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const hasConfig = url && anonKey

let pcareDb: ReturnType<typeof createClient> | null = null
let stockDb: ReturnType<typeof createClient> | null = null
let defaultDb: ReturnType<typeof createClient> | null = null

if (hasConfig) {
  try {
    pcareDb = createClient(url, anonKey, { db: { schema: 'pcare' as any } })
    stockDb = createClient(url, anonKey, { db: { schema: 'stock' as any } })
    defaultDb = createClient(url, anonKey)
  } catch (e) {
    console.warn('[Supabase] Failed to initialize:', e)
  }
}

export { pcareDb, stockDb, defaultDb }
