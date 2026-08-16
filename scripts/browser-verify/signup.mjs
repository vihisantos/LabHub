/**
 * Cria uma conta de teste nova pelo formulário "Criar Conta" do LabHub.
 * Salva as credenciais em .playwright-creds (gitignored) para o sweep.mjs.
 *
 * Uso: node scripts/browser-verify/signup.mjs
 * Env: BASE_URL (default http://localhost:5173)
 */
import { chromium } from '@playwright/test'
import { writeFileSync, existsSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'

if (existsSync('.playwright-creds')) {
  console.log('⏭️  Credenciais já existem em .playwright-creds — pulando signup.')
  process.exit(0)
}

const username = `tester.${Date.now().toString(36)}`
const password = `LabHub@${Math.random().toString(36).slice(2, 10)}`

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: 'Criar Conta' }).click()
  await page.getByPlaceholder('nome.escolhido').fill(username)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: 'Solicitar Acesso' }).click()

  await page.getByText('Aguardando aprovação', { exact: true }).waitFor({ timeout: 20000 })
  await page.screenshot({ path: 'test-results/signup-pending.png', fullPage: true })

  writeFileSync('.playwright-creds', `${username};${password}\n`, 'utf8')
  console.log(`✅ Conta criada e aguardando aprovação: ${username}@labhub.com`)
  console.log('Aprove no APP: o signUp já cria a notificação "Novo usuário pendente" para')
  console.log('admins absolutos — abra o sino de notificações e clique para aprovar em /admin/users.')
  console.log('Depois de aprovar, rode: node scripts/browser-verify/sweep.mjs')
} catch (err) {
  console.error('❌ Falha no signup:', err.message)
  await page.screenshot({ path: 'test-results/signup-error.png', fullPage: true })
  process.exitCode = 1
} finally {
  await browser.close()
}
