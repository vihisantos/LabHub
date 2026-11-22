!macro NSIS_HOOK_POSTINSTALL
  ; A preferência "iniciar ao entrar no Windows" é normalizada na tela de conclusão,
  ; que valida a tarefa/interativa antes de registrar o mecanismo ativo.
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Remove somente as entradas pertencentes ao LabHub TV.
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV\LabHub TV.lnk"
  RMDir "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV"

  ; Remove a tarefa agendada exata, sem elevação, senha ou afetação de outras tarefas.
  nsExec::ExecToStack "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command $\"$$q=Get-ScheduledTask -TaskName 'LabHub TV' -ErrorAction SilentlyContinue;if($$q){Unregister-ScheduledTask -TaskName 'LabHub TV' -Confirm:$$false};if(Get-ScheduledTask -TaskName 'LabHub TV' -ErrorAction SilentlyContinue){exit 2};exit 0$\""
  Pop $0
  Pop $1
  ${If} $0 != 0
    DetailPrint "LabHub TV: não foi possível remover a tarefa de inicialização (código $0)."
  ${EndIf}
!macroend
