/**
 * Captura de screenshots do modulo Chamados (ambiente DEMO).
 *
 * O modulo Chamados e MOBILE-FIRST (max-w-lg, bottom nav).
 * Telas internas sao capturadas em resolucao de celular (390x844).
 *
 * Pre-requisitos:
 *   1. Dev server: npm run dev  (porta 5174)
 *   2. Flask backend: cd api && python app.py  (porta 5000)
 *   3. Demo data: python scripts/seed_chamados_demo.py
 *
 * Uso:
 *   BASE_URL=http://localhost:5174 node scripts/browser-verify/chamados-screenshots.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync, statSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const WS_SLUG = 'demo-chamados'
const OUT = 'docs/chamados-demo/screenshots'
mkdirSync(OUT, { recursive: true })

const MOBILE_W = 390
const MOBILE_H = 844

const T1 = '3af0601a-a2b9-50ad-a256-f7ef8c8649b3'
const T6 = '802162d6-b72f-5fea-b703-e38a325de638'
const DEMO_USER = 'demo-screenshots'
const DEMO_PASS = 'Demo2026Screenshots!'

console.log('=== Chamados Screenshot Capture ===')
console.log(`BASE: ${BASE} | Viewport: ${MOBILE_W}x${MOBILE_H}\n`)

async function shot(page, name, opts = {}) {
  const path = `${OUT}/${name}.png`
  await page.screenshot({ path, fullPage: opts.fullPage !== false, ...opts })
  const size = statSync(path).size
  const dims = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
  }))
  console.log(`  [OK] ${name}.png (${(size / 1024).toFixed(1)}KB, ${dims.w}x${dims.h})`)
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)
}

/**
 * Wait until data is visible on page (non-zero ticket counts or specific content).
 */
async function waitForData(page, { timeout = 45000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const ok = await page.evaluate(() => {
      const text = document.body?.innerText || ''
      if (text.includes('Verificando autentica')) return false
      // Non-zero ticket counts
      const m = text.match(/(\d+)\s*(Aberto|Chamado|Resolvido|Em atendimento|Ativos)/)
      if (m && parseInt(m[1]) > 0) return true
      // QR
      if (text.includes('QR') && document.querySelector('svg')) return true
      // SLA / Reports (hit API directly, should always load)
      if (text.includes('SLA de atendimento')) return true
      if (text.includes('Relat') && text.includes('Chamados')) return true
      // Ticket detail (not "not found")
      if ((text.includes('Laborat') || text.includes('Sala de Aula')) && !text.includes('encontrado')) return true
      return false
    })
    if (ok) return true
    await page.waitForTimeout(500)
  }
  return false
}

/**
 * Login, select workspace, navigate to route.
 * Forces pullRemote by dispatching 'online' event immediately.
 */
async function openInternal(route) {
  const ctx = await browser.newContext({ viewport: { width: MOBILE_W, height: MOBILE_H } })
  const page = await ctx.newPage()

  // Login
  console.log(`  [${route}] Login...`)
  await goto(page, `${BASE}/login`)
  await page.locator('input').nth(0).fill(DEMO_USER)
  await page.locator('input').nth(1).fill(DEMO_PASS)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(5000)

  // Dismiss tour
  const skipBtn = page.locator('button:has-text("Pular")')
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click()
    await page.waitForTimeout(1000)
  }

  // Ensure workspace
  const ws = await page.evaluate(() => localStorage.getItem('labhub_active_workspace'))
  if (ws !== WS_SLUG) {
    await page.evaluate((s) => localStorage.setItem('labhub_active_workspace', s), WS_SLUG)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(5000)
    const skip2 = page.locator('button:has-text("Pular")')
    if (await skip2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skip2.click()
      await page.waitForTimeout(1000)
    }
  }

  // Navigate
  console.log(`  [${route}] Navigate...`)
  await goto(page, `${BASE}${route}`)

  // Wait for ChamadosLayout header to be visible (confirms component mounted)
  console.log(`  [${route}] Waiting for layout...`)
  await page.locator('text=Chamados').first().waitFor({ timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)

  // Force data load: fetch tickets from API and inject into IndexedDB
  console.log(`  [${route}] Injecting data...`)
  await page.evaluate(async () => {
    // Get auth token from Supabase session
    const sbKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
    if (!sbKey) return
    const sbData = JSON.parse(localStorage.getItem(sbKey) || '{}')
    const token = sbData?.current_session?.access_token
    if (!token) return

    // Fetch tickets from Flask API
    const res = await fetch('/api/chamados', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const { tickets } = await res.json()
    if (!tickets?.length) return

    // Inject into IndexedDB (same store as createSyncService('chamados'))
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('labhub')
      req.onsuccess = (e) => {
        const db = e.target.result
        // Find the collections store and update 'chamados' collection
        const tx = db.transaction('collections', 'readwrite')
        const store = tx.objectStore('collections')
        const getAll = store.getAll()
        getAll.onsuccess = () => {
          const collections = getAll.result || []
          const idx = collections.findIndex(c => c.name === 'chamados')
          if (idx !== -1) {
            collections[idx].items = tickets
          } else {
            collections.push({ name: 'chamados', items: tickets })
          }
          // Clear and re-add all collections
          store.clear()
          for (const c of collections) {
            store.put(c)
          }
          tx.oncomplete = resolve
          tx.onerror = reject
        }
      }
      req.onerror = reject
    })
  })

  // Trigger React re-render by dispatching online event
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.waitForTimeout(2000)

  // If still zero, reload the page (IndexedDB now has data)
  const bodyText = await page.evaluate(() => document.body?.innerText || '')
  const hasZero = /\b0\b.*\b(Aberto|A caminho)\b/.test(bodyText)
  if (hasZero) {
    console.log(`  [${route}] Data not reflected, reloading...`)
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(5000)
  }

  console.log(`  [${route}] Waiting for data...`)
  await waitForData(page, { timeout: 15000 })

  const finalText = await page.evaluate(() => document.body?.innerText?.substring(0, 150) || '')
  console.log(`  [${route}] Content: ${finalText.replace(/\n/g, ' | ').substring(0, 120)}`)

  return { ctx, page }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })

try {
  console.log('--- PUBLIC ROUTES ---\n')

  console.log('02 Formulario publico')
  {
    const ctx = await browser.newContext({ viewport: { width: MOBILE_W, height: MOBILE_H } })
    const page = await ctx.newPage()
    await goto(page, `${BASE}/chamados-publico/new`)
    await waitForData(page)
    await shot(page, '02-formulario-publico', { fullPage: true })
    await ctx.close()
  }

  console.log('03 Acompanhamento')
  {
    const ctx = await browser.newContext({ viewport: { width: MOBILE_W, height: MOBILE_H } })
    const page = await ctx.newPage()
    await goto(page, `${BASE}/chamados-publico/track`)
    await waitForData(page)
    const input = page.locator('input').first()
    if (await input.isVisible({ timeout: 5000 }).catch(() => false)) {
      await input.fill('Ana Martins')
      const btn = page.locator('button').filter({ hasText: /buscar|search|procurar/i }).first()
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click()
      } else {
        await input.press('Enter')
      }
      await page.waitForTimeout(5000)
    }
    await shot(page, '03-acompanhamento', { fullPage: true })
    await ctx.close()
  }

  console.log('04 Feedback')
  {
    const ctx = await browser.newContext({ viewport: { width: MOBILE_W, height: MOBILE_H } })
    const page = await ctx.newPage()
    await goto(page, `${BASE}/chamados-publico/feedback/${T6}`)
    await waitForData(page)
    await shot(page, '04-feedback', { fullPage: true })
    await ctx.close()
  }

  console.log('\n--- INTERNAL ROUTES (mobile) ---\n')

  console.log('01b QR Code (interno)')
  {
    const { ctx, page } = await openInternal('/chamados/qr')
    await shot(page, '01-qr-code')
    await ctx.close()
  }

  console.log('05 Dashboard')
  {
    const { ctx, page } = await openInternal('/chamados')
    await shot(page, '05-dashboard')
    await ctx.close()
  }

  console.log('06 Lista')
  {
    const { ctx, page } = await openInternal('/chamados/tickets')
    await shot(page, '06-lista')
    await ctx.close()
  }

  console.log('07 Atendimento')
  {
    const { ctx, page } = await openInternal(`/chamados/tickets/${T1}`)
    await shot(page, '07-atendimento')
    await ctx.close()
  }

  console.log('08 SLA')
  {
    const { ctx, page } = await openInternal('/chamados/sla')
    await page.waitForTimeout(3000)
    await shot(page, '08-sla')
    await ctx.close()
  }

  console.log('09 Relatorios')
  {
    const { ctx, page } = await openInternal('/chamados/reports')
    await page.waitForTimeout(3000)
    await shot(page, '09-relatorios')
    await ctx.close()
  }

  console.log('10 Fluxo completo')
  {
    const { ctx, page } = await openInternal('/chamados')
    await shot(page, '10-fluxo-completo')
    await ctx.close()
  }

  console.log('11 Detalhe chamado')
  {
    const { ctx, page } = await openInternal(`/chamados/tickets/${T1}`)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(2000)
    await shot(page, '11-detalhe-chamado')
    await ctx.close()
  }

  console.log('\n=== Done! ===')

} catch (err) {
  console.error('FATAL ERROR:', err.message)
  console.error(err.stack)
} finally {
  await browser.close()
}
