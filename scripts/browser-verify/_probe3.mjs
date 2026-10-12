import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const T1 = '3af0601a-a2b9-50ad-a256-f7ef8c8649b3'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const seen = []
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) seen.push(`NAV ${new Date().toISOString().slice(17, 23)} ${f.url()}`)
})
page.on('console', (m) => {
  const t = m.text()
  if (/redirect|navigate|/i.test(t)) seen.push(`LOG ${new Date().toISOString().slice(17, 23)} [${m.type()}] ${t.slice(0, 160)}`)
})

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('input').nth(0).fill('demo-screenshots')
await page.locator('input').nth(1).fill('Demo2026Screenshots!')
await page.locator('button[type="submit"]').click()
await page.waitForTimeout(6000)
console.log('URL1:', page.url())
const persist = page.locator('button:has-text("Manter preferência")')
if (await persist.isVisible({ timeout: 3000 }).catch(() => false)) {
  await persist.click()
  console.log('toggled persist')
}
const card = page.locator('button,[role="button"]', { hasText: /Campus Demo|Campus Demonstration/ }).first()
await card.click({ timeout: 15000 })
await page.waitForTimeout(4000)
console.log('URL2:', page.url())

for (let i = 0; i < 8; i++) {
  await page.goto(`${BASE}/chamados/tickets/${T1}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  console.log(`try ${i} final URL:`, page.url())
  console.log('  head:', (await page.evaluate(() => document.body.innerText.slice(0, 90))).replace(/\n/g, ' | '))
}

console.log('--- events ---')
console.log(seen.join('\n'))
await b.close()