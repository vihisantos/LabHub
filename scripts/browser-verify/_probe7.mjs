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
console.log('landed:', page.url())

const fetchResult = await page.evaluate(async () => {
  const sbKey = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
  const token = sbKey ? JSON.parse(localStorage.getItem(sbKey) || '{}')?.current_session?.access_token : null
  if (!token) return 'NO TOKEN'
  const res = await fetch('/api/chamados', { headers: { Authorization: `Bearer ${token}` } })
  const json = await res.json()
  return { status: res.status, count: (json.tickets || []).length, sample: json.tickets?.[0]?.reasonCode }
})
console.log('fetch /api/chamados:', JSON.stringify(fetchResult))
await b.close()