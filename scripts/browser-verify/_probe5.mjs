import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5173'
const T15 = '903d5efc-c535-54e6-936e-271e6b7fd10b'
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
console.log('home ok:', (await page.evaluate(() => document.body.innerText)).includes('Bom dia'))

// SPA navigation
await page.evaluate((url) => {
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}, `/chamados/tickets/${T15}`)
await page.waitForTimeout(5000)
console.log('URL after pushState:', page.url())

// inject
await page.evaluate(async () => {
  const sbKey = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
  const token = sbKey ? JSON.parse(localStorage.getItem(sbKey) || '{}')?.current_session?.access_token : null
  const res = await fetch('/api/chamados', { headers: { Authorization: `Bearer ${token}` } })
  const { tickets } = await res.json()
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('labhub')
    req.onsuccess = (e) => {
      const db = e.target.result
      const tx = db.transaction('collections', 'readwrite')
      const store = tx.objectStore('collections')
      const all = store.getAll()
      all.onsuccess = () => {
        const cols = all.result || []
        const i = cols.findIndex((c) => c.name === 'chamados')
        if (i !== -1) cols[i].items = tickets
        else cols.push({ name: 'chamados', items: tickets })
        store.clear()
        for (const c of cols) store.put(c)
        tx.oncomplete = resolve
        tx.onerror = reject
      }
    }
    req.onerror = reject
  })
})
await page.evaluate(() => window.dispatchEvent(new Event('online')))
await page.waitForTimeout(4000)
const text = await page.evaluate(() => document.body.innerText)
console.log('has "Em espera —":', text.includes('Em espera —'))
console.log('has Aguardando equipamento:', text.includes('Aguardando equipamento/peça'))
console.log('has CHAMADO INDEFERIDO:', text.includes('CHAMADO INDEFERIDO'))
console.log('page URL:', page.url())
console.log('---text tail---')
console.log(text.replace(/\n{2,}/g, '\n').slice(0, 500))
await b.close()