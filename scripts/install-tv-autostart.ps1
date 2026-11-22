<#
.SYNOPSIS
  Liga (ou desliga) o início automático da TV quando o Windows liga.

.DESCRIPTION
  Cria um atalho na pasta Startup do usuário apontando para o app instalado
  (Lab Hub TV.exe). Funciona no nível do Windows — não mexe no app.

  Para um KIOSK de verdade (sem área de trabalho, sem Alt+Tab), o caminho é
  o "Assigned Access" / "Shell Launcher" do Windows; o atalho só garante que
  o app abra sozinho no login.

.PARAMETER Mode
  install  - cria o atalho (padrão)
  remove   - remove o atalho
  status   - diz se está instalado

.PARAMETER Target
  Caminho do executável instalado. Se omitido, o script procura a instalação
  LabHub TV registrada no Windows. Nunca aponta para o repositório.

.EXAMPLE
  powershell -File scripts\install-tv-autostart.ps1
  powershell -File scripts\install-tv-autostart.ps1 -Mode status
  powershell -File scripts\install-tv-autostart.ps1 -Mode remove
#>
param(
  [ValidateSet('install', 'remove', 'status')]
  [string]$Mode = 'install',
  [string]$Target = ''
)

$ErrorActionPreference = 'Stop'

$shortcutPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV\LabHub TV.lnk'
$shortcutName = Split-Path -Leaf $shortcutPath

function Resolve-InstalledTarget {
  $running = Get-Process -Name 'labhub-tv' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($running -and $running.Path -and (Test-Path -LiteralPath $running.Path)) { return $running.Path }

  $uninstallRoots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
  )
  foreach ($root in $uninstallRoots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    foreach ($entry in (Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue)) {
      $app = Get-ItemProperty -LiteralPath $entry.PSPath -ErrorAction SilentlyContinue
      if ($app.DisplayName -ne 'LabHub TV') { continue }
      $candidates = @()
      if ($app.InstallLocation) { $candidates += (Join-Path $app.InstallLocation 'labhub-tv.exe') }
      if ($app.DisplayIcon) {
        $iconPath = ($app.DisplayIcon -replace ',\s*\d+$', '').Trim('"')
        if ($iconPath) { $candidates += $iconPath }
      }
      foreach ($candidate in $candidates) {
        if ((Test-Path -LiteralPath $candidate -PathType Leaf) -and
            (Split-Path -Parent $candidate) -notlike "$(Split-Path -Parent $PSScriptRoot)*") {
          return (Resolve-Path -LiteralPath $candidate).Path
        }
      }
    }
  }
  return $null
}

function Test-Shortcut {
  return Test-Path -LiteralPath $shortcutPath
}

switch ($Mode) {
  'status' {
    if (Test-Shortcut) {
      Write-Host "INICIO AUTOMATICO: ligado"
      Write-Host "  atalho : $shortcutPath"
      $sh = New-Object -ComObject WScript.Shell
      $lnk = $sh.CreateShortcut($shortcutPath)
      Write-Host "  alvo   : $($lnk.TargetPath)"
    } else {
      Write-Host "INICIO AUTOMATICO: desligado (atalho '$shortcutName' nao existe)"
    }
    exit 0
  }

  'remove' {
    if (Test-Shortcut) {
      Remove-Item -LiteralPath $shortcutPath -Force
      Remove-Item -LiteralPath (Split-Path -Parent $shortcutPath) -Force -ErrorAction SilentlyContinue
      Write-Host "Atalho removido: $shortcutPath"
      Write-Host "A TV nao abre mais sozinha no login."
    } else {
      Write-Host "Nada a remover (atalho '$shortcutName' nao existia)."
    }
    exit 0
  }

  'install' {
    if (-not $Target) { $Target = Resolve-InstalledTarget }
    if (-not $Target) {
      Write-Host "ERRO: LabHub TV instalado nao foi encontrado no Windows." -ForegroundColor Red
      Write-Host "Instale o NSIS ou MSI oficial e tente novamente."
      exit 1
    }
    $Target = (Resolve-Path -LiteralPath $Target).Path
    if ((Split-Path -Parent $Target) -like "$(Split-Path -Parent $PSScriptRoot)*") {
      Write-Host "ERRO: o atalho nao pode apontar para dentro do repositorio." -ForegroundColor Red
      exit 1
    }
    if (-not (Test-Path -LiteralPath $Target)) {
      Write-Host "ERRO: executavel nao encontrado:" -ForegroundColor Red
      Write-Host "  $Target"
      Write-Host ""
      Write-Host "Verifique a instalacao ou informe -Target com o executavel instalado."
      exit 1
    }

    New-Item -ItemType Directory -Path (Split-Path -Parent $shortcutPath) -Force | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $Target
    $shortcut.WorkingDirectory = Split-Path -Parent $Target
    $shortcut.Description = 'LabHub TV - display corporativo'
    $shortcut.Save()

    Write-Host "INICIO AUTOMATICO ligado:" -ForegroundColor Green
    Write-Host "  atalho : $shortcutPath"
    Write-Host "  alvo   : $Target"
    Write-Host ""
    Write-Host "No proximo login do Windows a TV abre sozinha."
    Write-Host "Para desfazer: powershell -File scripts\install-tv-autostart.ps1 -Mode remove"
    exit 0
  }
}
