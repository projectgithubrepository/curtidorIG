Unicode true
!include "MUI2.nsh"

!ifndef OUTPUT_DIR
  !define OUTPUT_DIR "..\release"
!endif

Name "Atualização do curtidorIG"
OutFile "${OUTPUT_DIR}\curtidorIG-Atualizacao-Windows.exe"
InstallDir "$LOCALAPPDATA/Programs/curtidorIG"
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

  IfFileExists "$INSTDIR/resources/app.asar" 0 not_installed

  IfFileExists "$%GITHUB_WORKSPACE%\release\win-unpacked\resources\app.asar" 0 build_missing
  DetailPrint "Atualizando os arquivos do aplicativo..."

  SetOutPath "$INSTDIR/resources"
  File /oname=app.asar "$%GITHUB_WORKSPACE%\release\win-unpacked\resources\app.asar"

  RMDir /r "$INSTDIR/resources/app.asar.unpacked"
  SetOutPath "$INSTDIR/resources/app.asar.unpacked"
  File /r "$%GITHUB_WORKSPACE%\release\win-unpacked\resources\app.asar.unpacked\*"

  DetailPrint "Atualização concluída. Os dados do usuário e o Chromium foram preservados."
  MessageBox MB_ICONINFORMATION|MB_OK "curtidorIG atualizado com sucesso!$\r$\n$\r$\nSeu login do Instagram, histórico e Chromium foram preservados."
  Goto done

not_installed:
  MessageBox MB_ICONSTOP|MB_OK "Não encontrei uma instalação do curtidorIG nesta pasta. Se você escolheu outro local ao instalar, selecione a pasta correta."
  Abort

build_missing:
  MessageBox MB_ICONSTOP|MB_OK "Os arquivos da nova versão não foram encontrados durante a geração do atualizador."
  Abort

done:
SectionEnd
