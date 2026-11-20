Unicode true
!include "MUI2.nsh"
Name "Atualização do curtidorIG"
OutFile "release\\curtidorIG-Atualizacao-Windows.exe"
InstallDir "$LOCALAPPDATA\\Programs\\curtidorIG"
RequestExecutionLevel user
ShowInstDetails show
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Section "Atualizar curtidorIG" SEC01
  DetailPrint "Fechando o curtidorIG, se estiver aberto..."
  nsExec::ExecToLog 'taskkill /F /IM curtidorIG.exe'
  Sleep 1200

  IfFileExists "$INSTDIR\\resources\\app.asar" 0 not_installed
  DetailPrint "Atualizando os arquivos do aplicativo..."
  SetOutPath "$INSTDIR\\resources"
  File /oname=app.asar "release\\win-unpacked\\resources\\app.asar"

  RMDir /r "$INSTDIR\\resources\\app.asar.unpacked"
  SetOutPath "$INSTDIR\\resources\\app.asar.unpacked"
  File /r "release\\win-unpacked\\resources\\app.asar.unpacked\\*"

  DetailPrint "Atualização concluída. Seus dados, login e Chromium foram preservados."
  MessageBox MB_ICONINFORMATION|MB_OK "curtidorIG atualizado com sucesso!\\n\\nSeu login do Instagram, histórico e Chromium foram preservados."
  Goto done

not_installed:
  MessageBox MB_ICONSTOP|MB_OK "Não encontrei uma instalação do curtidorIG nesta pasta. Se você escolheu outro local ao instalar, selecione a pasta correta."
  Abort

done:
SectionEnd
