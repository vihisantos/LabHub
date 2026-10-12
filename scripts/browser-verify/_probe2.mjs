import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.locator('input').nth(0).fill('demo-screenshots')
await page.locator('input').nth(1).fill('Demo2026Screenshots!')
await page.locator('button[type="submit"]').click()
await page.waitForTimeout(7000)
console.log('after login URL:', page.url())
console.log('gate visible:', await page.locator('text=Escolha seu workspace').isVisible({ timeout: 3000 }).catch(() => false))
const gateBtns = await page.evaluate(() =>
  [...document.querySelectorAll('button,[role="button"]')].map((x) => (x.innerText || '').trim().replace(/\n/g, ' ')),
)
console.log('gate buttons:', JSON.stringify(gateBtns.slice(0, 20)))

const persist = page.locator('button:has-text("Manter preferência")')
if (await persist.isVisible({ timeout: 3000 }).catch(() => false)) await persist.click()
const card = page.locator('button,[role="button"]', { hasText: /Campus Demo|campus demo/ }).first()
await card.click({ timeout: 15000 }).catch(async () => {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('div,button')].find((e) => e.innerText?.includes('Campus Demo'))
    if (el) el.click()
  })
})
await page.waitForTimeout(5000)
const store = await page.evaluate(() => {
  const out = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    out[k] = (localStorage.getItem(k) || '').slice(0, 120)
  }
  return out
})
console.log('localStorage keys:', JSON.stringify(Object.keys(store)))
console.log('pref present:', JSON.stringify(store['labhub:workspace:pref:31854701-603b-4137-b596-82b5ded2097d']))
console.log('URL after select:', page.url())

await page.goto(`${BASE}/chamados/tickets/3af0601a-a2b9-50ad-a256-f7ef8c8649b3`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
console.log('URL after goto ticket:', page.url())
const body0 = await page.evaluate(() => document.body.innerText.slice(0, 300))
console.log('body head:', JSON.stringify(body0))

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
console.log('URL after reload:', page.url())
const body1 = await page.evaluate(() => document.body.innerText.slice(0, 300))
console.log('body head after reload:', JSON.stringify(body1))

await b.close()