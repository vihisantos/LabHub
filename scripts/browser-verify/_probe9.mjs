import { chromium } from '@playwright/test'
const BASE = 'http://localhost:5173'
const T15 = '903d5efc-c535-54e6-936e-271e6b7fd10b'
const T16 = '003ee222-031f-57e2-a42f-d330603b30eb'
const T1 = '3af0601a-a2b9-50ad-a256-f7ef8c8649b3'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

async function openInt() {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input').nth(0).fill('demo-screenshots')
  await page.locator('input').nth(1).fill('Demo2026Screenshots!')
  await page.locator('button[type="submit"]').click()
  await page.waitForTimeout(7000)
  const persist = page.locator('button:has-text("Manter preferência")')
  if (await persist.isVisible({ timeout: 3000 }).catch(() => false)) await persist.click()
  await page.locator('button,[role="button"]', { hasText: /Campus Demo|Campus Demonstration/ }).first().click({ timeout: 15000 })
  await page.waitForTimeout(5000)
}

const TOKEN_EXPR = `(function(){ const sbKey=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token')); if(!sbKey) return null; const d=JSON.parse(localStorage.getItem(sbKey)); return d?.access_token || d?.current_session?.access_token || null })()`

async function inject() {
  const token = await page.evaluate(TOKEN_EXPR)
  if (!token) { console.log('NO TOKEN'); return }
  console.log('token ok (len', token.length + ')')
  const fetchRes = await page.evaluate(async (tok) => {
    const res = await fetch('/api/chamados', { headers: { Authorization: `Bearer ${tok}` } })
    const json = await res.json()
    const tickets = json?.tickets || []
    return { status: res.status, count: tickets.length, reasons: tickets.map((t) => t.reasonCode).filter(Boolean) }
  }, token)
  console.log('fetch:', JSON.stringify(fetchRes))
  const injRes = await page.evaluate(async (tok) => {
    const res = await fetch('/api/chamados', { headers: { Authorization: `Bearer ${tok}` } })
    const { tickets } = await res.json()
    if (!tickets?.length) return 'EMPTY'
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
    return 'INJECTED ' + tickets.length
  }, token)
  console.log('inject:', injRes)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.waitForTimeout(3000)
}

async function spaGo(route) {
  await page.evaluate((url) => {
    window.history.pushState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, route)
}
async function waitText(pattern, ms = 20000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const t = await page.evaluate(() => document.body.innerText || '')
    if (pattern.test(t)) return t
    await wait(500)
  }
  return false
}

await openInt()
console.log('landed:', page.url())
await inject()
for (const [name, id, pat] of [
  ['T1', T1, /Em espera|Indeferir/],
  ['T15', T15, /Em espera —/],
  ['T16', T16, /CHAMADO INDEFERIDO/],
]) {
  await spaGo(`/chamados/tickets/${id}`)
  const t = await waitText(pat)
  console.log(name, ':', t ? 'OK url=' + page.url() : 'FAIL url=' + page.url())
  if (t) console.log('   ', pat.source, '→', (pat.exec(t)?.[0] || '').slice(0, 40))
}
await b.close()