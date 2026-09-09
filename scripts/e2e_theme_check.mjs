/**
 * E2E visual — ReservaLab segue o tema do app principal.
 * Alterna as classes dark/dim/light no <html> (mesmo mecanismo do themeStore)
 * e verifica tokens computados + screenshots.
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const EMAIL = 'e2e.usera@labhub.com'
const PASSWORD = 'E2ePass#A2026x!'
const outDir = 'screenshots/e2e-reservalab-theme'

const results = []
function record(step, ok, evidence) {
  results.push({ step, ok })
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step} :: ${String(evidence).slice(0, 160)}`)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })

  // ── Login (mesmo fluxo do e2e_reservalab_51) ──
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.locator('input').nth(0).fill(EMAIL.split('@')[0])
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 20000 })
  await page.waitForTimeout(2500)
  const skip = page.getByRole('button', { name: 'Pular' }).first()
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
    await page.waitForTimeout(800)
  }
  record('1. login', true, page.url())

  // Workspace: se o seletor aparecer, escolher e2e-ws-a
  const wsOption = page.getByText('E2E WS A', { exact: false }).first()
  if (await wsOption.isVisible().catch(() => false)) {
    await wsOption.click()
    await page.waitForTimeout(1000)
    const confirm = page.getByRole('button', { name: /confirmar|entrar/i }).first()
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
    await page.waitForTimeout(1500)
  }

  // ── ReservaLab via card do launcher (goto direto sofre race de auth) ──
  await page.getByText('ReservaLab', { exact: false }).first().click()
  await page.waitForTimeout(2500)
  if (!page.url().includes('/reservalab')) {
    record('2. entrar no reservalab', false, `card não navegou: ${page.url()}`)
    await browser.close()
    return
  }
  const tabletsTab = page.getByRole('button', { name: 'Tablets' }).first()
  if (await tabletsTab.isVisible().catch(() => false)) {
    await tabletsTab.click()
    await page.waitForTimeout(2000)
  }
  record('2. reservalab/tablets', page.url().includes('/reservalab/tablets'), page.url())

  // ── Alternância de tema (mesmo mecanismo do themeStore) ──
  const setTheme = async (t) => {
    await page.evaluate((theme) => {
      const root = document.documentElement
      root.classList.remove('dark', 'dim', 'light')
      if (theme !== 'none') root.classList.add(theme)
    }, t)
    await page.waitForTimeout(400)
  }
  const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  await setTheme('dark')
  record('3. dark: body rgb(0,0,0)', (await bodyBg()) === 'rgb(0, 0, 0)', await bodyBg())
  await page.screenshot({ path: `${outDir}/01-dark-tablets.png` })

  await setTheme('dim')
  record('4. dim: body rgb(26,27,46)', (await bodyBg()) === 'rgb(26, 27, 46)', await bodyBg())
  await page.screenshot({ path: `${outDir}/02-dim-tablets.png` })

  await setTheme('light')
  record('5. light: body rgb(250,250,250)', (await bodyBg()) === 'rgb(250, 250, 250)', await bodyBg())
  await page.screenshot({ path: `${outDir}/03-light-tablets.png` })

  // ── Dashboard nos dois extremos ──
  await setTheme('dark')
  await page.getByRole('button', { name: 'Dashboard' }).first().click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${outDir}/04-dark-dashboard.png`, fullPage: true })

  await setTheme('light')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/05-light-dashboard.png`, fullPage: true })

  // ── Reservas em dim ──
  await setTheme('dim')
  const reservasTab = page.getByRole('button', { name: 'Reservas' }).first()
  if (await reservasTab.isVisible().catch(() => false)) {
    await reservasTab.click()
    await page.waitForTimeout(2500)
  }
  await page.screenshot({ path: `${outDir}/06-dim-reservas.png`, fullPage: true })

  await browser.close()
  const fails = results.filter((r) => !r.ok).length
  console.log(fails === 0 ? 'ALL CHECKS OK' : `${fails} FAILURES`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
