import { createClient } from '@supabase/supabase-js'
import { PostgrestClient } from '@supabase/postgrest-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let defaultDb: ReturnType<typeof createClient> | null = null
let pcareDb: PostgrestClient | null = null
let stockDb: PostgrestClient | null = null

if (url && anonKey) {
  try {
    defaultDb = createClient(url, anonKey)
    pcareDb = defaultDb.schema('pcare')
    stockDb = defaultDb.schema('stock')
  } catch (e) {
    console.warn('[Supabase] Failed to initialize:', e)
  }
}

export { pcareDb, stockDb, defaultDb }
