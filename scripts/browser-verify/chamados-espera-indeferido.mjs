/**
 * Captura de screenshots do fluxo Em espera / Indeferimento (issue #369).
 *
 * Evidência visual das ações novas da issue #367 no modulo Chamados:
 *   - botoes "Em espera" / "Indeferir" no detalhe operacional
 *   - modal de motivo obrigatorio (Em espera / Indeferir)
 *   - estado em_espera (card violeta + "Retomar atendimento")
 *   - estado indeferido (card vermelho "CHAMADO INDEFERIDO")
 *   - acompanhamento publico por codigo (em espera e indeferido)
 *   - pagina de resultado do indeferimento ao professor
 *
 * Depende do seed com os tickets #15 (em_espera) e #16 (indeferido):
 *   python scripts/seed_chamados_demo.py
 *
 * Uso:
 *   BASE_URL=http://localhost:5173 node scripts/browser-verify/chamados-espera-indeferido.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OUT = 'docs/chamados-demo/screenshots'
mkdirSync(OUT, { recursive: true })

const MOBILE_W = 390
const MOBILE_H = 844

const T1 = '3af0601a-a2b9-50ad-a256-f7ef8c8649b3'          // em_atendimento (STAR)
const T15 = '903d5efc-c535-54e6-936e-271e6b7fd10b'         // em_espera (issue #367)
const T16 = '003ee222-031f-57e2-a42f-d330603b30eb'         // indeferido (issue #367)
const WS_SLUG = 'demo-chamados'
const DEMO_USER = 'demo-screenshots'
const DEMO_PASS = 'Demo2026Screenshots!'
const DEMO_USER_ID = '31854701-603b-4137-b596-82b5ded2097d'
const TOKEN_ESPERA = 'DEMO-ESPERA-2026'
const TOKEN_INDEFERIDO = 'DEMO-INDEFERIDO-2026'
const PREF_KEY = `labhub:workspace:pref:${DEMO_USER_ID}`

console.log('=== Chamados — Em espera / Indeferimento (screenshots) ===')
console.log(`BASE: ${BASE} | Viewport: ${MOBILE_W}x${MOBILE_H}\n`)

let internal = null // { ctx, page } compartilhado entre capturas internas

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

async function waitForText(page, pattern, { timeout = 30000 } = {}) {
  const re = new RegExp(pattern)
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const text = await page.evaluate(() => document.body?.innerText || '')
    if (re.test(text)) return true
    await page.waitForTimeout(400)
  }
  return false
}

async function dismissTour(page) {
  const skipBtn = page.locator('button:has-text("Pular")')
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click()
    await page.waitForTimeout(1000)
  }
}

async function ensureInternal() {
  if (internal) return internal
  const ctx = await browser.newContext({ viewport: { width: MOBILE_W, height: MOBILE_H } })
  const page = await ctx.newPage()

  console.log('  [internal] Login...')
  await goto(page, `${BASE}/login`)
  await page.locator('input').nth(0).fill(DEMO_USER)
  await page.locator('input').nth(1).fill(DEMO_PASS)
  await page.locator('button[type="submit"]').click()
  await page.waitForTimeout(6000)

  // Super admin passa pelo WorkspaceGate a cada sessão → seleciona com
  // "Manter preferência" para que navegações seguintes auto-entrem.
  if (await page.locator('text=Escolha seu workspace').isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('  [internal] WorkspaceGate → selecionando demo-chamados (com preferência)...')
    const persist = page.locator('button:has-text("Manter preferência")')
    if (await persist.isVisible({ timeout: 3000 }).catch(() => false)) await persist.click()
    const card = page.locator('button, [role="button"]', { hasText: /Campus Demo|campus demo|demo-chamados/ }).first()
    await card.click({ timeout: 15000 }).catch(async () => {
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('div,button')].find((e) =>
          e.innerText?.includes('Campus Demo') && e.getAttribute('role') === 'button')
        if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    })
    await page.waitForTimeout(4000)
  }

  // Fallback: garante preferência persistida mesmo sem o gate
  await page.evaluate((id) => {
    if (!localStorage.getItem(`labhub:workspace:pref:${id}`)) {
      try {
        const ws = JSON.parse(localStorage.getItem('labhub_workspaces_cache') || '[]')
        const found = ws.find((w) => w.slug === 'demo-chamados') || ws[0]
        if (found) localStorage.setItem(`labhub:workspace:pref:${id}`, found.id)
      } catch {}
    }
  }, DEMO_USER_ID)

  await dismissTour(page)
  internal = { ctx, page }
  return internal
}

const injectTickets = async (page) => {
  await page.evaluate(async () => {
    const sbKey = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
    if (!sbKey) return
    const token = sbKey ? JSON.parse(localStorage.getItem(sbKey) || '{}')?.current_session?.access_token : null
    if (!token) return
    const res = await fetch('/api/chamados', { headers: { Authorization: `Bearer ${token}` } })
    const { tickets } = await res.json()
    if (!tickets?.length) return
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('labhub')
      req.onsuccess = (e) => {
        const db = e.target.result
        const tx = db.transaction('collections', 'readwrite')
        const store = tx.objectStore('collections')
        const all = store.getAll()
        all.onsuccess = () => {
          const cols = all.result || []
          const i = cols.findIndex((c) => c.name === 'chamados')
          if (i !== -1) cols[i].items = tickets
          else cols.push({ name: 'chamados', items: tickets })
          store.clear()
          for (const c of cols) store.put(c)
          tx.oncomplete = resolve
          tx.onerror = reject
        }
      }
      req.onerror = reject
    })
  })
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.waitForTimeout(1500)
}

async function navigateToRoute(page, route, { tries = 4 } = {}) {
  for (let i = 0; i < tries; i++) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.waitForTimeout(1500)
    if ((await page.url()).includes(route)) return true
    await page.waitForTimeout(1000)
  }
  return false
}

async function openInternal(route) {
  const { ctx, page } = await ensureInternal()
  await navigateToRoute(page, route)
  await injectTickets(page)
  await navigateToRoute(page, route)
  await page.waitForTimeout(2500)
  await dismissTour(page)
  return { ctx, page }
}

async function openPublic(route, waitPattern) {
  const ctx = await browser.newContext({ viewport: { width: MOBILE_W, height: MOBILE_H } })
  const page = await ctx.newPage()
  await goto(page, `${BASE}${route}`)
  const ok = await waitForText(page, waitPattern)
  console.log(`  [${route}] content: ${ok ? 'OK' : 'TIMEOUT'}`)
  return { ctx, page }
}

async function firstOpenAction(page, name) {
  const btn = page.locator('button').filter({ hasText: name }).first()
  await btn.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {})
  await btn.click({ timeout: 15000 })
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })

try {
  console.log('\n--- INTERNAL (detalhe operacional) ---\n')

  console.log('12 Botoes de acao (Em espera / Indeferir)')
  {
    const { ctx, page } = await openInternal(`/chamados/tickets/${T1}`)
    await waitForText(page, 'Em espera|Indeferir')
    await shot(page, '12-em-espera-acoes')
  }

  console.log('13 Modal Colocar em espera')
  {
    const { ctx, page } = await openInternal(`/chamados/tickets/${T1}`)
    await waitForText(page, 'Em espera|Indeferir')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)
    await firstOpenAction(page, /Em espera/)
    await waitForText(page, 'Aguardando|Por que|motivo|Motivo').catch(() => {})
    await shot(page, '13-modal-colocar-em-espera')
  }

  console.log('14 Modal Indeferir chamado')
  {
    const { ctx, page } = await openInternal(`/chamados/tickets/${T1}`)
    await waitForText(page, 'Em espera|Indeferir')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)
    await firstOpenAction(page, /Indeferir/)
    await waitForText(page, 'Aguardando|Por que|motivo|Motivo').catch(() => {})
    await shot(page, '14-modal-indeferir')
  }

  console.log('15 Estado Em espera')
  {
    const { ctx, page } = await openInternal(`/chamados/tickets/${T15}`)
    await waitForText(page, 'Em espera —')
    await shot(page, '15-chamado-em-espera')
  }

  console.log('16 Estado Indeferido')
  {
    const { ctx, page } = await openInternal(`/chamados/tickets/${T16}`)
    await waitForText(page, 'CHAMADO INDEFERIDO')
    await shot(page, '16-chamado-indeferido')
  }

  console.log('\n--- PUBLIC (professor) ---\n')

  console.log('17 Acompanhar em espera (por codigo)')
  {
    const { ctx, page } = await openPublic(
      `/chamados-publico/track?token=${encodeURIComponent(TOKEN_ESPERA)}`,
      'Em espera —',
    )
    await shot(page, '17-acompanhar-em-espera')
    await ctx.close()
  }

  console.log('18 Acompanhar indeferido (por codigo)')
  {
    const { ctx, page } = await openPublic(
      `/chamados-publico/track?token=${encodeURIComponent(TOKEN_INDEFERIDO)}`,
      'CHAMADO INDEFERIDO',
    )
    await shot(page, '18-acompanhar-indeferido')
    await ctx.close()
  }

  console.log('19 Resultado indeferimento (pagina de sucesso)')
  {
    const { ctx, page } = await openPublic(
      `/chamados-publico/success/${T16}?token=${encodeURIComponent(TOKEN_INDEFERIDO)}`,
      'CHAMADO INDEFERIDO',
    )
    await shot(page, '19-resultado-indeferido')
    await ctx.close()
  }

  console.log('\n=== Done! ===')
} catch (err) {
  console.error('FATAL ERROR:', err.message)
  try {
    const pages = internal ? [internal.page] : browser.contexts().flatMap((c) => c.pages())
    const dump = await dumpButtons(pages[0])
    writeFileSync(`${OUT}/_error_buttons.json`, JSON.stringify(dump, null, 2))
    console.error('Buttons dumped to', `${OUT}/_error_buttons.json`)
  } catch {}
  console.error(err.stack)
} finally {
  await browser.close()
}

async function dumpButtons(page) {
  if (!page) return []
  return page.evaluate(() =>
    [...document.querySelectorAll('button')].map((x) => (x.innerText || '').trim().replace(/\n/g, ' ')),
  )
}