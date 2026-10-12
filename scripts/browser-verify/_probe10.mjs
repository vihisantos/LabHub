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
await page.waitForTimeout(4000)
const token = await page.evaluate(`(function(){ const sbKey=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token')); if(!sbKey) return null; const d=JSON.parse(localStorage.getItem(sbKey)); return d?.access_token || d?.current_session?.access_token || null })()`)
console.log('token:', token ? token.length : 'none')
const r1 = await page.evaluate(async (t) => {
  const res = await fetch('/api/chamados', { headers: { Authorization: `Bearer ${t}` } })
  return { status: res.status, text: (await res.text()).slice(0, 400) }
}, token)
console.log('no-query:', JSON.stringify(r1))
const r2 = await page.evaluate(async (t) => {
  const res = await fetch('/api/chamados?workspace=demo-chamados', { headers: { Authorization: `Bearer ${t}` } })
  return { status: res.status, text: (await res.text()).slice(0, 400) }
}, token)
console.log('with-workspace:', JSON.stringify(r2))
await b.close()