import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const T1 = '3af0601a-a2b9-50ad-a256-f7ef8c8649b3'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const events = []
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) events.push(`NAV ${new Date().toISOString().slice(17, 23)} ${f.url()}`)
})
page.on('console', (m) => {
  const t = m.text().slice(0, 180)
  if (!/vite|React DevTools|Vercel|autocomplete|GoTrueClient|Failed to load|PGRST|\[Sync\]/.test(t)) {
    events.push(`LOG ${new Date().toISOString().slice(17, 23)} [${m.type()}] ${t}`)
  }
})

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('input').nth(0).fill('demo-screenshots')
await page.locator('input').nth(1).fill('Demo2026Screenshots!')
await page.locator('button[type="submit"]').click()
await page.waitForTimeout(6000)
const persist = page.locator('button:has-text("Manter preferência")')
if (await persist.isVisible({ timeout: 3000 }).catch(() => false)) {
  await persist.click()
}
const card = page.locator('button,[role="button"]', { hasText: /Campus Demo|Campus Demonstration/ }).first()
await card.click({ timeout: 15000 })
await page.waitForTimeout(5000)
events.push(`URL_AFTER_SELECT ${page.url()}`)

for (let i = 0; i < 2; i++) {
  events.push(`>>> goto try ${i}`)
  await page.goto(`${BASE}/chamados/tickets/${T1}`, { waitUntil: 'domcontentloaded' })
  events.push(`>>> goto resolved ${page.url()}`)
  for (let s = 0; s < 10; s++) {
    await page.waitForTimeout(1000)
    if (page.url().includes('/chamados/tickets/')) {
      break
    }
  }
  events.push(`>>> after wait ${page.url()}`)
  events.push(`>>> BODY ${(await page.evaluate(() => document.body.innerText.slice(0, 70))).replace(/\n/g, ' | ')}`)
}

await b.close()
await import('node:fs').then((fs) => fs.writeFileSync('C:/Users/Admin/AppData/Local/Temp/opencode/nav_events.log', events.join('\n')))
console.log('done, lines:', events.length)