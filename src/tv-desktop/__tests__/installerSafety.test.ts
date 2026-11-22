import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(relativePath, 'utf8')

const installer = read('src-tauri/windows/installer.nsi')
const hooks = read('src-tauri/windows/nsis-hooks.nsh')
const config = read('src-tauri/tauri.conf.json')
const rustSupport = read('src-tauri/src/windows_support.rs')
const autostartUi = read('src/tv-desktop/AutostartSetting.tsx')

function nsisFunction(source: string, name: string): string {
  const start = source.indexOf(`Function ${name}`)
  expect(start, `Function ${name} deve existir`).toBeGreaterThanOrEqual(0)
  const next = source.indexOf('\nFunction ', start + 1)
  return next === -1 ? source.slice(start) : source.slice(start, next)
}

describe('Fase 5.2 — instalador premium e comportamento', () => {
  it('preserva a identidade visual premium e os assets DPI', () => {
    const parsed = JSON.parse(config) as {
      bundle?: { windows?: { nsis?: Record<string, unknown> } }
    }
    const nsisConfig = parsed.bundle?.windows?.nsis ?? {}

    expect(nsisConfig.template).toBe('windows/installer.nsi')
    expect(nsisConfig.installerHooks).toBe('windows/nsis-hooks.nsh')
    expect(nsisConfig.customLanguageFiles).toMatchObject({
      PortugueseBR: 'windows/languages/PortugueseBR.nsh',
    })
    expect(nsisConfig.sidebarImage).toBe('windows/assets/sidebar-200.bmp')
    expect(nsisConfig.headerImage).toBe('windows/assets/header.bmp')
    expect(installer).toContain('BrandingText "LabHub TV · by Vihisantos"')
    expect(installer).toContain('by Vihisantos')

    const assets = [
      'src-tauri/windows/assets/character.png',
      'src-tauri/windows/assets/header.bmp',
      'src-tauri/windows/assets/sidebar-100.bmp',
      'src-tauri/windows/assets/sidebar-125.bmp',
      'src-tauri/windows/assets/sidebar-150.bmp',
      'src-tauri/windows/assets/sidebar-200.bmp',
    ]
    for (const asset of assets) expect(existsSync(asset), asset).toBe(true)
  })

  it('usa o rótulo exato de inicialização', () => {
    expect(installer).toContain('Iniciar o LabHub TV ao entrar no Windows')
    expect(autostartUi).toContain('Iniciar o LabHub TV ao entrar no Windows')
    expect(installer).not.toContain('Iniciar o LabHub TV com o Windows')
  })

  it('cria tarefa interativa do usuário atual sem UAC, senha ou duplicidade', () => {
    const apply = nsisFunction(installer, 'LabHubApplyStartup')

    expect(apply).toContain('-AtLogOn')
    expect(apply).toContain('LogonType Interactive')
    expect(apply).toContain('RunLevel Limited')
    expect(apply).toContain('SetEnvironmentVariable(w "LABHUB_TASK_TARGET"')
    expect(apply).toContain('nsExec::ExecToStack')
    expect(apply).not.toContain('-Verb RunAs')
    expect(apply).not.toContain('schtasks /Create')
    expect(apply).not.toContain('/rp ')
    expect(apply).not.toContain('RunAsUser')

    // ONLOGON documentado e os dois mecanismos são mutuamente exclusivos.
    expect(apply).toContain('ONLOGON')
    expect(apply).toContain(
      'Delete "$APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\LabHub TV.lnk"',
    )
    expect(apply).toContain(
      'Delete "$APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\LabHub TV\\LabHub TV.lnk"',
    )
    expect(apply).toContain('WriteRegStr HKCU "Software\\LabHub TV" "AutostartMechanism" "Task"')
    expect(apply).toContain(
      'WriteRegStr HKCU "Software\\LabHub TV" "AutostartMechanism" "StartupShortcut"',
    )
  })

  it('não reporta sucesso falso quando a tarefa falha', () => {
    const apply = nsisFunction(installer, 'LabHubApplyStartup')

    expect(apply).toContain('DetailPrint "LabHub TV: falha ao criar a tarefa')
    expect(apply).toContain('Unregister-ScheduledTask -TaskName \'LabHub TV\'')
    expect(apply).toContain('${FileExists} "$APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\LabHub TV.lnk"')
    expect(apply).toContain('MessageBox MB_ICONEXCLAMATION "Não foi possível ativar')
    expect(apply).toContain('"Autostart" "0"')
    expect(apply).toContain('"AutostartMechanism" "None"')
  })

  it('exige confirmação explícita antes de apagar dados', () => {
    expect(installer).toContain(
      'Page custom LabHubCleanConfirm LabHubCleanLeave LabHubCleanConfirmPre',
    )
    expect(installer).toContain('Apagar os dados do LabHub TV?')
    expect(installer).toContain('A ativação pelo USB será necessária novamente.')
    expect(installer).toContain('STR:Apagar dados e reinstalar')
    expect(installer).toContain('STR:Cancelar')
    expect(installer).toContain('${DM_SETDEFID} 2 0')
    expect(installer).toContain('System::Call \'user32::SetFocus(p $1) p.r0\'')

    const pre = nsisFunction(installer, 'LabHubCleanConfirmPre')
    expect(pre).toContain('${If} $LabHubCleanRequested != 1')
    expect(pre).toContain('${If} $PassiveMode = 1')
  })

  it('preserva dados em atualização e reparo e adia limpeza para a confirmação', () => {
    const leaveReinstall = nsisFunction(installer, 'PageLeaveReinstall')
    const cleanLeave = nsisFunction(installer, 'LabHubCleanLeave')

    expect(leaveReinstall).not.toContain('ExecWait')
    expect(leaveReinstall).not.toContain('LabHubClearAppData')
    expect(leaveReinstall).not.toContain('RmDir')
    expect(leaveReinstall).toContain('StrCpy $LabHubCleanRequested 1')
    expect(cleanLeave).toContain('ExecWait')
    expect(cleanLeave).toContain('/FROMSETUP')
    expect(cleanLeave).toContain('Call LabHubClearAppData')
  })

  it('nunca limpa dados em instalação silenciosa/passiva', () => {
    const leaveReinstall = nsisFunction(installer, 'PageLeaveReinstall')
    const uninstallInit = nsisFunction(installer, 'un.onInit')

    expect(leaveReinstall).toContain('${If} $PassiveMode = 1')
    expect(leaveReinstall).toContain('StrCpy $LabHubReinstallChoice 1')
    expect(uninstallInit).toContain('StrCpy $DeleteAppDataCheckboxState 0')
    expect(installer).toContain('${If} ${Silent}')
  })

  it('limpa somente caminhos conhecidos do LabHub TV', () => {
    for (const file of [
      'device-config.json',
      'auth.encrypted',
      'drive-sync.json',
      'programming-state.json',
    ]) {
      expect(installer).toContain(`$APPDATA\\LabHub TV\\${file}`)
    }

    expect(installer).toContain('RmDir /r "$APPDATA\\LabHub TV\\EBWebView"')
    expect(installer).not.toContain('RmDir /r "$APPDATA\\${BUNDLEID}"')
    expect(installer).not.toContain('RmDir /r "$LOCALAPPDATA\\${BUNDLEID}"')
    expect(installer).not.toMatch(/RmDir\s+\/r\s+"[A-Z]:\\/i)
    expect(installer).not.toContain('Google Drive\\')
    expect(installer).not.toContain('Meus Documentos\\')
  })

  it('desinstala apenas as próprias entradas e impede execução concorrente', () => {
    expect(hooks).toContain('-TaskName \'LabHub TV\'')
    expect(hooks).toContain(
      'Delete "$APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\LabHub TV.lnk"',
    )
    expect(hooks).toContain(
      'Delete "$APPDATA\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\LabHub TV\\LabHub TV.lnk"',
    )
    expect(hooks).not.toContain('-Verb RunAs')
    expect(hooks).not.toContain('Startup\\*.lnk')
    expect(nsFunctionBlock(installer, '.onInit')).toContain('LabHubTVSetupMutex')
    expect(uninstallInitHasMutex()).toBe(true)
  })

  it('mantém o backend órfão alinhado com o mecanismo do instalador', () => {
    expect(rustSupport).toContain('pub mechanism: String')
    expect(rustSupport).toContain('Startup\\LabHub TV.lnk')
    expect(rustSupport).toContain('-AtLogOn')
    expect(rustSupport).toContain('LogonType Interactive')
    expect(rustSupport).toContain('RunLevel Limited')
    const pathsBlock = rustSupport.slice(
      rustSupport.indexOf('fn paths()'),
      rustSupport.indexOf('fn legacy_shortcut()'),
    )
    expect(pathsBlock).toContain('join(STARTUP_SHORTCUT)')
    expect(pathsBlock).not.toContain('LEGACY_STARTUP_SHORTCUT')
    expect(rustSupport).not.toContain('Verb RunAs')
    expect(rustSupport).not.toContain('schtasks')
  })
})

function nsFunctionBlock(source: string, name: string): string {
  return nsisFunction(source, name)
}

function uninstallInitHasMutex(): boolean {
  return nsisFunction(installer, 'un.onInit').includes('LabHubTVSetupMutex')
}
