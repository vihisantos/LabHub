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
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OUT = 'docs/chamados-demo/screenshots'
mkdirSync(OUT, { recursive: true })

const MOBILE_W = 390
const MOBILE_H = 844

const T1 = '3af0601a-a2b9-50ad-a256-f7ef8c8649b3'          // em_atendimento (STAR)
const T15 = '903d5efc-c535-54e6-936e-271e6b7fd10b'         // em_espera (issue #367)
const T16 = '003ee222-031f-57e2-a42f-d330603b30eb'         // indeferido (issue #367)
const TOKEN_ESPERA = 'DEMO-ESPERA-2026'
const TOKEN_INDEFERIDO = 'DEMO-INDEFERIDO-2026'

// Credenciais do usuário de demonstração — nunca versionadas. Segue a convenção
// dos outros scripts de browser-verify: arquivo `.playwright-creds` (gitignored)
// no formato `usuario;senha`, ou variáveis de ambiente DEMO_USER / DEMO_PASS.
let DEMO_USER = process.env.DEMO_USER || ''
let DEMO_PASS = process.env.DEMO_PASS || ''
try {
  const [u, p] = readFileSync('.playwright-creds', 'utf8').trim().split(';')
  DEMO_USER = DEMO_USER || u
  DEMO_PASS = DEMO_PASS || p
} catch {
  /* arquivo ausente — cai para as variáveis de ambiente */
}
if (!DEMO_USER || !DEMO_PASS) {
  console.error('Credenciais ausentes: crie .playwright-creds (usuario;senha) ou defina DEMO_USER/DEMO_PASS.')
  process.exit(1)
}

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

async function closeOverlays(page) {
  // Fecha modais abertos por capturas anteriores. Navegar para a MESMA rota
  // (pushState + popstate) não remonta o componente, então o modal de motivo
  // do passo anterior continuaria aberto e interceptaria os cliques.
  const cancel = page.locator('button:has-text("Cancelar")').first()
  if (await cancel.isVisible({ timeout: 1200 }).catch(() => false)) {
    await cancel.click().catch(() => {})
    await page.waitForTimeout(600)
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

  // Fallback: garante preferência persistida mesmo sem o gate. O id do usuário é
  // derivado da própria sessão (auth token do Supabase) — não é hardcoded, o que
  // mantém o script portável entre ambientes de demonstração.
  await page.evaluate(() => {
    let uid = ''
    try {
      const sbKey = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      const obj = JSON.parse(localStorage.getItem(sbKey) || '{}')
      uid = obj?.user?.id || ''
      if (!uid) {
        const tok = obj?.access_token || obj?.current_session?.access_token || ''
        if (tok) {
          const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
          uid = payload.sub || ''
        }
      }
    } catch {}
    if (uid && !localStorage.getItem(`labhub_workspace_preference_${uid}`)) {
      try {
        const ws = JSON.parse(localStorage.getItem('labhub_workspaces_cache') || '[]')
        const found = ws.find((w) => w.slug === 'demo-chamados') || ws[0]
        if (found) localStorage.setItem(`labhub_workspace_preference_${uid}`, found.id)
      } catch {}
    }
  })

  await dismissTour(page)
  internal = { ctx, page }
  return internal
}

/*
 * Nota (#369): o app carrega os chamados por conta própria via
 * `GET /api/chamados` (autenticado). Não é preciso injetar nada em IndexedDB;
 * a injeção anterior era um workaround para uma API quebrada e causava hangs.
 */

async function navigateToRoute(page, route) {
  // Navegação SPA (sem reload). `page.goto` NÃO pode ser usado nas rotas
  // internas: no boot o AuthProvider publica `loading=false` antes de restaurar
  // a sessão persistida, o AuthGuard vê `user=null` por um instante, redireciona
  // para /login e o LoginPage manda o usuário autenticado para /. O deep link se
  // perde (a captura caía na Home). `pushState` + `popstate` navega pelo React
  // Router (BrowserRouter) sem remontar os providers — sessão e workspace ficam.
  await page.evaluate((r) => {
    window.history.pushState({}, '', r)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, route).catch(() => {})
  await page.waitForTimeout(2000)
  return (await page.url()).includes(route)
}

async function openInternal(route) {
  const { ctx, page } = await ensureInternal()
  await closeOverlays(page)
  await navigateToRoute(page, route)
  await page.waitForTimeout(2500)
  await dismissTour(page)
  return { ctx, page }
}

async function openPublic(route, waitPattern) {
  const ctx = await browser.newContext({ viewport: { width: MOBILE_W, height: MOBILE_H } })
  const page = await ctx.newPage()
  const token = new URLSearchParams(route.split('?')[1] || '').get('token') || ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    await goto(page, `${BASE}${route}`)
    if (await waitForText(page, waitPattern, { timeout: 15000 })) {
      console.log(`  [${route}] content: OK`)
      return { ctx, page }
    }
    // Fallback: o deep link ?token= é consumido por um `replaceState` dentro do
    // initializer do TrackPage; em carga fria (chunk lazy + StrictMode) o token
    // pode não ser lido e a página fica no estado vazio. Reproduz o fluxo real
    // do professor: digitar o código de acompanhamento e buscar.
    if (token) {
      const input = page.locator('input[placeholder="Código de acompanhamento"]')
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.fill(token).catch(() => {})
        await page.locator('button:has-text("Buscar")').click().catch(() => {})
        if (await waitForText(page, waitPattern, { timeout: 15000 })) {
          console.log(`  [${route}] content: OK (via código)`)
          return { ctx, page }
        }
      }
    }
    console.log(`  [${route}] content: tentativa ${attempt} sem o texto esperado`)
    await page.waitForTimeout(1500)
  }
  console.log(`  [${route}] content: TIMEOUT`)
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
    const { page } = await openInternal(`/chamados/tickets/${T1}`)
    await waitForText(page, 'Em espera|Indeferir')
    await shot(page, '12-em-espera-acoes')
  }

  console.log('13 Modal Colocar em espera')
  {
    const { page } = await openInternal(`/chamados/tickets/${T1}`)
    await waitForText(page, 'Em espera|Indeferir')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)
    await firstOpenAction(page, /Em espera/)
    await waitForText(page, 'Aguardando|Por que|motivo|Motivo').catch(() => {})
    await shot(page, '13-modal-colocar-em-espera')
  }

  console.log('14 Modal Indeferir chamado')
  {
    const { page } = await openInternal(`/chamados/tickets/${T1}`)
    await waitForText(page, 'Em espera|Indeferir')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)
    await firstOpenAction(page, /Indeferir/)
    await waitForText(page, 'Aguardando|Por que|motivo|Motivo').catch(() => {})
    await shot(page, '14-modal-indeferir')
  }

  console.log('15 Estado Em espera')
  {
    const { page } = await openInternal(`/chamados/tickets/${T15}`)
    await waitForText(page, 'Em espera —')
    await shot(page, '15-chamado-em-espera')
  }

  console.log('16 Estado Indeferido')
  {
    const { page } = await openInternal(`/chamados/tickets/${T16}`)
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