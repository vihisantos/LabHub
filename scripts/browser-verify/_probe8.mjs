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
const persist = page.locator('button:has-text("Manter preferência")')
if (await persist.isVisible({ timeout: 3000 }).catch(() => false)) await persist.click()
await page.locator('button,[role="button"]', { hasText: /Campus Demo|Campus Demonstration/ }).first().click({ timeout: 15000 })
await page.waitForTimeout(5000)
const dump = await page.evaluate(() => {
  const out = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    const v = localStorage.getItem(k) || ''
    out.push({ k, v: v.slice(0, 400) })
  }
  return out
})
console.log(JSON.stringify(dump, null, 1))
await b.close()