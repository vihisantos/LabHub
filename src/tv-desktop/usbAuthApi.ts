/**
 * Contratos reais dos comandos Tauri já registrados em `src-tauri/src/main.rs`.
 *
 * Este módulo apenas tipa as chamadas existentes — não cria outra forma de
 * ativação. Nenhum segredo é registrado em log.
 */

import { invoke } from '@tauri-apps/api/core'

/** `ValidationResult` em `usb_auth.rs` (campos serializados em snake_case). */
export interface UsbValidationResult {
  success: boolean
  key_id: string
  device_name: string
  error: string | null
}

/** JSON retornado por `activate_with_usb` em `main.rs`. */
export interface UsbActivationResult {
  success: boolean
  deviceId?: string
  keyId?: string
  deviceName?: string
  error?: string
}

/** JSON retornado por `get_local_usb_auth` em `main.rs` (`expiresAt` em ms). */
export interface LocalUsbAuth {
  deviceId: string
  keyId: string
  expiresAt: number
  driveLetter: string
}

export type LocalAuthFailureKind = 'missing' | 'expired' | 'invalid' | 'transient'

export interface LocalAuthFailure {
  kind: LocalAuthFailureKind
  message: string
}

export async function isLocalUsbAuthValid(): Promise<boolean> {
  return invoke<boolean>('is_local_usb_auth_valid')
}

export async function listUsbDrives(): Promise<string[]> {
  return invoke<string[]>('list_usb_drives')
}

export async function findUsbWithKey(): Promise<string | null> {
  return invoke<string | null>('find_usb_with_key')
}

export async function validateUsbAuth(driveLetter: string): Promise<UsbValidationResult> {
  return invoke<UsbValidationResult>('validate_usb_auth', { driveLetter })
}

export async function activateWithUsb(driveLetter: string): Promise<UsbActivationResult> {
  return invoke<UsbActivationResult>('activate_with_usb', { driveLetter })
}

export async function getLocalUsbAuth(): Promise<LocalUsbAuth> {
  return invoke<LocalUsbAuth>('get_local_usb_auth')
}

/**
 * Classifica falhas locais sem apagar nada. Erros de leitura/permissão são
 * transitórios e devem oferecer nova tentativa; apenas estados confirmados
 * (ausente/expirado/inválido) direcionam para reativação.
 */
export function classifyLocalAuthFailure(error: unknown): LocalAuthFailure {
  const message = error instanceof Error ? error.message : String(error ?? '')

  if (/expirad/i.test(message)) {
    return { kind: 'expired', message: 'A autorização deste dispositivo expirou. Ative novamente com o pendrive.' }
  }
  if (/não encontrado|nao encontrado|not found/i.test(message)) {
    return { kind: 'missing', message: 'Nenhuma ativação local foi encontrada neste computador.' }
  }
  if (/descriptografar|parsear|inválid|invali|dados vazios|hash divergiu/i.test(message)) {
    return { kind: 'invalid', message: 'A autorização local está inválida. É necessário ativar novamente com o pendrive.' }
  }

  // Qualquer erro não confirmado é tratado como leitura temporária.
  return {
    kind: 'transient',
    message: 'Não foi possível ler a autorização local neste momento. Verifique permissões e tente novamente.',
  }
}
