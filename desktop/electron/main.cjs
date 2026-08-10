const { app, BrowserWindow, screen, ipcMain, shell, powerSaveBlocker, Menu, session } = require('electron')
const path = require('node:path')
const http = require('node:http')
const fs = require('node:fs')
const initSqlJs = require('sql.js')

const LOCAL_DB_KEY = 'labhub_tv_device_config'

const ADMIN_URL = process.env.TV_ADMIN_URL || 'https://lab-hub-pi.vercel.app/tv'
const RENDERER_DIR = path.join(__dirname, '..', 'renderer')

let mainWindow = null
let powerBlockerId = null

/* ── Servidor local: YouTube (iframe) não funciona com origin file:// ── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
}

function serveRenderer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
        if (urlPath === '/') urlPath = '/desktop.html'
        const filePath = path.normalize(path.join(RENDERER_DIR, urlPath))
        if (!filePath.startsWith(RENDERER_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404).end('Not found')
          return
        }
        const ext = path.extname(filePath).toLowerCase()
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' })
        fs.createReadStream(filePath).pipe(res)
      } catch {
        res.writeHead(500).end('Error')
      }
    })
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
}

/* ── Banco local (SQLite via sql.js/WASM) para persistir config + estado ──
   O kiosk roda sem sessão; o identity do device e o estado do player ficam
   num arquivo .db real no userData, acessado pelo renderer via IPC. */
let localDb = null

function persistDb() {
  if (!localDb) return
  const data = localDb.db.export()
  const tmp = localDb.path + '.tmp'
  fs.writeFileSync(tmp, Buffer.from(data))
  fs.renameSync(tmp, localDb.path)
}

function readKv(key) {
  if (!localDb) return null
  const res = localDb.db.exec('select value from kv where key = ?', [key])
  if (!res.length || !res[0].values.length) return null
  return res[0].values[0][0]
}

function writeKv(key, value) {
  if (!localDb) return
  localDb.db.run(
    'insert into kv (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at',
    [key, value, new Date().toISOString()],
  )
  persistDb()
}

function deleteKv(key) {
  if (!localDb) return
  localDb.db.run('delete from kv where key = ?', [key])
  persistDb()
}

async function initLocalDb() {
  const SQL = await initSqlJs()
  const dbPath = path.join(app.getPath('userData'), 'labhub.db')
  let db
  try {
    db = new SQL.Database(fs.readFileSync(dbPath))
  } catch {
    db = new SQL.Database()
  }
  db.run('create table if not exists kv (key text primary key, value text not null, updated_at text)')
  localDb = { db, path: dbPath }
  persistDb()
}

/* ── Single instance: evita múltiplas janelas de kiosk ── */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    // Sem menu → sem atalhos do Chromium (devtools, close, etc.)
    Menu.setApplicationMenu(null)

    // Impede a tela de dormir enquanto o display estiver rodando
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep')

    await initLocalDb()
    registerStoreIpc()
    const rendererPort = await serveRenderer()
    createWindow(rendererPort)

    // YouTube (embeds) recusa playback quando o Referer vem de origin local
    // (http://127.0.0.1) → erros 153/150. Reescreve para um origin legítimo.
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://www.youtube.com/*', 'https://*.googlevideo.com/*', 'https://*.ytimg.com/*'] },
      (details, callback) => {
        details.requestHeaders['Referer'] = 'https://www.youtube.com/'
        callback({ requestHeaders: details.requestHeaders })
      },
    )
  })
}

/* ── Seleção de monitor: TV_DESKTOP_DISPLAY=<índice> ou monitor primário ── */
function pickDisplay() {
  const displays = screen.getAllDisplays()
  const envIndex = parseInt(process.env.TV_DESKTOP_DISPLAY || '', 10)
  if (!Number.isNaN(envIndex) && displays[envIndex]) {
    return displays[envIndex]
  }
  return screen.getPrimaryDisplay()
}

function createWindow(rendererPort) {
  const target = pickDisplay()
  const { x, y, width, height } = target.bounds

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#080a14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })

  // Kiosk forte (fica acima de tudo, sem sair facilmente)
  mainWindow.setKiosk(process.env.TV_DESKTOP_KIOSK !== '0')

  mainWindow.loadURL(`http://127.0.0.1:${rendererPort}/desktop.html`)

  // Smoke test: TV_DESKTOP_SMOKE_TEST=1 encerra após carregar (uso em CI)
  let smokeInjected = false
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[LabHub TV] Renderer carregado com sucesso')
    if (process.env.TV_DESKTOP_SMOKE_TEST === '1') {
      // Primeiro load: injeta config de teste (se fornecida) e recarrega para o display
      const testConfig = process.env.TV_DESKTOP_TEST_CONFIG
      if (!smokeInjected && testConfig) {
        smokeInjected = true
        // Escreve a config direto no banco local (SQLite), não em localStorage
        writeKv(LOCAL_DB_KEY, testConfig)
        mainWindow.webContents.reload()
        return
      }
      // Segundo load (display ativo) ou teste sem config: aguarda o fetch e encerra.
      // Duração configurável via TV_DESKTOP_SMOKE_TIMEOUT_MS (default 12s).
      const timeoutMs = parseInt(process.env.TV_DESKTOP_SMOKE_TIMEOUT_MS || '12000', 10)
      setTimeout(() => app.quit(), Number.isFinite(timeoutMs) ? timeoutMs : 12000)
    }
  })

  // Encaminha logs do renderer para o stdout (útil em CI / diagnóstico)
  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    if (process.env.TV_DESKTOP_SMOKE_TEST === '1') {
      console.log('[renderer]', message)
    }
  })

  /* ── Bloqueia navegação externa dentro da janela ── */
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://127.0.0.1:')) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  /* ── Bloqueia atalhos perigosos do Chromium ── */
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = (input.key || '').toLowerCase()
    const ctrlOrCmd = input.control || input.meta
    if (ctrlOrCmd && ['w', 'r', 't', 'n', 'q'].includes(key)) {
      event.preventDefault()
    }
    if (input.key === 'F11' || input.key === 'F12') {
      event.preventDefault()
    }
  })

  /* ── Crash do renderer → recarrega sozinho ── */
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload()
      }, 2000)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  /* ── Auto-iniciar com o Windows ── */
  if (process.env.TV_DESKTOP_AUTOSTART !== '0') {
    app.setLoginItemSettings({ openAtLogin: true })
  }
}

/* ── IPC exposto ao preload ── */
ipcMain.on('open-admin', () => {
  shell.openExternal(ADMIN_URL)
})

ipcMain.on('quit', () => {
  app.quit()
})

/* ── Store local (SQLite) exposto ao renderer ── */
function registerStoreIpc() {
  ipcMain.handle('store-get', (_event, key) => readKv(key))
  ipcMain.handle('store-set', (_event, key, value) => writeKv(key, value))
  ipcMain.handle('store-delete', (_event, key) => deleteKv(key))
}

app.on('before-quit', () => {
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId)
  }
})

app.on('window-all-closed', () => {
  app.quit()
})
