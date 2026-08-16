import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const [username, password] = readFileSync('.playwright-creds', 'utf8').trim().split(';')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('console', (msg) => console.log('[console]', msg.type(), msg.text().slice(0, 250)))
page.on('pageerror', (err) => console.log('[pageerror]', err.message))
page.on('request', (req) => {
  if (req.url().includes('supabase') && req.url().includes('auth')) {
    console.log('[req]', req.method(), req.url())
  }
})
page.on('response', (res) => {
  if (res.url().includes('supabase') && res.url().includes('auth')) {
    console.log('[res]', res.status(), res.url())
  }
})

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByPlaceholder('nome.escolhido').fill(username)
await page.getByPlaceholder('••••••••').fill(password)
await page.locator('form').getByRole('button', { name: 'Entrar' }).click()

await page.waitForTimeout(8000)
console.log('URL:', page.url())
const text = await page.evaluate(() => document.body.innerText)
console.log('--- texto visível (primeiros 800 chars) ---')
console.log(text.slice(0, 800))
await page.screenshot({ path: 'test-results/debug-login.png', fullPage: true })
await browser.close()
