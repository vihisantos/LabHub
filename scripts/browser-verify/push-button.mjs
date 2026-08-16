/**
 * Testa o botão "Testar notificação" nas Configurações do Chamados em produção.
 * Loga com o usuário de teste, navega até /chamados/settings e clica no botão.
 *
 * Uso: node scripts/browser-verify/push-button.mjs
 * Env: BASE_URL (default https://lab-hub-pi.vercel.app)
 */
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'https://lab-hub-pi.vercel.app'
const [username, password] = readFileSync('.playwright-creds', 'utf8').trim().split(';')
mkdirSync('test-results/push', { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()

// Concede permissão de notificação explicitamente para a origem (depois de
// criar o contexto e antes de navegar — necessário para o headless).
await context.grantPermissions(['notifications'], { origin: BASE })

// No Chrome headless a Push API real não existe (requestPermission e
// pushManager.subscribe falham) — mocka para o app ficar "pushActive" e o
// botão "Testar notificação" habilitado. O clique usa o endpoint real.
await page.addInitScript(() => {
  Notification.requestPermission = () => Promise.resolve('granted')
  Object.defineProperty(Notification, 'permission', { get: () => 'granted' })
  PushManager.prototype.subscribe = () =>
    Promise.resolve({
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-123',
        keys: { p256dh: 'BPFakeKeyFakeKeyFakeKeyFakeKeyFakeKey', auth: 'FakeAuthKey123' },
      }),
    })
})

// Escuta as respostas da API para capturar o status do push/test
page.on('response', (res) => {
  if (res.url().includes('/api/chamados/push/test')) {
    console.log(`[API] ${res.request().method()} ${res.url()} → ${res.status()}`)
  }
})

try {
  // 1. Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('nome.escolhido').fill(username)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.locator('form').getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 })
  await page.waitForTimeout(4000)

  // 2. Gate de workspace: marca "Manter preferência" e escolhe Anhembi Piracicaba
  //    (o Mooca tem quase todos os apps desativados). Espera estabilizar.
  await page.waitForTimeout(4000)
  const gate = page.locator('text=Escolha seu workspace')
  if (await gate.count()) {
    console.log('  [gate] encontrado — clicando "Manter preferência"')
    await page.getByRole('button', { name: /Manter preferência/ }).click({ timeout: 8000 })
    console.log('  [gate] preferência marcada — escolhendo Piracicaba')
    const card = page.locator('div.grid [role="button"]').filter({ hasText: 'Anhembi Piracicaba' })
    const target = (await card.count()) ? card.first() : page.locator('div.grid [role="button"]').first()
    await target.click({ timeout: 8000 })
    await page.waitForSelector('text=Escolha seu workspace', { state: 'detached', timeout: 10000 })
    await page.waitForTimeout(2000)
    console.log('  [gate] workspace selecionado')
  }
  console.log(`✅ Login OK — URL: ${page.url()}`)

  // 3. Vai para as Configurações do Chamados
  await page.goto(`${BASE}/chamados/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  console.log('URL pós-navegação:', page.url())
  await page.screenshot({ path: 'test-results/push/settings.png' })

  // 4. Ativa as notificações (se necessário) e clica em "Testar notificação"
  const activateBtn = page.getByRole('button', { name: /Ativar notificações|Reativar notificações/i })
  const activateCount = await activateBtn.count()
  if (activateCount > 0) {
    console.log('🔔 Ativando notificações...')
    await activateBtn.first().click()
    await page.waitForTimeout(4000)
    await page.screenshot({ path: 'test-results/push/activated.png' })
  }

  const testBtn = page.getByRole('button', { name: /Testar notifica/i })
  const btnCount = await testBtn.count()
  const disabled = btnCount > 0 ? await testBtn.first().isDisabled() : true
  console.log(`Botão "Testar notificação": ${btnCount} encontrado(s), disabled=${disabled}`)
  if (btnCount === 0 || disabled) {
    // Captura o estado da tela para diagnóstico
    const body = await page.locator('body').innerText()
    console.log('Conteúdo da tela (trecho):', body.slice(0, 400).replace(/\n+/g, ' | '))
  } else {
    await testBtn.first().click()
    // Aguarda o resultado (mensagem de sucesso/erro)
    await page.waitForTimeout(5000)
    await page.screenshot({ path: 'test-results/push/after-click.png' })
    const result = await page.locator('body').innerText()
    const idx = result.search(/Push de teste|Nenhuma inscrição|O envio falhou|Sessão/i)
    console.log('Resultado:', idx >= 0 ? result.slice(idx, idx + 200).replace(/\n+/g, ' | ') : '(nenhuma mensagem de resultado encontrada)')
  }
} catch (err) {
  console.error('❌ Erro:', err.message)
  await page.screenshot({ path: 'test-results/push/error.png' }).catch(() => {})
} finally {
  await browser.close()
}
