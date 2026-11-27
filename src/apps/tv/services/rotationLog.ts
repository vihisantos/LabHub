/**
 * Log local do rodízio de Fixos/Informativos.
 *
 * Cada linha traz nome do arquivo, categoria, última reprodução, horário de
 * liberação do cooldown e o motivo da seleção ou do bloqueio. O registro fica
 * no console do app e, quando rodando no Tauri, em
 * `%APPDATA%/LabHub TV/rotation.log` (o comando falha silenciosamente fora do
 * desktop ou quando a pasta não está disponível).
 */

import { invoke } from '@tauri-apps/api/core'
import type { SpecialCategory } from './specialRotation'

export interface RotationLogEntry {
  category: SpecialCategory
  file_name: string
  last_played: string | null
  cooldown_until: string | null
  reason: string
}

function timeLabel(timestamp: number | undefined): string | null {
  return timestamp === undefined ? null : new Date(timestamp).toISOString()
}

export function logRotation(entry: RotationLogEntry): void {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry })
  console.info('[TV rodízio]', line)
  void invoke<void>('tv_rotation_log', { line }).catch(function() {
    // Log é diagnóstico: indisponibilidade nunca pode interromper a programação.
  })
}

export function logRotationSelection(args: {
  category: SpecialCategory
  name: string
  lastPlayed: number | undefined
  cooldownMs: number
  reason: string
}): void {
  logRotation({
    category: args.category,
    file_name: args.name || '(nenhum)',
    last_played: timeLabel(args.lastPlayed),
    cooldown_until: args.lastPlayed === undefined ? null : timeLabel(args.lastPlayed + args.cooldownMs),
    reason: args.reason,
  })
}
