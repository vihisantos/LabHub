/**
 * Captura visual isolada da timeline da Issue/PR #448.
 *
 * Gera exatamente um arquivo: screenshots/timeline-448.png
 * Não executa a suíte de screenshots nem altera dados do chamado.
 *
 * Pré-requisitos:
 *   - npm install (Playwright já é dependência do projeto)
 *   - aplicação e API disponíveis
 *   - credenciais demo e ID de chamado válidos
 *
 * Uso (PowerShell):
 *   $env:DEMO_USER="..."; $env:DEMO_PASS="..."; $env:TICKET_ID="..."
 *   node scripts/browser-verify/chamados-timeline-448.mjs
 *
 * Variáveis:
 *   DEMO_USER, DEMO_PASS e TICKET_ID são obrigatórias.
 *   BASE_URL e WORKSPACE_SLUG são opcionais.
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const required = ['DEMO_USER', 'DEMO_PASS', 'TICKET_ID']
const missing = required.filter((name) => !process.env[name]?.trim())
if (missing.length) {
  console.error(`Configure as variáveis obrigatórias: ${missing.join(', ')}`)
  process.exit(1)
}

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const USER = process.env.DEMO_USER
const PASS = process.env.DEMO_PASS
const WORKSPACE = process.env.WORKSPACE_SLUG || 'demo-chamados'
const TICKET_ID = process.env.TICKET_ID
const OUTPUT = resolve('screenshots/timeline-448.png')

const browser = await chromium.launch({ channel: 'chrome', headless: true })

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  })
  const page = await context.newPage()

  console.log(`Abrindo ambiente: ${BASE}`)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })

  await page.locator('input').nth(0).fill(USER)
  await page.locator('input').nth(1).fill(PASS)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 })

  const activeWorkspace = await page.evaluate(() =>
    localStorage.getItem('labhub_active_workspace')
  )
  if (activeWorkspace !== WORKSPACE) {
    await page.evaluate((slug) => {
      localStorage.setItem('labhub_active_workspace', slug)
    }, WORKSPACE)
    await page.reload({ waitUntil: 'domcontentloaded' })
  }

  const skipTour = page.getByRole('button', { name: /pular/i })
  if (await skipTour.isVisible({ timeout: 1500 }).catch(() => false)) {
    await skipTour.click()
  }

  const ticketUrl = `${BASE}/chamados/tickets/${TICKET_ID}`
  console.log(`Abrindo chamado: ${TICKET_ID}`)
  await page.goto(ticketUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

  const timelineHeading = page.getByRole('heading', { name: 'Timeline', exact: true })
  await timelineHeading.waitFor({ state: 'visible', timeout: 30000 })

  const timeline = page.locator('section').filter({
    has: timelineHeading,
  }).first()

  await timeline.waitFor({ state: 'visible', timeout: 10000 })
  await timeline.scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)

  mkdirSync(resolve('screenshots'), { recursive: true })
  await timeline.screenshot({
    path: OUTPUT,
    animations: 'disabled',
    caret: 'hide',
  })

  console.log(`Screenshot único salvo em: ${OUTPUT}`)
  await context.close()
} catch (error) {
  console.error('Falha ao capturar a timeline:', error.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
