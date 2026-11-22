import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

const mainRs = read('src-tauri/src/main.rs')
const usbAuthRs = read('src-tauri/src/usb_auth.rs')
const installer = read('src-tauri/windows/installer.nsi')
const api = read('src/tv-desktop/usbAuthApi.ts')
const desktopApp = read('src/tv-desktop/DesktopApp.tsx')
const usbScreen = read('src/tv-desktop/components/UsbAuthScreen.tsx')
const desktopMain = read('src/tv-desktop/main.tsx')

describe('Fase 5.3 — contrato real da ativação USB', () => {
  it('usa somente comandos já registrados no backend', () => {
    for (const command of [
      'list_usb_drives',
      'find_usb_with_key',
      'validate_usb_auth',
      'activate_with_usb',
      'get_local_usb_auth',
      'is_local_usb_auth_valid',
    ]) {
      expect(mainRs, `comando ${command} registrado`).toContain(command)
      expect(api, `contrato tipado ${command}`).toContain(`'${command}'`)
    }

    const handler = mainRs.slice(mainRs.indexOf('generate_handler!'))
    expect(handler).toContain('list_usb_drives')
    expect(handler).toContain('find_usb_with_key')
    expect(handler).toContain('validate_usb_auth')
    expect(handler).toContain('activate_with_usb')
    expect(handler).toContain('get_local_usb_auth')
    expect(handler).toContain('is_local_usb_auth_valid')
  })

  it('respeita argumentos e retornos reais de cada comando', () => {
    expect(mainRs).toContain('fn validate_usb_auth(drive_letter: String) -> Result<ValidationResult, String>')
    expect(mainRs).toContain('fn activate_with_usb(drive_letter: String) -> Result<serde_json::Value, String>')
    expect(mainRs).toContain('fn get_local_usb_auth() -> Result<serde_json::Value, String>')
    expect(mainRs).toContain('fn list_usb_drives() -> Result<Vec<String>, String>')
    expect(mainRs).toContain('fn find_usb_with_key() -> Result<Option<String>, String>')

    expect(api).toContain("invoke<UsbValidationResult>('validate_usb_auth', { driveLetter })")
    expect(api).toContain("invoke<UsbActivationResult>('activate_with_usb', { driveLetter })")
    expect(api).toContain("invoke<LocalUsbAuth>('get_local_usb_auth')")
    expect(api).toContain('key_id: string')
    expect(api).toContain('device_name: string')
    expect(api).toContain('expiresAt: number')
  })

  it('preserva criptografia, validade e escrita durável da ativação', () => {
    expect(usbAuthRs).toContain('pub fn validate_usb_key')
    expect(usbAuthRs).toContain('sign_challenge_rsa')
    expect(usbAuthRs).toContain('verify_signature_rsa2048')
    expect(usbAuthRs).toContain('Scope::User')
    expect(usbAuthRs).toContain('crate::atomic_write(&auth_path, &encrypted_data)')
    expect(usbAuthRs).toContain('if auth.expires_at < chrono::Utc::now().timestamp()')
    expect(usbAuthRs).toContain('crate::remember_valid(&auth_path, &encrypted)')
    expect(usbAuthRs).toContain('crate::quarantine_file(&auth_path)')
    expect(usbAuthRs).not.toContain('save_local_auth(enabled')
  })

  it('não cria ativação alternativa por login, código ou Supabase', () => {
    for (const source of [api, desktopApp, usbScreen, desktopMain]) {
      expect(source).not.toMatch(/supabase/i)
      expect(source).not.toMatch(/activation\/redeem/i)
      expect(source).not.toMatch(/activationCode/i)
      expect(source).not.toMatch(/verifyOtp/i)
    }
    expect(usbScreen).toContain('activateWithUsb(keyDrive)')
    expect(desktopApp).toContain('await getLocalUsbAuth()')
    expect(desktopApp).toContain('await saveConfig(created)')
  })

  it('a limpeza da instalação remove a ativação, mas permite recriá-la', () => {
    expect(installer).toContain('$APPDATA\\LabHub TV\\auth.encrypted')
    expect(installer).toContain('$APPDATA\\LabHub TV\\device-config.json')
    expect(usbAuthRs).toContain('std::fs::create_dir_all(&labhub_dir)')
    expect(mainRs).toContain('get_app_data_dir().map(|p| p.join("LabHub TV").join("device-config.json"))')
    expect(mainRs).toContain('dirs::preference_dir()')
  })
})
