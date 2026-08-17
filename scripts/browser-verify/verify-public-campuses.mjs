/**
 * Verificação: campus no formulário público de chamados SEM login.
 *
 * Abre /chamados-publico/new num perfil limpo (role anon, sem sessão) e
 * confere que os botões de campus aparecem — eles vêm de
 * /api/chamados/workspaces (service role), não do Supabase com chave anon.
 *
 * Uso: node scripts/browser-verify/verify-public-campuses.mjs
 * Env: BASE_URL (default http://localhost:5173)
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OUT = 'test-results/verify-public-campuses'
mkdirSync(OUT, { recursive: true })

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
// Contexto novo = sem cookies/sessão → navegador não logado
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

try {
  await page.goto(`${BASE}/chamados-publico/new`, { waitUntil: 'load', timeout: 30000 })

  await page.waitForSelector('section[aria-label="Campus"]', { timeout: 20000 })
  await page.waitForFunction(
    () => !document.body.innerText.includes('Carregando campi'),
    { timeout: 20000 },
  )

  const body = await page.locator('body').innerText()
  const campusButtons = await page.$$eval('section[aria-label="Campus"] button', (btns) =>
    btns.map((b) => b.innerText.trim()),
  )

  check('Formulário público abriu sem login', page.url().includes('/chamados-publico/new'))
  check('Sem estado de loading travado', !body.includes('Carregando campi'))
  check('Sem mensagem de erro de campus', !body.includes('Não foi possível carregar os campi'))
  check(
    'Botões de campus renderizados',
    campusButtons.length > 0,
    `${campusButtons.length} campi: ${campusButtons.join(', ')}`,
  )

  await page.screenshot({ path: `${OUT}/form-sem-login.png`, fullPage: true })
  console.log(`  📸 screenshot: ${OUT}/form-sem-login.png`)
} catch (err) {
  check('Formulário público renderizou', false, err.message)
  await page.screenshot({ path: `${OUT}/erro.png`, fullPage: true }).catch(() => {})
}

await browser.close()

const failed = checks.filter((c) => !c.ok)
console.log(
  `\n${failed.length === 0 ? '🎉' : '❌'} ${checks.length - failed.length}/${checks.length} verificações passaram.`,
)
if (failed.length > 0) {
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`)
  process.exitCode = 1
}
