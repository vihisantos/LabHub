// Remove a conta de teste do Supabase (auth.users + profiles + relacionadas)
// e a inscrição push fake do Redis.
// Uso: node scripts/browser-verify/cleanup-tester.mjs
import { readFileSync } from 'node:fs'

const env = readFileSync('.env', 'utf8')
const SUPABASE_URL = env.match(/^SUPABASE_URL=(.+)$/m)?.[1]?.trim()
const SERVICE_KEY = env.match(/^SUPABASE_SERVICE_KEY=(.+)$/m)?.[1]?.trim()
const UPSTASH_URL = env.match(/^UPSTASH_REDIS_REST_URL=(.+)$/m)?.[1]?.trim()
const UPSTASH_TOKEN = env.match(/^UPSTASH_REDIS_REST_TOKEN=(.+)$/m)?.[1]?.trim()

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL/SERVICE_KEY ausentes no .env')
  process.exit(1)
}

// ID da conta de teste (da inscrição push no Redis)
const TESTER_ID = process.argv[2] || 'd0ee7839-d6cf-4c14-8666-9780ce4c159d'

const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
const log = (label, ok, detail = '') =>
  console.log(`${ok ? 'OK ' : 'FALHA'} ${label}${detail ? ' — ' + detail : ''}`)

// 1. Redis: remove inscrições do tester (fake)
if (UPSTASH_URL && UPSTASH_TOKEN) {
  try {
    const res = await fetch(`${UPSTASH_URL}/smembers/push:subscribers`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    })
    const members = (await res.json()).result || []
    let removed = 0
    for (const raw of members) {
      let sub
      try {
        sub = JSON.parse(raw)
      } catch {
        continue
      }
      const isTester =
        (sub.user?.id === TESTER_ID) ||
        String(sub.endpoint || '').includes('fake-endpoint')
      if (isTester) {
        const qs = new URLSearchParams({ value: raw })
        await fetch(`${UPSTASH_URL}/srem/push:subscribers?${qs}`, {
          headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        })
        removed++
      }
    }
    log(`Redis: inscrições do tester removidas (${removed})`, true)
  } catch (e) {
    log('Redis: limpeza falhou', false, String(e))
  }
} else {
  console.log('SKIP Redis (sem UPSTASH no .env)')
}

// 2. profiles
try {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${TESTER_ID}`,
    { method: 'DELETE', headers: sbHeaders },
  )
  log(`profiles (id=${TESTER_ID})`, r.ok, r.ok ? '' : `${r.status} ${await r.text()}`)
} catch (e) {
  log('profiles: falhou', false, String(e))
}

// 3. auth.users (admin API)
try {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${TESTER_ID}`, {
    method: 'DELETE',
    headers: sbHeaders,
  })
  log(`auth.users (id=${TESTER_ID})`, r.ok, r.ok ? '' : `${r.status} ${await r.text()}`)
} catch (e) {
  log('auth.users: falhou', false, String(e))
}

// 4. notificações do usuário (tolerante a coluna ausente)
try {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/notifications?userId=eq.${TESTER_ID}`,
    { method: 'DELETE', headers: sbHeaders },
  )
  log('notifications (userId=tester)', r.ok, r.ok ? '' : `${r.status} ${await r.text()}`)
} catch (e) {
  console.log('SKIP notifications (tabela/coluna diferente):', String(e).slice(0, 80))
}

// 5. user_profiles (sync) — tolerante
try {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?userId=eq.${TESTER_ID}`,
    { method: 'DELETE', headers: sbHeaders },
  )
  log('user_profiles (userId=tester)', r.ok, r.ok ? '' : `${r.status} ${await r.text()}`)
} catch (e) {
  console.log('SKIP user_profiles:', String(e).slice(0, 80))
}

// 6. Arquivo de credenciais do playwright
try {
  const { rmSync, existsSync } = await import('node:fs')
  if (existsSync('.playwright-creds')) {
    rmSync('.playwright-creds')
    log('.playwright-creds removido', true)
  } else {
    console.log('SKIP .playwright-creds (não existe)')
  }
} catch (e) {
  console.log('SKIP .playwright-creds:', String(e).slice(0, 80))
}

console.log('\nLimpeza concluída.')
