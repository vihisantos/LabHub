import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const T15 = '903d5efc-c535-54e6-936e-271e6b7fd10b'
const T16 = '003ee222-031f-57e2-a42f-d330603b30eb'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('input').nth(0).fill('demo-screenshots')
await page.locator('input').nth(1).fill('Demo2026Screenshots!')
await page.locator('button[type="submit"]').click()
await page.waitForTimeout(7000)
const persist = page.locator('button:has-text("Manter preferência")')
if (await persist.isVisible({ timeout: 3000 }).catch(() => false)) await persist.click()
await page.locator('button,[role="button"]', { hasText: /Campus Demo|Campus Demonstration/ }).first().click({ timeout: 15000 })
await page.waitForTimeout(5000)

async function spaGo(route) {
  await page.evaluate((url) => {
    window.history.pushState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, route)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
}
async function waitText(pattern, ms = 25000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const t = await page.evaluate(() => document.body.innerText || '')
    if (pattern.test(t)) return t
    await wait(500)
  }
  return false
}

await spaGo(`/chamados/tickets/${T15}`)
const t15 = await waitText(/Em espera —/)
console.log('T15 em_espera page:', t15 ? 'YES' : 'NO')
if (t15) console.log('  motivo:', /Em espera —[\s\S]{0,60}/.exec(t15)?.[0])

await spaGo(`/chamados/tickets/${T16}`)
const t16 = await waitText(/CHAMADO INDEFERIDO/)
console.log('T16 indeferido page:', t16 ? 'YES' : 'NO')
if (t16) console.log('  motivo:', /Motivo[\s\S]{0,80}/.exec(t16)?.[0])
console.log('URL final:', page.url())
await b.close()