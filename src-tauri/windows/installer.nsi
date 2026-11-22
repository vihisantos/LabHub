Unicode true
ManifestDPIAware true
; Add in `dpiAwareness` `PerMonitorV2` to manifest for Windows 10 1607+ (note this should not affect lower versions since they should be able to ignore this and pick up `dpiAware` `true` set by `ManifestDPIAware true`)
; Currently undocumented on NSIS's website but is in the Docs folder of source tree, see
; https://github.com/kichik/nsis/blob/5fc0b87b819a9eec006df4967d08e522ddd651c9/Docs/src/attributes.but#L286-L300
; https://github.com/tauri-apps/tauri/pull/10106
ManifestDPIAwareness PerMonitorV2

!if "{{compression}}" == "none"
  SetCompress off
!else
  ; Set the compression algorithm. We default to LZMA.
  SetCompressor /SOLID "{{compression}}"
!endif

; Keep above !include to stay ahead of any plugin command
; see https://github.com/tauri-apps/tauri/pull/15422#discussion_r3289239624
{{#if signed_plugins_path}}
!addplugindir "{{signed_plugins_path}}"
{{/if}}

!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include WordFunc.nsh
!include "utils.nsh"
!include "FileAssociation.nsh"
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "Win\RestartManager.nsh"
!include "StrFunc.nsh"
${StrCase}
${StrLoc}

{{#if installer_hooks}}
!include "{{installer_hooks}}"
{{/if}}

!define WEBVIEW2APPGUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

!define MANUFACTURER "{{manufacturer}}"
!define PRODUCTNAME "{{product_name}}"
!define VERSION "{{version}}"
!define VERSIONWITHBUILD "{{version_with_build}}"
!define HOMEPAGE "{{homepage}}"
!define INSTALLMODE "{{install_mode}}"
!define LICENSE "{{license}}"
!define INSTALLERICON "{{installer_icon}}"
!define SIDEBARIMAGE "{{sidebar_image}}"
!define HEADERIMAGE "{{header_image}}"
!define UNINSTALLERICON "{{uninstaller_icon}}"
!define UNINSTALLERHEADERIMAGE "{{uninstaller_header_image}}"
!define MAINBINARYNAME "{{main_binary_name}}"
!define MAINBINARYSRCPATH "{{main_binary_path}}"
!define BUNDLEID "{{bundle_id}}"
!define COPYRIGHT "{{copyright}}"
!define OUTFILE "{{out_file}}"
!define ARCH "{{arch}}"
!define ADDITIONALPLUGINSPATH "{{additional_plugins_path}}"
!define ALLOWDOWNGRADES "{{allow_downgrades}}"
!define DISPLAYLANGUAGESELECTOR "{{display_language_selector}}"
!define INSTALLWEBVIEW2MODE "{{install_webview2_mode}}"
!define WEBVIEW2INSTALLERARGS "{{webview2_installer_args}}"
!define WEBVIEW2BOOTSTRAPPERPATH "{{webview2_bootstrapper_path}}"
!define WEBVIEW2INSTALLERPATH "{{webview2_installer_path}}"
!define MINIMUMWEBVIEW2VERSION "{{minimum_webview2_version}}"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!define MANUKEY "Software\${MANUFACTURER}"
!define MANUPRODUCTKEY "${MANUKEY}\${PRODUCTNAME}"
!define UNINSTALLERSIGNCOMMAND "{{uninstaller_sign_cmd}}"
!define ESTIMATEDSIZE "{{estimated_size}}"
!define STARTMENUFOLDER "{{start_menu_folder}}"
!define /ifndef DM_SETDEFID 0x0401

Var PassiveMode
Var UpdateMode
Var NoShortcutMode
Var WixMode
Var OldMainBinaryName

; LabHub TV custom UI state
Var LabHubDialog
Var LabHubUI
Var LabHubDPI
Var LabHubClientW
Var LabHubClientH
Var LabHubSidebarW
Var LabHubFooterY
Var LabHubFooterH
Var LabHubTmp
Var LabHubFontTitle
Var LabHubFontTitleSmall
Var LabHubFontSub
Var LabHubFontBody
Var LabHubFontSmall
Var LabHubFontButton
Var LabHubSidebarSrc
Var LabHubSidebarBmp
Var LabHubPageKind
Var LabHubInstallEyebrow
Var LabHubInstallTitle
Var LabHubInstallSub
Var LabHubOpenCheck
Var LabHubShortcutCheck
Var LabHubStartupCheck
Var LabHubStartupAction
Var LabHubReinstallChoice
Var LabHubReinstallDefault
Var LabHubInstalledVer
Var LabHubRepair
Var LabHubBtnW
Var LabHubBtnH
Var LabHubBtnY
Var LabHubNextX
Var LabHubFooterLine
Var LabHubCleanRequested
Var LabHubStartupRequested
Var LabHubTaskExit
Var LabHubTaskOutput
Var LabHubFromSetup

Name "${PRODUCTNAME}"
BrandingText "LabHub TV · by Vihisantos"
OutFile "${OUTFILE}"

; We don't actually use this value as default install path,
; it's just for nsis to append the product name folder in the directory selector
; https://nsis.sourceforge.io/Reference/InstallDir
!define PLACEHOLDER_INSTALL_DIR "placeholder\${PRODUCTNAME}"
InstallDir "${PLACEHOLDER_INSTALL_DIR}"

VIProductVersion "${VERSIONWITHBUILD}"
VIAddVersionKey "ProductName" "${PRODUCTNAME}"
VIAddVersionKey "FileDescription" "${PRODUCTNAME}"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

# additional plugins
!addplugindir "${ADDITIONALPLUGINSPATH}"

; Uninstaller signing command
!if "${UNINSTALLERSIGNCOMMAND}" != ""
  !uninstfinalize '${UNINSTALLERSIGNCOMMAND}'
!endif

; Handle install mode, `perUser`, `perMachine` or `both`
!if "${INSTALLMODE}" == "perMachine"
  RequestExecutionLevel admin
!endif

!if "${INSTALLMODE}" == "currentUser"
  RequestExecutionLevel user
!endif

!if "${INSTALLMODE}" == "both"
  !define MULTIUSER_MUI
  !define MULTIUSER_INSTALLMODE_INSTDIR "${PRODUCTNAME}"
  !define MULTIUSER_INSTALLMODE_COMMANDLINE
  !if "${ARCH}" == "x64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !else if "${ARCH}" == "arm64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !endif
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_KEY "${UNINSTKEY}"
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "CurrentUser"
  !define MULTIUSER_INSTALLMODEPAGE_SHOWUSERNAME
  !define MULTIUSER_INSTALLMODE_FUNCTION RestorePreviousInstallLocation
  !define MULTIUSER_EXECUTIONLEVEL Highest
  !include MultiUser.nsh
!endif

; Installer icon
!if "${INSTALLERICON}" != ""
  !define MUI_ICON "${INSTALLERICON}"
!endif

; Installer sidebar image
!if "${SIDEBARIMAGE}" != ""
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
!endif

; Enable header images for installer and uninstaller pages when either image is configured.
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
!else if "${UNINSTALLERHEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
!endif

; Installer header image
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE_BITMAP "${HEADERIMAGE}"
!endif

; Uninstaller header image
!if "${UNINSTALLERHEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE_UNBITMAP "${UNINSTALLERHEADERIMAGE}"
!endif

; Uninstaller icon
!if "${UNINSTALLERICON}" != ""
  !define MUI_UNICON "${UNINSTALLERICON}"
!endif

; ── LabHub TV · tema institucional premium (dark) ─────────────────────────
; Paleta: #0B1220 / #111A2E (fundos), #2F6BFF / #4CC3FF (destaques),
; #F4F7FB (texto principal), #A9B7D0 (texto secundário).
!define MUI_BGCOLOR "0B1220"
!define MUI_TEXTCOLOR "F4F7FB"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"
!define MUI_DIRECTORYPAGE_BGCOLOR "0B1220"
!define MUI_DIRECTORYPAGE_TEXTCOLOR "F4F7FB"

; Converte coordenadas do layout de referência (1000x500) para a escala atual.
!macro LHSCALE OUT BASE
  IntOp ${OUT} ${BASE} * $LabHubUI
  IntOp ${OUT} ${OUT} / 1000
!macroend

; Cria uma fonte em pontos, compensando a escala escolhida e o DPI do sistema.
!macro LHFONT OUT PTS WEIGHT
  IntOp $LabHubTmp ${PTS} * $LabHubUI
  IntOp $LabHubTmp $LabHubTmp * 96
  IntOp $LabHubTmp $LabHubTmp / $LabHubDPI
  IntOp $LabHubTmp $LabHubTmp / 1000
  CreateFont ${OUT} "Segoe UI" "$LabHubTmp" "${WEIGHT}"
!macroend

; Textos das telas — assinatura oficial: by Vihisantos
!define MUI_WELCOMEPAGE_TITLE "Bem-vindo à instalação do LabHub TV"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "Plataforma institucional de exibição digital para ambientes acadêmicos.$\r$\n$\r$\nEste instalador configurará o LabHub TV em seu computador Windows.$\r$\n$\r$\nAplicativo oficial para Windows · Preparado para operação contínua.$\r$\n$\r$\nby Vihisantos"
!define MUI_PAGE_HEADER_TEXT "Instalando o LabHub TV"
!define MUI_PAGE_HEADER_SUBTEXT "Aguarde enquanto os arquivos necessários são configurados."

!define MUI_FINISHPAGE_TITLE "Instalação concluída"
!define MUI_FINISHPAGE_TEXT "O LabHub TV foi instalado com sucesso e está pronto para configuração.$\r$\n$\r$\nNa primeira execução, ative o dispositivo e configure a pasta de conteúdo local.$\r$\n$\r$\nby Vihisantos"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o LabHub TV agora"

; Define registry key to store installer language
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${MANUPRODUCTKEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "Installer Language"

; Installer pages, must be ordered as they appear
; 1. Welcome Page (custom LabHub UI)
Page custom LabHubWelcomeShow LabHubWelcomeLeave

; 2. License Page (if defined)
!if "${LICENSE}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MUI_PAGE_LICENSE "${LICENSE}"
!endif

; 3. Install mode (if it is set to `both`)
!if "${INSTALLMODE}" == "both"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MULTIUSER_PAGE_INSTALLMODE
!endif

; 4. Custom page to ask user if he wants to reinstall/uninstall
;    only if a previous installation was detected
Var ReinstallPageCheck
Page custom PageReinstall PageLeaveReinstall
Page custom LabHubCleanConfirm LabHubCleanLeave LabHubCleanConfirmPre

; Find a previous WiX installation and set $R6 to its uninstall registry key, or to "" if none.
;
; A WiX installer stores the installation info in registry
; using a UUID and so we have to loop through all keys under
; `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
; and check if `DisplayName` and `Publisher` keys match ${PRODUCTNAME} and ${MANUFACTURER}
;
; This has a potential issue that there maybe another installation that matches
; our ${PRODUCTNAME} and ${MANUFACTURER} but wasn't installed by our WiX installer,
; however, this should be fine since the user will have to confirm the uninstallation
; and they can chose to abort it if doesn't make sense.
Function FindWixInstall
  StrCpy $R6 ""
  StrCpy $0 0
  wix_loop:
    EnumRegKey $1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" wix_loop_done ; Exit loop if there is no more keys to loop on
    IntOp $0 $0 + 1
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "Publisher"
    StrCmp "$R0$R1" "${PRODUCTNAME}${MANUFACTURER}" 0 wix_loop
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
    ${StrCase} $R1 $R0 "L"
    ${StrLoc} $R0 $R1 "msiexec" ">"
    StrCmp $R0 0 0 wix_loop_done
    StrCpy $R6 "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1"
  wix_loop_done:
FunctionEnd

Function PageReinstall
  ; Uninstall previous WiX installation if exists.
  Call FindWixInstall
  ${If} $R6 != ""
    StrCpy $WixMode 1
    Goto compare_version
  ${EndIf}

  ; Check if there is an existing installation, if not, abort the reinstall page
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" ""
  ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
  ${IfThen} "$R0$R1" == "" ${|} Abort ${|}

  compare_version:
  ${If} $WixMode = 1
    ReadRegStr $LabHubInstalledVer HKLM "$R6" "DisplayVersion"
  ${Else}
    ReadRegStr $LabHubInstalledVer SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${EndIf}
  ${IfThen} $LabHubInstalledVer == "" ${|} StrCpy $LabHubInstalledVer "desconhecida" ${|}

  nsis_tauri_utils::SemverCompare "${VERSION}" $LabHubInstalledVer
  Pop $R0

  ; Atualizar é o padrão quando existe versão anterior; consertar quando é a mesma.
  StrCpy $LabHubReinstallDefault 1
  ${If} $R0 = 0
    StrCpy $LabHubReinstallDefault 2
  ${EndIf}
  StrCpy $LabHubReinstallChoice $LabHubReinstallDefault

  ; Em modo passivo/silencioso segue sem interface.
  ${If} $PassiveMode = 1
    StrCpy $LabHubReinstallChoice 1
    Return
  ${EndIf}

  ${If} $LabHubUI == ""
    Call LabHubSetupUI
  ${EndIf}
  StrCpy $LabHubPageKind 5
  Call LabHubHideMuiHeader

  nsDialogs::Create 1018
  Pop $LabHubDialog
  ${If} $LabHubDialog == error
    Abort
  ${EndIf}
  System::Call 'user32::SetWindowPos(p $LabHubDialog, p 0, i 0, i 0, i $LabHubClientW, i $LabHubFooterY, i 0x0004)'
  SetCtlColors $LabHubDialog "" "0B1220"
  Call LabHubLayoutFooter

  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_BITMAP} 0 0 0 $LabHubSidebarW $LabHubFooterY ""
  Pop $0
  SendMessage $0 0x0172 0 $LabHubSidebarBmp

  !insertmacro LHSCALE $R0 370
  !insertmacro LHSCALE $R1 36
  !insertmacro LHSCALE $R2 560
  !insertmacro LHSCALE $R3 24
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R3 "INSTALAÇÃO EXISTENTE"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontSub 1
  SetCtlColors $1 "4CC3FF" "0B1220"

  !insertmacro LHSCALE $R1 64
  !insertmacro LHSCALE $R3 54
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R3 "O LabHub TV já está instalado"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontTitleSmall 1
  SetCtlColors $1 "F4F7FB" "0B1220"

  !insertmacro LHSCALE $R1 124
  !insertmacro LHSCALE $R3 44
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R3 "Versão instalada: $LabHubInstalledVer. Escolha como continuar."
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontSub 1
  SetCtlColors $1 "A9B7D0" "0B1220"

  !insertmacro LHSCALE $R4 18

  ; 1 — Atualizar
  !insertmacro LHSCALE $R1 184
  nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${WS_TABSTOP}|${BS_AUTORADIOBUTTON} 0 $R0 $R1 $R2 $R4 "Atualizar para a nova versão"
  Pop $R5
  SendMessage $R5 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $R5 "F4F7FB" "0B1220"
  System::Call 'uxtheme::SetWindowTheme(p $R5, w " ", w " ")'
  ${NSD_OnClick} $R5 LabHubReinstallPickUpdate

  !insertmacro LHSCALE $R1 206
  !insertmacro LHSCALE $R2 520
  !insertmacro LHSCALE $R8 398
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R8 $R1 $R2 $R4 "Mantém seus dados, atalhos e preferências."
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontSmall 1
  SetCtlColors $1 "A9B7D0" "0B1220"

  ; 2 — Consertar
  !insertmacro LHSCALE $R1 242
  !insertmacro LHSCALE $R2 560
  nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${WS_TABSTOP}|${BS_AUTORADIOBUTTON} 0 $R0 $R1 $R2 $R4 "Consertar instalação"
  Pop $R6
  SendMessage $R6 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $R6 "F4F7FB" "0B1220"
  System::Call 'uxtheme::SetWindowTheme(p $R6, w " ", w " ")'
  ${NSD_OnClick} $R6 LabHubReinstallPickRepair

  !insertmacro LHSCALE $R1 264
  !insertmacro LHSCALE $R2 520
  !insertmacro LHSCALE $R8 398
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R8 $R1 $R2 $R4 "Reinstala os arquivos e atalhos, mantendo seus dados."
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontSmall 1
  SetCtlColors $1 "A9B7D0" "0B1220"

  ; 3 — Instalação limpa
  !insertmacro LHSCALE $R1 300
  !insertmacro LHSCALE $R2 560
  nsDialogs::CreateControl BUTTON ${WS_VISIBLE}|${WS_CHILD}|${WS_TABSTOP}|${BS_AUTORADIOBUTTON} 0 $R0 $R1 $R2 $R4 "Instalação limpa"
  Pop $R7
  SendMessage $R7 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $R7 "F4F7FB" "0B1220"
  System::Call 'uxtheme::SetWindowTheme(p $R7, w " ", w " ")'
  ${NSD_OnClick} $R7 LabHubReinstallPickClean

  !insertmacro LHSCALE $R1 322
  !insertmacro LHSCALE $R2 520
  !insertmacro LHSCALE $R8 398
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R8 $R1 $R2 $R4 "Remove a versão anterior, os dados locais e a ativação (reative pelo USB)."
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontSmall 1
  SetCtlColors $1 "A9B7D0" "0B1220"

  !insertmacro LHSCALE $R1 362
  !insertmacro LHSCALE $R2 560
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R4 "Para manter a programação e os conteúdos locais, escolha Atualizar ou Consertar."
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontSmall 1
  SetCtlColors $1 "A9B7D0" "0B1220"

  ${If} $LabHubReinstallChoice == 1
    SendMessage $R5 ${BM_SETCHECK} ${BST_CHECKED} 0
  ${ElseIf} $LabHubReinstallChoice == 2
    SendMessage $R6 ${BM_SETCHECK} ${BST_CHECKED} 0
  ${Else}
    SendMessage $R7 ${BM_SETCHECK} ${BST_CHECKED} 0
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function LabHubReinstallPickUpdate
  StrCpy $LabHubReinstallChoice 1
FunctionEnd
Function LabHubReinstallPickRepair
  StrCpy $LabHubReinstallChoice 2
FunctionEnd
Function LabHubReinstallPickClean
  StrCpy $LabHubReinstallChoice 3
FunctionEnd

Function PageLeaveReinstall
  ; Instalação silenciosa/passiva nunca apaga dados.
  ${If} $PassiveMode = 1
    StrCpy $LabHubReinstallChoice 1
    StrCpy $LabHubCleanRequested 0
    Return
  ${EndIf}

  StrCpy $LabHubCleanRequested 0

  ; WiX não tem reparo in-place: sempre desinstala antes, mas só após confirmar.
  ${If} $WixMode = 1
    StrCpy $LabHubReinstallChoice 3
  ${EndIf}

  ${If} $LabHubReinstallChoice == 1
    ; Atualizar: preserva dados, atalhos e preferência de inicialização.
    StrCpy $UpdateMode 1
    StrCpy $LabHubRepair 0
    Goto reinst_done
  ${ElseIf} $LabHubReinstallChoice == 2
    ; Consertar: reinstala arquivos/atalhos sem remover dados nem reiniciar o dispositivo.
    StrCpy $UpdateMode 0
    StrCpy $LabHubRepair 1
    Goto reinst_done
  ${EndIf}

  ; A desinstalação e a limpeza ocorrem somente depois da confirmação explícita.
  StrCpy $LabHubCleanRequested 1
  StrCpy $LabHubRepair 0

  reinst_done:
FunctionEnd

Function LabHubCleanConfirmPre
  ${If} $LabHubCleanRequested != 1
    Abort
  ${EndIf}
  ${If} $PassiveMode = 1
    Abort
  ${EndIf}
FunctionEnd

Function LabHubCleanConfirm
  ${If} $LabHubUI == ""
    Call LabHubSetupUI
  ${EndIf}
  StrCpy $LabHubPageKind 6
  Call LabHubHideMuiHeader

  nsDialogs::Create 1018
  Pop $LabHubDialog
  ${If} $LabHubDialog == error
    Abort
  ${EndIf}
  System::Call 'user32::SetWindowPos(p $LabHubDialog, p 0, i 0, i 0, i $LabHubClientW, i $LabHubFooterY, i 0x0004)'
  SetCtlColors $LabHubDialog "" "0B1220"
  Call LabHubLayoutFooter

  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_BITMAP} 0 0 0 $LabHubSidebarW $LabHubFooterY ""
  Pop $0
  SendMessage $0 0x0172 0 $LabHubSidebarBmp

  !insertmacro LHSCALE $R0 370
  !insertmacro LHSCALE $R1 36
  !insertmacro LHSCALE $R2 560
  !insertmacro LHSCALE $R3 24
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R3 "CONFIRMAÇÃO DE LIMPEZA"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontSub 1
  SetCtlColors $1 "4CC3FF" "0B1220"

  !insertmacro LHSCALE $R1 76
  !insertmacro LHSCALE $R3 52
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R3 "Apagar os dados do LabHub TV?"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontTitleSmall 1
  SetCtlColors $1 "F4F7FB" "0B1220"

  !insertmacro LHSCALE $R1 142
  !insertmacro LHSCALE $R3 48
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R3 "Isso remove a instalação anterior, a programação, o histórico, as configurações do Google Drive salvas neste computador e a ativação deste dispositivo."
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $1 "A9B7D0" "0B1220"

  !insertmacro LHSCALE $R1 190
  !insertmacro LHSCALE $R3 26
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R3 "A ativação pelo USB será necessária novamente."
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $1 "F4F7FB" "0B1220"

  !insertmacro LHSCALE $R1 230
  !insertmacro LHSCALE $R3 48
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R3 "Suas pastas originais de vídeos/fotos e o conteúdo do Google Drive não serão excluídos."
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontSmall 1
  SetCtlColors $1 "A9B7D0" "0B1220"

  nsDialogs::Show
FunctionEnd

Function LabHubDeleteIfExists
  Pop $R0
  ${If} ${FileExists} "$R0"
    ClearErrors
    Delete "$R0"
    ${If} ${Errors}
    ${OrIf} ${FileExists} "$R0"
      DetailPrint "LabHub TV: não foi possível remover $R0 (arquivo em uso ou sem permissão)."
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

Function LabHubRemoveDirIfExists
  Pop $R0
  ${If} ${FileExists} "$R0"
    ClearErrors
    RMDir "$R0"
    ${If} ${Errors}
    ${OrIf} ${FileExists} "$R0"
      DetailPrint "LabHub TV: a pasta $R0 contém arquivos não reconhecidos ou está em uso; limpeza interrompida."
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

; Remove somente arquivos conhecidos do LabHub TV. Nenhuma pasta genérica,
; unidade de disco, Google Drive ou diretório de mídia é tocado.
Function LabHubClearAppData
  DetailPrint "LabHub TV: removendo dados locais deste dispositivo."

  Push "$APPDATA\LabHub TV\device-config.json"
  Call LabHubDeleteIfExists
  Push "$APPDATA\LabHub TV\auth.encrypted"
  Call LabHubDeleteIfExists
  Push "$APPDATA\LabHub TV\drive-sync.json"
  Call LabHubDeleteIfExists
  Push "$APPDATA\LabHub TV\programming-state.json"
  Call LabHubDeleteIfExists

  ; Cópias de segurança, temporários atômicos e arquivos em quarentena.
  Delete "$APPDATA\LabHub TV\*.bak"
  Delete "$APPDATA\LabHub TV\*.tmp"
  Delete "$APPDATA\LabHub TV\*.corrupt-*"

  ; Caminhos legados identificados pelo bundle id (somente arquivos conhecidos).
  Push "$APPDATA\${BUNDLEID}\device-config.json"
  Call LabHubDeleteIfExists
  Push "$APPDATA\${BUNDLEID}\auth.encrypted"
  Call LabHubDeleteIfExists
  Push "$APPDATA\${BUNDLEID}\drive-sync.json"
  Call LabHubDeleteIfExists
  Push "$APPDATA\${BUNDLEID}\programming-state.json"
  Call LabHubDeleteIfExists
  Push "$LOCALAPPDATA\${BUNDLEID}\device-config.json"
  Call LabHubDeleteIfExists
  Push "$LOCALAPPDATA\${BUNDLEID}\auth.encrypted"
  Call LabHubDeleteIfExists
  Push "$LOCALAPPDATA\${BUNDLEID}\drive-sync.json"
  Call LabHubDeleteIfExists
  Push "$LOCALAPPDATA\${BUNDLEID}\programming-state.json"
  Call LabHubDeleteIfExists

  ; Perfil WebView2 pertencente ao aplicativo, quando presente.
  ${If} ${FileExists} "$APPDATA\LabHub TV\EBWebView"
    ClearErrors
    RmDir /r "$APPDATA\LabHub TV\EBWebView"
    ${If} ${Errors}
    ${OrIf} ${FileExists} "$APPDATA\LabHub TV\EBWebView"
      DetailPrint "LabHub TV: não foi possível remover o perfil WebView2 local (em uso ou sem permissão)."
      Abort
    ${EndIf}
  ${EndIf}

  Push "$APPDATA\LabHub TV"
  Call LabHubRemoveDirIfExists
  Push "$APPDATA\${BUNDLEID}"
  Call LabHubRemoveDirIfExists
  Push "$LOCALAPPDATA\${BUNDLEID}"
  Call LabHubRemoveDirIfExists

  DeleteRegKey HKCU "Software\LabHub TV"
FunctionEnd

Function LabHubCleanLeave
  ; Reexecuta a checagem para o caso de o usuário ter voltado e mudado a escolha.
  ${If} $LabHubCleanRequested != 1
    Return
  ${EndIf}
  ${If} $PassiveMode = 1
    StrCpy $LabHubCleanRequested 0
    Return
  ${EndIf}

  HideWindow
  ClearErrors

  ${If} $WixMode = 1
    ReadRegStr $R1 HKLM "$R6" "UninstallString"
    ExecWait '$R1' $0
  ${Else}
    ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
    ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
    StrCpy $R1 "$R1 /S /FROMSETUP _?=$4"
    ExecWait '$R1' $0
  ${EndIf}

  BringToFront

  ${IfThen} ${Errors} ${|} StrCpy $0 2 ${|}

  ${If} $0 <> 0
  ${OrIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    ${If} $WixMode = 1
    ${AndIf} $0 = 1602
      Abort
    ${EndIf}
    ${If} $0 = 1
      Abort
    ${EndIf}
    MessageBox MB_ICONEXCLAMATION "$(unableToUninstall)"
    Abort
  ${EndIf}

  ${If} $WixMode = 0
  ${AndIf} $4 != ""
    Delete "$4\uninstall.exe"
    RMDir "$4"
  ${EndIf}

  Call LabHubClearAppData
  StrCpy $LabHubCleanRequested 0
FunctionEnd

; 5. Choose install directory page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!define MUI_PAGE_CUSTOMFUNCTION_SHOW LabHubDirectoryShow
!insertmacro MUI_PAGE_DIRECTORY

; 6. Start menu shortcut page
Var AppStartMenuFolder
!if "${STARTMENUFOLDER}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !define MUI_STARTMENUPAGE_DEFAULTFOLDER "${STARTMENUFOLDER}"
!else
  !define MUI_PAGE_CUSTOMFUNCTION_PRE Skip
!endif
!insertmacro MUI_PAGE_STARTMENU Application $AppStartMenuFolder

; 7. Installation page (custom LabHub UI)
!define MUI_PAGE_CUSTOMFUNCTION_SHOW LabHubInstallShow
!insertmacro MUI_PAGE_INSTFILES

; 8. Finish page (MUI page with custom LabHub UI)
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!define MUI_PAGE_CUSTOMFUNCTION_SHOW LabHubFinishShow
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE LabHubFinishLeave
!insertmacro MUI_PAGE_FINISH

Function RunMainBinary
  nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
FunctionEnd

; Uninstaller Pages
; 1. Confirm uninstall page
Var DeleteAppDataCheckbox
Var DeleteAppDataCheckboxState
!define /ifndef WS_EX_LAYOUTRTL         0x00400000
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.ConfirmShow
Function un.ConfirmShow ; Add add a `Delete app data` check box
  ; $1 inner dialog HWND
  ; $2 window DPI
  ; $3 style
  ; $4 x
  ; $5 y
  ; $6 width
  ; $7 height
  FindWindow $1 "#32770" "" $HWNDPARENT ; Find inner dialog
  System::Call "user32::GetDpiForWindow(p r1) i .r2"
  ${If} $(^RTL) = 1
    StrCpy $3 "${__NSD_CheckBox_EXSTYLE} | ${WS_EX_LAYOUTRTL}"
    IntOp $4 50 * $2
  ${Else}
    StrCpy $3 "${__NSD_CheckBox_EXSTYLE}"
    IntOp $4 0 * $2
  ${EndIf}
  IntOp $5 100 * $2
  IntOp $6 400 * $2
  IntOp $7 25 * $2
  IntOp $4 $4 / 96
  IntOp $5 $5 / 96
  IntOp $6 $6 / 96
  IntOp $7 $7 / 96
  System::Call 'user32::CreateWindowEx(i r3, w "${__NSD_CheckBox_CLASS}", w "$(deleteAppData)", i ${__NSD_CheckBox_STYLE}, i r4, i r5, i r6, i r7, p r1, i0, i0, i0) i .s'
  Pop $DeleteAppDataCheckbox
  SendMessage $HWNDPARENT ${WM_GETFONT} 0 0 $1
  SendMessage $DeleteAppDataCheckbox ${WM_SETFONT} $1 1
FunctionEnd
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.ConfirmLeave
Function un.ConfirmLeave
  SendMessage $DeleteAppDataCheckbox ${BM_GETCHECK} 0 0 $DeleteAppDataCheckboxState
FunctionEnd
!define MUI_PAGE_CUSTOMFUNCTION_PRE un.SkipIfPassive
!insertmacro MUI_UNPAGE_CONFIRM

; 2. Uninstalling Page
!insertmacro MUI_UNPAGE_INSTFILES

;Languages
; PageReinstall reads the misspelled `choowHowToInstall` as a fallback, and makensis warns
; about a language string that is read but never set, so default it to an empty string for
; every language. This runs before the language files are included, so a custom language
; file that only defines the old spelling overrides the default and the fallback shows its
; text. `0` as the language id means the language inserted right above.
; TODO: remove the `choowHowToInstall` fallback in a future major version
{{#each languages}}
!insertmacro MUI_LANGUAGE "{{this}}"
LangString choowHowToInstall 0 ""
{{/each}}
!insertmacro MUI_RESERVEFILE_LANGDLL
{{#each language_files}}
  !include "{{this}}"
{{/each}}

Function .onInit
  ; Evita execução simultânea com outro instalador/desinstalador do LabHub TV.
  System::Call 'kernel32::CreateMutex(i 0, i 0, t "LabHubTVSetupMutex") i .r0'
  ${If} $0 != 0
    System::Call 'kernel32::GetLastError() i .r0'
    ${If} $0 == 183
      MessageBox MB_ICONSTOP "Outro instalador ou desinstalador do LabHub TV já está em execução."
      Quit
    ${EndIf}
  ${EndIf}

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/NS" $NoShortcutMode
  ${IfNot} ${Errors}
    StrCpy $NoShortcutMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}

  !if "${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !insertmacro SetContext

  ${If} $INSTDIR == "${PLACEHOLDER_INSTALL_DIR}"
    ; Set default install location
    !if "${INSTALLMODE}" == "perMachine"
      ${If} ${RunningX64}
        !if "${ARCH}" == "x64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else if "${ARCH}" == "arm64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else
          StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
        !endif
      ${Else}
        StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
      ${EndIf}
    !else if "${INSTALLMODE}" == "currentUser"
      StrCpy $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}"
    !endif

    Call RestorePreviousInstallLocation
  ${EndIf}


  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_INIT
  !endif

  ; Abort downgrades if they are disabled, in the modes that skip the reinstall page choice:
  ; silent, passive and update
  !if "${ALLOWDOWNGRADES}" == "false"
  ${If} ${Silent}
  ${OrIf} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    ; Compare with the same installation the reinstall page would: a WiX one first
    Call FindWixInstall
    ${If} $R6 != ""
      ReadRegStr $R0 HKLM "$R6" "DisplayVersion"
    ${Else}
      ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
    ${EndIf}
    nsis_tauri_utils::SemverCompare "${VERSION}" $R0
    Pop $R0
    ; If downgrading
    ${If} $R0 = -1
      ${If} ${Silent}
        System::Call 'kernel32::AttachConsole(i -1)i.r0'
        ${If} $0 <> 0
          System::Call 'kernel32::GetStdHandle(i -11)i.r0'
          System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)' ; set red color
          FileWrite $0 "$(silentDowngrades)"
        ${EndIf}
      ${Else}
        MessageBox MB_ICONSTOP "$(silentDowngrades)"
      ${EndIf}
      Abort
    ${EndIf}
  ${EndIf}
  !endif
FunctionEnd

Function LabHubSetupUI
  ${If} $LabHubUI != ""
    Return
  ${EndIf}

  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i.r0'
  ${If} $0 == 0
    StrCpy $LabHubDPI 96
  ${Else}
    StrCpy $LabHubDPI $0
  ${EndIf}

  IntOp $1 $LabHubDPI * 1000
  IntOp $1 $1 / 96
  System::Call 'user32::GetSystemMetrics(i 0) i.r2'
  System::Call 'user32::GetSystemMetrics(i 1) i.r3'

  StrCpy $LabHubUI 1000
  ${If} $1 >= 2000
  ${AndIf} $2 >= 2060
  ${AndIf} $3 >= 1100
    StrCpy $LabHubUI 2000
  ${ElseIf} $1 >= 1500
  ${AndIf} $2 >= 1560
  ${AndIf} $3 >= 850
    StrCpy $LabHubUI 1500
  ${ElseIf} $1 >= 1250
  ${AndIf} $2 >= 1310
  ${AndIf} $3 >= 725
    StrCpy $LabHubUI 1250
  ${EndIf}

  !insertmacro LHSCALE $LabHubClientW 1000
  !insertmacro LHSCALE $LabHubClientH 500
  !insertmacro LHSCALE $LabHubSidebarW 330
  !insertmacro LHSCALE $LabHubFooterY 444
  !insertmacro LHSCALE $LabHubFooterH 56

  ; dimensiona e centraliza a janela
  System::Alloc 16
  Pop $1
  System::Call 'user32::GetWindowRect(p $HWNDPARENT, p $1)'
  System::Call '*$1(i .r2, i .r3, i .r4, i .r5)'
  IntOp $6 $4 - $2
  IntOp $7 $5 - $3
  System::Call 'user32::GetClientRect(p $HWNDPARENT, p $1)'
  System::Call '*$1(i .r2, i .r3, i .r4, i .r5)'
  IntOp $8 $4 - $2
  IntOp $9 $5 - $3
  System::Free $1
  IntOp $6 $6 - $8
  IntOp $6 $6 + $LabHubClientW
  IntOp $7 $7 - $9
  IntOp $7 $7 + $LabHubClientH

  System::Call 'user32::GetSystemMetrics(i 0) i.r2'
  System::Call 'user32::GetSystemMetrics(i 1) i.r3'
  IntOp $4 $2 - $6
  IntOp $4 $4 / 2
  IntOp $5 $3 - $7
  IntOp $5 $5 / 2
  ${If} $4 < 0
    StrCpy $4 0
  ${EndIf}
  ${If} $5 < 0
    StrCpy $5 0
  ${EndIf}
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i $4, i $5, i $6, i $7, i 0x0004)'

  ; remove o rodapé branco e a marcação padrão do MUI
  GetDlgItem $0 $HWNDPARENT 1256
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 1028
  ShowWindow $0 0
  SetCtlColors $HWNDPARENT "F4F7FB" "0B1220"

  ; barra de título escura (Windows 10 1809+ / Windows 11)
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4) i.r0'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 19, *i 1, i 4) i.r0'

  ; divisor do rodapé
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "", i 0x50000000, i 0, i $LabHubFooterY, i $LabHubClientW, i 2, p $HWNDPARENT, p 0, p 0, p 0) i.r0'
  StrCpy $LabHubFooterLine $0
  SetCtlColors $LabHubFooterLine "" "22314D"

  !insertmacro LHFONT $LabHubFontTitle 30 700
  !insertmacro LHFONT $LabHubFontTitleSmall 26 700
  !insertmacro LHFONT $LabHubFontSub 14 400
  !insertmacro LHFONT $LabHubFontBody 13 400
  !insertmacro LHFONT $LabHubFontSmall 10 400
  !insertmacro LHFONT $LabHubFontButton 10 600

  InitPluginsDir
  File /oname=$PLUGINSDIR\labhub-sidebar.bmp "${SIDEBARIMAGE}"
  System::Call 'user32::LoadImage(p 0, w "$PLUGINSDIR\labhub-sidebar.bmp", i 0, i 0, i 0, i 0x10) p.r0'
  StrCpy $LabHubSidebarSrc $0
  Call LabHubScaleSidebar
FunctionEnd

Function LabHubScaleSidebar
  ${If} $LabHubSidebarSrc == ""
    Return
  ${EndIf}
  System::Call 'user32::GetDC(p $HWNDPARENT) p.r0'
  System::Call 'gdi32::CreateCompatibleDC(p $0) p.r1'
  System::Call 'gdi32::CreateCompatibleBitmap(p $0, i $LabHubSidebarW, i $LabHubFooterY) p.r2'
  System::Call 'gdi32::SelectObject(p $1, p $2) p.r3'
  System::Call 'gdi32::CreateCompatibleDC(p $0) p.r4'
  System::Call 'gdi32::SelectObject(p $4, p $LabHubSidebarSrc) p.r5'
  System::Call 'gdi32::SetStretchBltMode(p $1, i 4) i.r6'
  System::Call 'gdi32::StretchBlt(p $1, i 0, i 0, i $LabHubSidebarW, i $LabHubFooterY, p $4, i 0, i 0, i 660, i 888, i 0x00CC0020) i.r7'
  System::Call 'gdi32::DeleteDC(p $4)'
  System::Call 'gdi32::DeleteDC(p $1)'
  System::Call 'user32::ReleaseDC(p $HWNDPARENT, p $0)'
  StrCpy $LabHubSidebarBmp $2
FunctionEnd

Function LabHubHideMuiHeader
  GetDlgItem $0 $HWNDPARENT 1034
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 1035
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 1037
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 1038
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 1039
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 1046
  ShowWindow $0 0
FunctionEnd

Function LabHubLayoutFooter
  !insertmacro LHSCALE $LabHubBtnW 168
  !insertmacro LHSCALE $LabHubBtnH 34
  IntOp $LabHubBtnY $LabHubFooterH - $LabHubBtnH
  IntOp $LabHubBtnY $LabHubBtnY / 2
  IntOp $LabHubBtnY $LabHubBtnY + $LabHubFooterY
  IntOp $LabHubNextX $LabHubClientW - $LabHubBtnW
  !insertmacro LHSCALE $LabHubTmp 70
  IntOp $LabHubNextX $LabHubNextX - $LabHubTmp

  GetDlgItem $0 $HWNDPARENT 1
  GetDlgItem $1 $HWNDPARENT 2
  GetDlgItem $2 $HWNDPARENT 3
  SendMessage $0 ${WM_SETFONT} $LabHubFontButton 1
  SendMessage $1 ${WM_SETFONT} $LabHubFontButton 1
  SendMessage $2 ${WM_SETFONT} $LabHubFontButton 1
  SendMessage $0 ${BM_SETSTYLE} 1 1
  SendMessage $1 ${BM_SETSTYLE} 0 1
  SendMessage $2 ${BM_SETSTYLE} 0 1

  ${If} $LabHubPageKind == 1
    ShowWindow $0 0
    ShowWindow $1 1
    ShowWindow $2 0
    SendMessage $1 ${WM_SETTEXT} 0 "STR:Cancelar"
    System::Call 'user32::SetWindowPos(p $1, p 0, i $LabHubNextX, i $LabHubBtnY, i $LabHubBtnW, i $LabHubBtnH, i 0x0010)'
  ${ElseIf} $LabHubPageKind == 2
    ShowWindow $0 1
    ShowWindow $1 0
    ShowWindow $2 0
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Concluir"
    System::Call 'user32::SetWindowPos(p $0, p 0, i $LabHubNextX, i $LabHubBtnY, i $LabHubBtnW, i $LabHubBtnH, i 0x0010)'
  ${ElseIf} $LabHubPageKind == 5
    ShowWindow $0 1
    ShowWindow $1 1
    ShowWindow $2 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Continuar"
    SendMessage $1 ${WM_SETTEXT} 0 "STR:Cancelar"
    SendMessage $2 ${WM_SETTEXT} 0 "STR:< Voltar"
    !insertmacro LHSCALE $3 120
    !insertmacro LHSCALE $4 100
    !insertmacro LHSCALE $5 12
    !insertmacro LHSCALE $6 10
    IntOp $7 $LabHubNextX - $3
    IntOp $7 $7 - $5
    IntOp $8 $7 - $4
    IntOp $8 $8 - $6
    System::Call 'user32::SetWindowPos(p $1, p 0, i $7, i $LabHubBtnY, i $3, i $LabHubBtnH, i 0x0010)'
    System::Call 'user32::SetWindowPos(p $2, p 0, i $8, i $LabHubBtnY, i $4, i $LabHubBtnH, i 0x0010)'
    System::Call 'user32::SetWindowPos(p $0, p 0, i $LabHubNextX, i $LabHubBtnY, i $LabHubBtnW, i $LabHubBtnH, i 0x0010)'
  ${ElseIf} $LabHubPageKind == 4
    ShowWindow $0 1
    ShowWindow $1 1
    ShowWindow $2 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Instalar"
    SendMessage $1 ${WM_SETTEXT} 0 "STR:Cancelar"
    SendMessage $2 ${WM_SETTEXT} 0 "STR:< Voltar"
    !insertmacro LHSCALE $3 120
    !insertmacro LHSCALE $4 100
    !insertmacro LHSCALE $5 12
    !insertmacro LHSCALE $6 10
    IntOp $7 $LabHubNextX - $3
    IntOp $7 $7 - $5
    IntOp $8 $7 - $4
    IntOp $8 $8 - $6
    System::Call 'user32::SetWindowPos(p $1, p 0, i $7, i $LabHubBtnY, i $3, i $LabHubBtnH, i 0x0010)'
    System::Call 'user32::SetWindowPos(p $2, p 0, i $8, i $LabHubBtnY, i $4, i $LabHubBtnH, i 0x0010)'
    System::Call 'user32::SetWindowPos(p $0, p 0, i $LabHubNextX, i $LabHubBtnY, i $LabHubBtnW, i $LabHubBtnH, i 0x0010)'
  ${ElseIf} $LabHubPageKind == 6
    ShowWindow $0 1
    ShowWindow $1 1
    ShowWindow $2 0
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Apagar dados e reinstalar"
    SendMessage $1 ${WM_SETTEXT} 0 "STR:Cancelar"
    !insertmacro LHSCALE $3 190
    !insertmacro LHSCALE $4 140
    !insertmacro LHSCALE $5 12
    IntOp $7 $LabHubNextX - $3
    IntOp $7 $7 - $5
    IntOp $8 $7 - $4
    IntOp $8 $8 - $5
    System::Call 'user32::SetWindowPos(p $1, p 0, i $7, i $LabHubBtnY, i $3, i $LabHubBtnH, i 0x0010)'
    System::Call 'user32::SetWindowPos(p $0, p 0, i $LabHubNextX, i $LabHubBtnY, i $4, i $LabHubBtnH, i 0x0010)'
    ; A opção destrutiva não é o padrão: Enter/ESC cancelam.
    SendMessage $HWNDPARENT ${DM_SETDEFID} 2 0
    System::Call 'user32::SetFocus(p $1) p.r0'
  ${Else}
    ShowWindow $0 1
    ShowWindow $1 1
    ShowWindow $2 0
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Instalar"
    SendMessage $1 ${WM_SETTEXT} 0 "STR:Cancelar"
    !insertmacro LHSCALE $3 120
    !insertmacro LHSCALE $4 12
    IntOp $5 $LabHubNextX - $3
    IntOp $5 $5 - $4
    System::Call 'user32::SetWindowPos(p $1, p 0, i $5, i $LabHubBtnY, i $3, i $LabHubBtnH, i 0x0010)'
    System::Call 'user32::SetWindowPos(p $0, p 0, i $LabHubNextX, i $LabHubBtnY, i $LabHubBtnW, i $LabHubBtnH, i 0x0010)'
  ${EndIf}
FunctionEnd

Function LabHubWelcomeShow
  ${If} $PassiveMode = 1
    Abort
  ${EndIf}
  Call LabHubSetupUI
  StrCpy $LabHubPageKind 0

  nsDialogs::Create 1018
  Pop $LabHubDialog
  ${If} $LabHubDialog == error
    Abort
  ${EndIf}
  System::Call 'user32::SetWindowPos(p $LabHubDialog, p 0, i 0, i 0, i $LabHubClientW, i $LabHubFooterY, i 0x0004)'
  SetCtlColors $LabHubDialog "" "0B1220"
  Call LabHubLayoutFooter

  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD}|${SS_BITMAP} 0 0 0 $LabHubSidebarW $LabHubFooterY ""
  Pop $0
  SendMessage $0 0x0172 0 $LabHubSidebarBmp

  !insertmacro LHSCALE $R0 370
  !insertmacro LHSCALE $R1 36
  !insertmacro LHSCALE $R2 560
  !insertmacro LHSCALE $R3 24
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R3 "INSTALAÇÃO PARA WINDOWS"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontSub 1
  SetCtlColors $1 "4CC3FF" "0B1220"

  !insertmacro LHSCALE $R1 62
  !insertmacro LHSCALE $R3 56
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R3 "Bem-vindo ao LabHub TV"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontTitle 1
  SetCtlColors $1 "F4F7FB" "0B1220"

  !insertmacro LHSCALE $R1 124
  !insertmacro LHSCALE $R3 56
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 $R3 "Sua plataforma de exibição institucional está pronta para ser instalada."
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontSub 1
  SetCtlColors $1 "A9B7D0" "0B1220"

  !insertmacro LHSCALE $R4 30
  !insertmacro LHSCALE $R5 34
  !insertmacro LHSCALE $R7 42
  !insertmacro LHSCALE $R3 540
  IntOp $R6 $R0 + $R5

  !insertmacro LHSCALE $R1 200
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R4 $R4 "✓"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $1 "4CC3FF" "0B1220"
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R6 $R1 $R3 $R4 "Programação automatizada"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $1 "F4F7FB" "0B1220"

  IntOp $R1 $R1 + $R7
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R4 $R4 "✓"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $1 "4CC3FF" "0B1220"
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R6 $R1 $R3 $R4 "Conteúdo local pelo Google Drive"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $1 "F4F7FB" "0B1220"

  IntOp $R1 $R1 + $R7
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R4 $R4 "✓"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $1 "4CC3FF" "0B1220"
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R6 $R1 $R3 $R4 "Preparado para operação contínua"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $1 "F4F7FB" "0B1220"

  !insertmacro LHSCALE $R1 330
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 $R2 2 ""
  Pop $1
  SetCtlColors $1 "" "22314D"

  !insertmacro LHSCALE $R1 402
  nsDialogs::CreateControl STATIC ${WS_VISIBLE}|${WS_CHILD} 0 $R0 $R1 260 22 "Versão ${VERSION}"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $LabHubFontSmall 1
  SetCtlColors $1 "A9B7D0" "0B1220"

  nsDialogs::Show
FunctionEnd

Function LabHubWelcomeLeave
FunctionEnd

Function LabHubDirectoryShow
  Call LabHubHideMuiHeader
  System::Call 'user32::SetWindowPos(p $mui.DirectoryPage, p 0, i 0, i 0, i $LabHubClientW, i $LabHubFooterY, i 0x0004)'
  SetCtlColors $mui.DirectoryPage "" "0B1220"
  ShowWindow $mui.DirectoryPage.Text 0
  SetCtlColors $mui.DirectoryPage.Text "0B1220" "0B1220"
  SetCtlColors $mui.DirectoryPage.SpaceRequired "A9B7D0" "0B1220"
  SetCtlColors $mui.DirectoryPage.SpaceAvailable "A9B7D0" "0B1220"

  ; sidebar consistente com as demais telas
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "", i 0x5000000E, i 0, i 0, i $LabHubSidebarW, i $LabHubFooterY, p $mui.DirectoryPage, p 0, p 0, p 0) i.r4'
  SendMessage $4 0x0172 0 $LabHubSidebarBmp

  !insertmacro LHSCALE $R0 370
  !insertmacro LHSCALE $R1 36
  !insertmacro LHSCALE $R2 560
  !insertmacro LHSCALE $R3 24
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "LOCAL DE INSTALAÇÃO", i 0x50000000, i $R0, i $R1, i $R2, i $R3, p $mui.DirectoryPage, p 0, p 0, p 0) i.r4'
  SendMessage $4 ${WM_SETFONT} $LabHubFontSub 1
  SetCtlColors $4 "4CC3FF" "0B1220"

  !insertmacro LHSCALE $R1 62
  !insertmacro LHSCALE $R3 54
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "Escolha o local de instalação", i 0x50000000, i $R0, i $R1, i $R2, i $R3, p $mui.DirectoryPage, p 0, p 0, p 0) i.r4'
  SendMessage $4 ${WM_SETFONT} $LabHubFontTitleSmall 1
  SetCtlColors $4 "F4F7FB" "0B1220"

  !insertmacro LHSCALE $R1 126
  !insertmacro LHSCALE $R3 56
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "O LabHub TV será instalado na pasta abaixo. Você pode escolher outra pasta.", i 0x50000000, i $R0, i $R1, i $R2, i $R3, p $mui.DirectoryPage, p 0, p 0, p 0) i.r4'
  SendMessage $4 ${WM_SETFONT} $LabHubFontSub 1
  SetCtlColors $4 "A9B7D0" "0B1220"

  ; grupo de pasta
  !insertmacro LHSCALE $R1 214
  !insertmacro LHSCALE $R3 122
  System::Call 'user32::SetWindowPos(p $mui.DirectoryPage.DirectoryBox, p 0, i $R0, i $R1, i $R2, i $R3, i 0x0014)'
  SendMessage $mui.DirectoryPage.DirectoryBox ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $mui.DirectoryPage.DirectoryBox "A9B7D0" "0B1220"
  SendMessage $mui.DirectoryPage.DirectoryBox ${WM_SETTEXT} 0 "STR:"

  !insertmacro LHSCALE $R0 382
  !insertmacro LHSCALE $R1 268
  !insertmacro LHSCALE $R2 390
  !insertmacro LHSCALE $R3 28
  System::Call 'user32::SetWindowPos(p $mui.DirectoryPage.Directory, p 0, i $R0, i $R1, i $R2, i $R3, i 0x0014)'
  SendMessage $mui.DirectoryPage.Directory ${WM_SETFONT} $LabHubFontBody 1

  !insertmacro LHSCALE $R0 782
  !insertmacro LHSCALE $R2 130
  System::Call 'user32::SetWindowPos(p $mui.DirectoryPage.BrowseButton, p 0, i $R0, i $R1, i $R2, i $R3, i 0x0014)'
  SendMessage $mui.DirectoryPage.BrowseButton ${WM_SETFONT} $LabHubFontSmall 1

  !insertmacro LHSCALE $R0 370
  !insertmacro LHSCALE $R1 350
  !insertmacro LHSCALE $R2 560
  System::Call 'user32::SetWindowPos(p $mui.DirectoryPage.SpaceRequired, p 0, i $R0, i $R1, i $R2, i 22, i 0x0014)'
  SendMessage $mui.DirectoryPage.SpaceRequired ${WM_SETFONT} $LabHubFontSmall 1
  !insertmacro LHSCALE $R1 374
  System::Call 'user32::SetWindowPos(p $mui.DirectoryPage.SpaceAvailable, p 0, i $R0, i $R1, i $R2, i 22, i 0x0014)'
  SendMessage $mui.DirectoryPage.SpaceAvailable ${WM_SETFONT} $LabHubFontSmall 1

  StrCpy $LabHubPageKind 4
  Call LabHubLayoutFooter
FunctionEnd

Function LabHubInstallShow
  ${If} $LabHubUI == ""
    Call LabHubSetupUI
  ${EndIf}
  StrCpy $LabHubPageKind 1
  Call LabHubHideMuiHeader

  System::Call 'user32::SetWindowPos(p $mui.InstFilesPage, p 0, i 0, i 0, i $LabHubClientW, i $LabHubFooterY, i 0x0004)'
  SetCtlColors $mui.InstFilesPage "" "0B1220"
  ShowWindow $mui.InstFilesPage.Log 0
  ShowWindow $mui.InstFilesPage.ShowLogButton 0

  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "", i 0x5000000E, i 0, i 0, i $LabHubSidebarW, i $LabHubFooterY, p $mui.InstFilesPage, p 0, p 0, p 0) i.r4'
  SendMessage $4 0x0172 0 $LabHubSidebarBmp

  !insertmacro LHSCALE $R0 370
  !insertmacro LHSCALE $R1 340
  !insertmacro LHSCALE $R2 560
  !insertmacro LHSCALE $R3 14
  System::Call 'user32::SetWindowPos(p $mui.InstFilesPage.ProgressBar, p 0, i $R0, i $R1, i $R2, i $R3, i 0x0014)'
  System::Call 'uxtheme::SetWindowTheme(p $mui.InstFilesPage.ProgressBar, w "", w "")'
  SendMessage $mui.InstFilesPage.ProgressBar 0x0409 0 0x00FF6B2F
  SendMessage $mui.InstFilesPage.ProgressBar 0x2001 0 0x002E1A11

  !insertmacro LHSCALE $R1 300
  !insertmacro LHSCALE $R3 30
  System::Call 'user32::SetWindowPos(p $mui.InstFilesPage.Text, p 0, i $R0, i $R1, i $R2, i $R3, i 0x0014)'
  SendMessage $mui.InstFilesPage.Text ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $mui.InstFilesPage.Text "A9B7D0" "0B1220"

  !insertmacro LHSCALE $R0 370
  !insertmacro LHSCALE $R1 36
  !insertmacro LHSCALE $R2 560
  !insertmacro LHSCALE $R3 24
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "INSTALAÇÃO EM ANDAMENTO", i 0x50000000, i $R0, i $R1, i $R2, i $R3, p $mui.InstFilesPage, p 0, p 0, p 0) i.r4'
  StrCpy $LabHubInstallEyebrow $4
  SendMessage $4 ${WM_SETFONT} $LabHubFontSub 1
  SetCtlColors $4 "4CC3FF" "0B1220"

  !insertmacro LHSCALE $R1 62
  !insertmacro LHSCALE $R3 56
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "Instalando o LabHub TV", i 0x50000000, i $R0, i $R1, i $R2, i $R3, p $mui.InstFilesPage, p 0, p 0, p 0) i.r4'
  StrCpy $LabHubInstallTitle $4
  SendMessage $4 ${WM_SETFONT} $LabHubFontTitle 1
  SetCtlColors $4 "F4F7FB" "0B1220"

  !insertmacro LHSCALE $R1 124
  !insertmacro LHSCALE $R3 56
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "Aguarde enquanto os arquivos necessários são configurados.", i 0x50000000, i $R0, i $R1, i $R2, i $R3, p $mui.InstFilesPage, p 0, p 0, p 0) i.r4'
  StrCpy $LabHubInstallSub $4
  SendMessage $4 ${WM_SETFONT} $LabHubFontSub 1
  SetCtlColors $4 "A9B7D0" "0B1220"

  Call LabHubLayoutFooter
FunctionEnd

; Redesenha a página de conclusão do MUI com a UI institucional.
Function LabHubFinishShow
  StrCpy $LabHubPageKind 2
  System::Call 'user32::SetWindowPos(p $mui.FinishPage, p 0, i 0, i 0, i $LabHubClientW, i $LabHubFooterY, i 0x0004)'
  SetCtlColors $mui.FinishPage "" "0B1220"
  ShowWindow $mui.FinishPage.Image 0
  ShowWindow $mui.FinishPage.Title 0
  ShowWindow $mui.FinishPage.Text 0

  Call LabHubLayoutFooter

  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "", i 0x5000000E, i 0, i 0, i $LabHubSidebarW, i $LabHubFooterY, p $mui.FinishPage, p 0, p 0, p 0) i.r4'
  SendMessage $4 0x0172 0 $LabHubSidebarBmp

  !insertmacro LHSCALE $R0 370
  !insertmacro LHSCALE $R1 40
  !insertmacro LHSCALE $R2 590
  !insertmacro LHSCALE $R3 24
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "INSTALAÇÃO CONCLUÍDA", i 0x50000000, i $R0, i $R1, i $R2, i $R3, p $mui.FinishPage, p 0, p 0, p 0) i.r4'
  SendMessage $4 ${WM_SETFONT} $LabHubFontSub 1
  SetCtlColors $4 "4CC3FF" "0B1220"

  !insertmacro LHSCALE $R1 70
  !insertmacro LHSCALE $R3 52
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "LabHub TV instalado com sucesso", i 0x50000000, i $R0, i $R1, i $R2, i $R3, p $mui.FinishPage, p 0, p 0, p 0) i.r4'
  SendMessage $4 ${WM_SETFONT} $LabHubFontTitleSmall 1
  SetCtlColors $4 "F4F7FB" "0B1220"

  !insertmacro LHSCALE $R1 128
  !insertmacro LHSCALE $R3 44
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "O aplicativo está pronto para configuração e operação contínua.", i 0x50000000, i $R0, i $R1, i $R2, i $R3, p $mui.FinishPage, p 0, p 0, p 0) i.r4'
  SendMessage $4 ${WM_SETFONT} $LabHubFontSub 1
  SetCtlColors $4 "A9B7D0" "0B1220"

  ; Iniciar com o Windows (tarefa no Agendador de Tarefas)
  !insertmacro LHSCALE $R1 196
  System::Call 'user32::CreateWindowEx(i 0, w "BUTTON", w "Iniciar o LabHub TV ao entrar no Windows", i 0x50010003, i $R0, i $R1, i $R2, i 24, p $mui.FinishPage, p 100, p 0, p 0) i.r4'
  StrCpy $LabHubStartupCheck $4
  SendMessage $4 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $4 "F4F7FB" "0B1220"
  System::Call 'uxtheme::SetWindowTheme(p $4, w " ", w " ")'
  ReadRegStr $0 HKCU "Software\LabHub TV" "AutostartRequested"
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\LabHub TV" "Autostart"
  ${EndIf}
  ${If} $0 == "1"
    SendMessage $LabHubStartupCheck ${BM_SETCHECK} 1 0
  ${Else}
    SendMessage $LabHubStartupCheck ${BM_SETCHECK} 0 0
  ${EndIf}

  !insertmacro LHSCALE $R1 232
  System::Call 'user32::CreateWindowEx(i 0, w "BUTTON", w "Abrir o LabHub TV agora", i 0x50010003, i $R0, i $R1, i $R2, i 24, p $mui.FinishPage, p 101, p 0, p 0) i.r4'
  StrCpy $LabHubOpenCheck $4
  SendMessage $4 ${BM_SETCHECK} 1 0
  SendMessage $4 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $4 "F4F7FB" "0B1220"
  System::Call 'uxtheme::SetWindowTheme(p $4, w " ", w " ")'

  !insertmacro LHSCALE $R1 268
  System::Call 'user32::CreateWindowEx(i 0, w "BUTTON", w "Criar atalho na área de trabalho", i 0x50010003, i $R0, i $R1, i $R2, i 24, p $mui.FinishPage, p 102, p 0, p 0) i.r4'
  StrCpy $LabHubShortcutCheck $4
  SendMessage $4 ${BM_SETCHECK} 1 0
  SendMessage $4 ${WM_SETFONT} $LabHubFontBody 1
  SetCtlColors $4 "F4F7FB" "0B1220"
  System::Call 'uxtheme::SetWindowTheme(p $4, w " ", w " ")'

  !insertmacro LHSCALE $R1 310
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "Ao entrar no Windows, uma tarefa interativa e segura é criada no Agendador de Tarefas.", i 0x50000000, i $R0, i $R1, i $R2, i 22, p $mui.FinishPage, p 0, p 0, p 0) i.r4'
  SendMessage $4 ${WM_SETFONT} $LabHubFontSmall 1
  SetCtlColors $4 "A9B7D0" "0B1220"

  !insertmacro LHSCALE $R1 360
  System::Call 'user32::CreateWindowEx(i 0, w "STATIC", w "Versão ${VERSION}", i 0x50000000, i $R0, i $R1, i 260, i 22, p $mui.FinishPage, p 0, p 0, p 0) i.r4'
  SendMessage $4 ${WM_SETFONT} $LabHubFontSmall 1
  SetCtlColors $4 "A9B7D0" "0B1220"
FunctionEnd

Function LabHubFinishLeave
  ; Preferência de inicialização com o Windows. A normalização é executada
  ; sempre para não duplicar mecanismos em atualizações e reparos.
  SendMessage $LabHubStartupCheck ${BM_GETCHECK} 0 0 $1
  ${If} $1 == 1
    StrCpy $LabHubStartupRequested 1
  ${Else}
    StrCpy $LabHubStartupRequested 0
  ${EndIf}
  WriteRegStr HKCU "Software\LabHub TV" "AutostartRequested" "$LabHubStartupRequested"
  StrCpy $LabHubStartupAction $LabHubStartupRequested
  Call LabHubApplyStartup

  SendMessage $LabHubShortcutCheck ${BM_GETCHECK} 0 0 $0
  ${If} $0 == 1
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}
  SendMessage $LabHubOpenCheck ${BM_GETCHECK} 0 0 $0
  ${If} $0 == 1
    Call RunMainBinary
  ${EndIf}
FunctionEnd

; Normaliza a inicialização automática sem elevação, senha ou conta de outro usuário.
; ONLOGON é representado pelo trigger -AtLogOn do Agendador de Tarefas, com
; principal interativo do usuário atual e privilégio LIMITED.
Function LabHubApplyStartup
  ; ONLOGON: trigger -AtLogOn do Agendador de Tarefas, no usuário atual.
  ; Caminho com espaços/acentos é passado por variável de ambiente, sem aspas aninhadas.
  System::Call 'kernel32::SetEnvironmentVariable(w "LABHUB_TASK_TARGET", w "$INSTDIR\${MAINBINARYNAME}.exe") i.r0'

  ; Remove sempre o mecanismo alternativo para nunca haver duplicidade.
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV\LabHub TV.lnk"
  RMDir "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV"

  ${If} $LabHubStartupAction == 1
    nsExec::ExecToStack "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command $\"$$ErrorActionPreference='Stop';$$u=[Security.Principal.WindowsIdentity]::GetCurrent().Name;$$a=New-ScheduledTaskAction -Execute $$env:LABHUB_TASK_TARGET;$$t=New-ScheduledTaskTrigger -AtLogOn -User $$u;$$p=New-ScheduledTaskPrincipal -UserId $$u -LogonType Interactive -RunLevel Limited;Register-ScheduledTask -TaskName 'LabHub TV' -Action $$a -Trigger $$t -Principal $$p -Force | Out-Null;$$q=Get-ScheduledTask -TaskName 'LabHub TV' -ErrorAction Stop;if($$q.Principal.LogonType -ne 'Interactive' -or $$q.Principal.RunLevel -ne 'Limited' -or $$q.Principal.UserId -ne $$u){exit 3};if($$q.Actions.Count -ne 1 -or $$q.Actions[0].Execute -ne $$env:LABHUB_TASK_TARGET){exit 4};if(-not($$q.Triggers|Where-Object{$$_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' -and $$_.User -eq $$u})){exit 5};exit 0$\""
    Pop $LabHubTaskExit
    Pop $LabHubTaskOutput
    StrCpy $LabHubTaskOutput $LabHubTaskOutput 500

    ${If} $LabHubTaskExit == 0
      WriteRegStr HKCU "Software\LabHub TV" "Autostart" "1"
      WriteRegStr HKCU "Software\LabHub TV" "AutostartMechanism" "Task"
      DetailPrint "LabHub TV: inicialização ativada no Agendador de Tarefas (interativa, LIMITED)."
      Goto startup_done
    ${EndIf}

    DetailPrint "LabHub TV: falha ao criar a tarefa (código $LabHubTaskExit). $LabHubTaskOutput"

    ; Nunca deixa uma tarefa parcial/inválida coexistir com a alternativa.
    nsExec::ExecToStack "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command $\"$$ErrorActionPreference='Stop';$$q=Get-ScheduledTask -TaskName 'LabHub TV' -ErrorAction SilentlyContinue;if($$q){Unregister-ScheduledTask -TaskName 'LabHub TV' -Confirm:$$false};if(Get-ScheduledTask -TaskName 'LabHub TV' -ErrorAction SilentlyContinue){exit 2};exit 0$\""
    Pop $LabHubTaskExit
    Pop $LabHubTaskOutput

    ; A alternativa é usada somente porque o usuário marcou explicitamente a opção.
    CreateDirectory "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
    CreateShortCut "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0 SW_SHOWNORMAL "" "LabHub TV"
    ${If} ${FileExists} "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV.lnk"
      WriteRegStr HKCU "Software\LabHub TV" "Autostart" "1"
      WriteRegStr HKCU "Software\LabHub TV" "AutostartMechanism" "StartupShortcut"
      DetailPrint "LabHub TV: tarefa indisponível; atalho Inicializar ativado como alternativa autorizada."
    ${Else}
      WriteRegStr HKCU "Software\LabHub TV" "Autostart" "0"
      WriteRegStr HKCU "Software\LabHub TV" "AutostartMechanism" "None"
      MessageBox MB_ICONEXCLAMATION "Não foi possível ativar a inicialização automática do LabHub TV. A preferência foi mantida, mas nenhum mecanismo está ativo."
    ${EndIf}
  ${Else}
    nsExec::ExecToStack "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command $\"$$ErrorActionPreference='Stop';$$q=Get-ScheduledTask -TaskName 'LabHub TV' -ErrorAction SilentlyContinue;if($$q){Unregister-ScheduledTask -TaskName 'LabHub TV' -Confirm:$$false};if(Get-ScheduledTask -TaskName 'LabHub TV' -ErrorAction SilentlyContinue){exit 2};exit 0$\""
    Pop $LabHubTaskExit
    Pop $LabHubTaskOutput
    StrCpy $LabHubTaskOutput $LabHubTaskOutput 500
    ${If} $LabHubTaskExit != 0
      DetailPrint "LabHub TV: falha ao remover a tarefa (código $LabHubTaskExit). $LabHubTaskOutput"
    ${EndIf}

    Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV.lnk"
    Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV\LabHub TV.lnk"
    RMDir "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV"
    WriteRegStr HKCU "Software\LabHub TV" "Autostart" "0"
    WriteRegStr HKCU "Software\LabHub TV" "AutostartMechanism" "None"
    DetailPrint "LabHub TV: inicialização automática desativada."
  ${EndIf}

  startup_done:
  System::Call 'kernel32::SetEnvironmentVariable(w "LABHUB_TASK_TARGET", w "") i.r0'
FunctionEnd

Section WebView2
  ; Check if Webview2 is already installed and skip this section
  ${If} ${RunningX64}
    ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${Else}
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}
  ${If} $4 == ""
    ReadRegStr $4 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}

  ${If} $4 == ""
    ; Webview2 installation
    ;
    ; Skip if updating
    ${If} $UpdateMode <> 1
      !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        DetailPrint "$(webview2Downloading)"
        NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Pop $0
        ${If} $0 == "success"
          DetailPrint "$(webview2DownloadSuccess)"
        ${Else}
          DetailPrint "$(webview2DownloadError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "embedBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebview2Setup.exe" "${WEBVIEW2BOOTSTRAPPERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "offlineInstaller"
        Delete "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" "${WEBVIEW2INSTALLERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        Goto install_webview2
      !endif

      Goto webview2_done

      install_webview2:
        DetailPrint "$(installingWebview2)"
        ; $6 holds the path to the webview2 installer
        ExecWait "$6 ${WEBVIEW2INSTALLERARGS} /install" $1
        ${If} $1 = 0
          DetailPrint "$(webview2InstallSuccess)"
        ${Else}
          DetailPrint "$(webview2InstallError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
      webview2_done:
    ${EndIf}
  ${Else}
    !if "${MINIMUMWEBVIEW2VERSION}" != ""
      ${VersionCompare} "${MINIMUMWEBVIEW2VERSION}" "$4" $R0
      ${If} $R0 = 1
        update_webview:
          DetailPrint "$(installingWebview2)"
          ${If} ${RunningX64}
            ReadRegStr $R1 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate" "path"
          ${Else}
            ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 == ""
            ReadRegStr $R1 HKCU "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 != ""
            ; Chromium updater docs: https://source.chromium.org/chromium/chromium/src/+/main:docs/updater/user_manual.md
            ; Modified from "HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft EdgeWebView\ModifyPath"
            ExecWait `"$R1" /install appguid=${WEBVIEW2APPGUID}&needsadmin=true` $1
            ${If} $1 = 0
              DetailPrint "$(webview2InstallSuccess)"
            ${Else}
              MessageBox MB_ICONEXCLAMATION|MB_ABORTRETRYIGNORE "$(webview2InstallError)" IDIGNORE ignore IDRETRY update_webview
              Quit
              ignore:
            ${EndIf}
          ${EndIf}
      ${EndIf}
    !endif
  ${EndIf}
SectionEnd

Section Install
  SetOutPath $INSTDIR

  !ifmacrodef NSIS_HOOK_PREINSTALL
    !insertmacro NSIS_HOOK_PREINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Copy main executable
  File "${MAINBINARYSRCPATH}"

  ; Copy resources
  {{#each resources_dirs}}
    CreateDirectory "$INSTDIR\\{{this}}"
  {{/each}}
  {{#each resources}}
    File /a "/oname={{this.[1]}}" "{{no-escape @key}}"
  {{/each}}

  ; Copy external binaries
  {{#each binaries}}
    File /a "/oname={{this}}" "{{no-escape @key}}"
  {{/each}}

  ; Create file associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
       !insertmacro APP_ASSOCIATE "{{ext}}" "{{or association.name ext}}" "{{association-description association.description ext}}" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0" "Open with ${PRODUCTNAME}" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
    {{/each}}
  {{/each}}

  ; Register deep links
  {{#each deep_link_protocols as |protocol| ~}}
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "URL Protocol" ""
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "" "URL:${BUNDLEID} protocol"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  {{/each}}

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Save $INSTDIR in registry for future installations
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR

  !if "${INSTALLMODE}" == "both"
    ; Save install mode to be selected by default for the next installation such as updating
    ; or when uninstalling
    WriteRegStr SHCTX "${UNINSTKEY}" $MultiUser.InstallMode 1
  !endif

  ; Remove old main binary if it doesn't match new main binary name
  ReadRegStr $OldMainBinaryName SHCTX "${UNINSTKEY}" "MainBinaryName"
  ${If} $OldMainBinaryName != ""
  ${AndIf} $OldMainBinaryName != "${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\$OldMainBinaryName"
  ${EndIf}

  ; Save current MAINBINARYNAME for future updates
  WriteRegStr SHCTX "${UNINSTKEY}" "MainBinaryName" "${MAINBINARYNAME}.exe"

  ; Registry information for add/remove programs
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "${MANUFACTURER}"
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoModify" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoRepair" "1"

  ${GetSize} "$INSTDIR" "/M=uninstall.exe /S=0K /G=0" $0 $1 $2
  IntOp $0 $0 + ${ESTIMATEDSIZE}
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" "$0"

  !if "${HOMEPAGE}" != ""
    WriteRegStr SHCTX "${UNINSTKEY}" "URLInfoAbout" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "URLUpdateInfo" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "HelpLink" "${HOMEPAGE}"
  !endif

  ; Create start menu shortcut
  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    Call CreateOrUpdateStartMenuShortcut
  !insertmacro MUI_STARTMENU_WRITE_END

  ; Create desktop shortcut for silent and passive installers
  ; because finish page will be skipped
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTINSTALL
    !insertmacro NSIS_HOOK_POSTINSTALL
  !endif

  ; Auto close this page for passive mode
  ${If} $PassiveMode = 1
    SetAutoClose true
  ${EndIf}
SectionEnd

Function .onInstSuccess
  ; Check for `/R` flag only in silent and passive installers because
  ; GUI installer has a toggle for the user to (re)start the app
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    ${GetOptions} $CMDLINE "/R" $R0
    ${IfNot} ${Errors}
      ${GetOptions} $CMDLINE "/ARGS" $R0
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" "$R0"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.onInit
  ; O instalador pode chamar o desinstalador durante a reinstalação limpa;
  ; nesse caso o mutex já pertence ao processo pai e não deve bloquear o filho.
  ${GetOptions} $CMDLINE "/FROMSETUP" $LabHubFromSetup
  ${IfNot} ${Errors}
    StrCpy $LabHubFromSetup 1
    Goto un_mutex_done
  ${EndIf}

  System::Call 'kernel32::CreateMutex(i 0, i 0, t "LabHubTVSetupMutex") i .r0'
  ${If} $0 != 0
    System::Call 'kernel32::GetLastError() i .r0'
    ${If} $0 == 183
      MessageBox MB_ICONSTOP "Outro instalador ou desinstalador do LabHub TV já está em execução."
      Quit
    ${EndIf}
  ${EndIf}

  un_mutex_done:
  !insertmacro SetContext

  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_UNINIT
  !endif

  !insertmacro MUI_UNGETLANGUAGE

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}

  ; Desinstalação silenciosa nunca apaga dados sem confirmação explícita.
  ${If} ${Silent}
    StrCpy $DeleteAppDataCheckboxState 0
  ${EndIf}
FunctionEnd

Function un.LabHubDeleteIfExists
  Pop $R0
  ${If} ${FileExists} "$R0"
    ClearErrors
    Delete "$R0"
    ${If} ${Errors}
    ${OrIf} ${FileExists} "$R0"
      DetailPrint "LabHub TV: não foi possível remover $R0 (arquivo em uso ou sem permissão)."
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.LabHubRemoveDirIfExists
  Pop $R0
  ${If} ${FileExists} "$R0"
    ClearErrors
    RMDir "$R0"
    ${If} ${Errors}
    ${OrIf} ${FileExists} "$R0"
      DetailPrint "LabHub TV: a pasta $R0 contém arquivos não reconhecidos ou está em uso; limpeza interrompida."
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.LabHubClearAppData
  DetailPrint "LabHub TV: removendo dados locais deste dispositivo."

  Push "$APPDATA\LabHub TV\device-config.json"
  Call un.LabHubDeleteIfExists
  Push "$APPDATA\LabHub TV\auth.encrypted"
  Call un.LabHubDeleteIfExists
  Push "$APPDATA\LabHub TV\drive-sync.json"
  Call un.LabHubDeleteIfExists
  Push "$APPDATA\LabHub TV\programming-state.json"
  Call un.LabHubDeleteIfExists

  Delete "$APPDATA\LabHub TV\*.bak"
  Delete "$APPDATA\LabHub TV\*.tmp"
  Delete "$APPDATA\LabHub TV\*.corrupt-*"

  Push "$APPDATA\${BUNDLEID}\device-config.json"
  Call un.LabHubDeleteIfExists
  Push "$APPDATA\${BUNDLEID}\auth.encrypted"
  Call un.LabHubDeleteIfExists
  Push "$APPDATA\${BUNDLEID}\drive-sync.json"
  Call un.LabHubDeleteIfExists
  Push "$APPDATA\${BUNDLEID}\programming-state.json"
  Call un.LabHubDeleteIfExists
  Push "$LOCALAPPDATA\${BUNDLEID}\device-config.json"
  Call un.LabHubDeleteIfExists
  Push "$LOCALAPPDATA\${BUNDLEID}\auth.encrypted"
  Call un.LabHubDeleteIfExists
  Push "$LOCALAPPDATA\${BUNDLEID}\drive-sync.json"
  Call un.LabHubDeleteIfExists
  Push "$LOCALAPPDATA\${BUNDLEID}\programming-state.json"
  Call un.LabHubDeleteIfExists

  ${If} ${FileExists} "$APPDATA\LabHub TV\EBWebView"
    ClearErrors
    RmDir /r "$APPDATA\LabHub TV\EBWebView"
    ${If} ${Errors}
    ${OrIf} ${FileExists} "$APPDATA\LabHub TV\EBWebView"
      DetailPrint "LabHub TV: não foi possível remover o perfil WebView2 local (em uso ou sem permissão)."
      Abort
    ${EndIf}
  ${EndIf}

  Push "$APPDATA\LabHub TV"
  Call un.LabHubRemoveDirIfExists
  Push "$APPDATA\${BUNDLEID}"
  Call un.LabHubRemoveDirIfExists
  Push "$LOCALAPPDATA\${BUNDLEID}"
  Call un.LabHubRemoveDirIfExists

  DeleteRegKey HKCU "Software\LabHub TV"
FunctionEnd

Section Uninstall

  !ifmacrodef NSIS_HOOK_PREUNINSTALL
    !insertmacro NSIS_HOOK_PREUNINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Delete the app directory and its content from disk
  ; Copy main executable
  Delete "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Delete resources
  {{#each resources}}
    Delete "$INSTDIR\\{{this.[1]}}"
  {{/each}}

  ; Delete external binaries
  {{#each binaries}}
    Delete "$INSTDIR\\{{this}}"
  {{/each}}

  ; Delete app associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
      !insertmacro APP_UNASSOCIATE "{{ext}}" "{{or association.name ext}}"
    {{/each}}
  {{/each}}

  ; Delete deep links
  {{#each deep_link_protocols as |protocol| ~}}
    ReadRegStr $R7 SHCTX "Software\Classes\\{{protocol}}\shell\open\command" ""
    ${If} $R7 == "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
      DeleteRegKey SHCTX "Software\Classes\\{{protocol}}"
    ${EndIf}
  {{/each}}


  ; Delete uninstaller
  Delete "$INSTDIR\uninstall.exe"

  {{#each resources_ancestors}}
  RMDir /REBOOTOK "$INSTDIR\\{{this}}"
  {{/each}}
  RMDir "$INSTDIR"

  ; Remove shortcuts if not updating
  ${If} $UpdateMode <> 1
    !insertmacro DeleteAppUserModelId

    ; Remove start menu shortcut
    !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
    !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      RMDir "$SMPROGRAMS\$AppStartMenuFolder"
    ${EndIf}
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}

    ; Remove desktop shortcuts
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$DESKTOP\${PRODUCTNAME}.lnk"
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}

  ; Remove registry information for add/remove programs
  !if "${INSTALLMODE}" == "both"
    DeleteRegKey SHCTX "${UNINSTKEY}"
  !else if "${INSTALLMODE}" == "perMachine"
    DeleteRegKey HKLM "${UNINSTKEY}"
  !else
    DeleteRegKey HKCU "${UNINSTKEY}"
  !endif

  ; Removes the Autostart entry for ${PRODUCTNAME} from the HKCU Run key if it exists.
  ; This ensures the program does not launch automatically after uninstallation if it exists.
  ; If it doesn't exist, it does nothing.
  ; We do this when not updating (to preserve the registry value on updates)
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
  ${EndIf}

  ; Delete app data if the checkbox is selected
  ; and if not updating
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    ; Clear the install location $INSTDIR from registry
    DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty SHCTX "${MANUKEY}"

    ; Clear the install language from registry
    DeleteRegValue HKCU "${MANUPRODUCTKEY}" "Installer Language"
    DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUKEY}"

    SetShellVarContext current
    Call un.LabHubClearAppData
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTUNINSTALL
    !insertmacro NSIS_HOOK_POSTUNINSTALL
  !endif

  ; Auto close if passive mode or updating
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    SetAutoClose true
  ${EndIf}
SectionEnd

Function RestorePreviousInstallLocation
  ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
  StrCmp $4 "" +2 0
    StrCpy $INSTDIR $4
FunctionEnd

Function Skip
  Abort
FunctionEnd

Function SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd
Function un.SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd

Function CreateOrUpdateStartMenuShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  StrCpy $R0 0

  !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  ${If} $R0 = 1
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ; but always create if migrating from wix
  ${If} $WixMode = 0
    ${If} $UpdateMode = 1
    ${OrIf} $NoShortcutMode = 1
      Return
    ${EndIf}
  ${EndIf}

  !if "${STARTMENUFOLDER}" != ""
    CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
    CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !else
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !endif
FunctionEnd

Function CreateOrUpdateDesktopShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ; but always create if migrating from wix
  ${If} $WixMode = 0
    ${If} $UpdateMode = 1
    ${OrIf} $NoShortcutMode = 1
      Return
    ${EndIf}
  ${EndIf}

  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
FunctionEnd
