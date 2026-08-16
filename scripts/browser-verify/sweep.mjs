/**
 * Verificação no browser: loga com as credenciais salvas (signup.mjs) e confere
 * que a aba ativa do bottom nav muda corretamente em todas as rotas dos apps.
 * Gera screenshots em test-results/sweep/.
 *
 * Uso: node scripts/browser-verify/sweep.mjs
 * Env: BASE_URL (default http://localhost:5173)
 */
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const [username, password] = readFileSync('.playwright-creds', 'utf8').trim().split(';')
mkdirSync('test-results/sweep', { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

const failures = []

/** Abas ativas no LiquidBottomNav (classe text-indigo-500 dentro do nav). */
async function activeLiquidTabs() {
  return page.$$eval(
    'nav[aria-label="Navegação principal"] button.text-indigo-500',
    (btns) => btns.map((b) => (b.textContent || '').trim()),
  )
}

/** Aba ativa no Navbar do ReservaLab (mobile: cor indigo inline). */
async function activeReservaLabTab() {
  return page.$$eval(
    'div.bottom-navbar button',
    (btns) => {
      const active = btns.filter((b) => {
        const color = getComputedStyle(b).color
        return color === 'rgb(99, 102, 241)'
      })
      return active.map((b) => (b.textContent || '').trim())
    },
    10,
  ).catch(() => [])
}

async function checkRoutes(appLabel, routes, getActive) {
  for (const [route, expected] of routes) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('nav[aria-label="Navegação principal"], div.bottom-navbar', { timeout: 30000 })
      await page.waitForTimeout(800) // deixa o React renderizar/finalizar transições
      const active = await getActive()
      const ok = active.length === 1 && active[0] === expected
      console.log(`${ok ? '✅' : '❌'} ${appLabel.padEnd(10)} ${route.padEnd(38)} ativo: ${JSON.stringify(active).padEnd(24)} esperado: ${expected}`)
      if (!ok) failures.push(`${appLabel} ${route}: ativo=${JSON.stringify(active)} esperado=${expected}`)
      await page.screenshot({ path: `test-results/sweep/${appLabel}${route.replaceAll('/', '_')}.png` })
    } catch (err) {
      console.log(`❌ ${appLabel.padEnd(10)} ${route.padEnd(38)} erro: ${err.message}`)
      failures.push(`${appLabel} ${route}: ${err.message}`)
    }
  }
}

const pcareRoutes = [
  ['/pc-care', 'Dashboard'],
  ['/pc-care/assets', 'Ativos'],
  ['/pc-care/assets/new', 'Ativos'],
  ['/pc-care/pcs', 'Ativos'],
  ['/pc-care/parts', 'Estoque'],
  ['/pc-care/parts/consolidado', 'Consolidado'],
  ['/pc-care/maintenance', 'Manutenção'],
  ['/pc-care/qr', 'QR Code'],
  ['/pc-care/settings', 'Config'],
]

const stockRoutes = [
  ['/stock', 'Dashboard'],
  ['/stock/items', 'Estoque'],
  ['/stock/entry-exit', 'Ent/Sai'],
  ['/stock/movements', 'Mov.'],
  ['/stock/kits', 'Kits'],
  ['/stock/qr', 'QR'],
  ['/general-stock/items', 'Estoque'],
]

const chamadosRoutes = [
  ['/chamados', 'Dashboard'],
  ['/chamados/sla', 'Dashboard'],
  ['/chamados/tickets', 'Chamados'],
  ['/chamados/reports', 'Relatórios'],
  ['/chamados/qr', 'QR Code'],
]

const reservaLabRoutes = [
  ['/reservalab', 'Reservas'],
  ['/reservalab/dashboard', 'Dashboard'],
  ['/reservalab/tablets', 'Tablets'],
]

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('nome.escolhido').fill(username)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click()

  // Após login: launcher (/) ou workspace gate — espera sair da tela de login
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })
  // O gate de workspace renderiza um instante depois da navegação — espera
  // estabilizar antes de checar, senão a seleção é pulada e cada rota reabre o gate.
  await page.waitForTimeout(4000)
  console.log(`✅ Login OK como ${username}@labhub.com — URL: ${page.url()}`)

  // Gate de seleção de workspace: marca "Manter preferência" (persistir entre
  // recargas) e escolhe um workspace com os apps habilitados.
  // Anhembi Mooca tem pc-care/stock/reservalab/tv desativados.
  const gate = page.locator('text=Escolha seu workspace')
  if (await gate.count()) {
    await page.getByText('Manter preferência').click()
    const card = page.locator('div.grid [role="button"]').filter({ hasText: 'Anhembi Piracicaba' })
    const target = (await card.count()) ? card.first() : page.locator('div.grid [role="button"]').first()
    await target.click()
    await page.waitForSelector('text=Escolha seu workspace', { state: 'detached', timeout: 10000 })
  }

  await checkRoutes('PC Care', pcareRoutes, activeLiquidTabs)
  await checkRoutes('Estoque', stockRoutes, activeLiquidTabs)
  await checkRoutes('Chamados', chamadosRoutes, activeLiquidTabs)
  await checkRoutes('ReservaLab', reservaLabRoutes, activeReservaLabTab)

  await page.screenshot({ path: 'test-results/sweep/00-login.png', fullPage: true })
} catch (err) {
  console.error('❌ Erro geral:', err.message)
  await page.screenshot({ path: 'test-results/sweep/00-error.png', fullPage: true })
  failures.push(`geral: ${err.message}`)
} finally {
  await browser.close()
}

console.log('\n--- Resultado ---')
if (failures.length === 0) {
  console.log('🎉 Todas as rotas com a aba ativa correta!')
} else {
  console.log(`❌ ${failures.length} falha(s):`)
  for (const f of failures) console.log('  -', f)
  process.exitCode = 1
}
