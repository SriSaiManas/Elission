Unicode True
Name "ELISSION"
OutFile "${SETUP_OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\ELISSION"
RequestExecutionLevel user
SetCompressor zlib
VIProductVersion "2.0.0.2"
VIAddVersionKey "ProductName" "ELISSION"
VIAddVersionKey "ProductVersion" "2.0.0-alpha.2"
VIAddVersionKey "FileVersion" "2.0.0-alpha.2"
VIAddVersionKey "FileDescription" "ELISSION Windows x64 Setup"
VIAddVersionKey "LegalCopyright" "ELISSION"
!include "MUI2.nsh"
!include "x64.nsh"
!define MUI_ICON "${APP_ICON}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\ELISSION.exe"
!include "LogicLib.nsh"
!include "StrFunc.nsh"
${StrStr}
!define MUI_FINISHPAGE_RUN_TEXT "Start ELISSION in the notification area"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${IsNativeAMD64}
    MessageBox MB_ICONSTOP "This build requires Windows x64."
    Abort
  ${EndIf}
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" "Release"
  ${If} $0 < 528040
    MessageBox MB_ICONSTOP "Install .NET Framework 4.8 or later, then run setup again."
    Abort
  ${EndIf}
FunctionEnd

Section "ELISSION (required)"
  SetShellVarContext current
  SectionIn RO
  IfFileExists "$INSTDIR\ELISSION.exe" 0 readyToStage
  nsExec::ExecToStack '"$SYSDIR\tasklist.exe" /FI "IMAGENAME eq ELISSION.exe" /NH'
  Pop $0
  Pop $1
  ${StrStr} $2 $1 "ELISSION.exe"
  ${If} $0 != "0"
  ${OrIf} $2 != ""
    MessageBox MB_ICONSTOP "Exit ELISSION from the notification area before running setup. Setup could not confirm that all ELISSION processes are closed."
    Abort
  ${EndIf}
readyToStage:
  IfFileExists "$INSTDIR.new\." recoveryRequired
  IfFileExists "$INSTDIR.previous\." recoveryRequired
  DetailPrint "Staging application files before changing the installed copy."
  ClearErrors
  SetOutPath "$INSTDIR.new"
  File /r "${PAYLOAD_DIR}/*"
  IfErrors copyFailed
  WriteUninstaller "$INSTDIR.new\Uninstall.exe"
  IfErrors copyFailed
  SetOutPath "$LOCALAPPDATA\Programs"
  IfFileExists "$INSTDIR\." 0 publish
  ClearErrors
  Rename "$INSTDIR" "$INSTDIR.previous"
  IfErrors copyFailed
publish:
  ClearErrors
  Rename "$INSTDIR.new" "$INSTDIR"
  IfErrors swapFailed
  RMDir /r "$INSTDIR.previous"
  SetOutPath "$INSTDIR"
  CreateShortcut "$SMPROGRAMS\ELISSION.lnk" "$INSTDIR\ELISSION.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "DisplayName" "ELISSION"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "DisplayVersion" "2.0.0-alpha.2"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "DisplayIcon" "$INSTDIR\ELISSION.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "NoRepair" 1
  Goto installDone

swapFailed:
  IfFileExists "$INSTDIR.previous\." 0 copyFailed
  ClearErrors
  Rename "$INSTDIR.previous" "$INSTDIR"
  IfErrors recoveryRequired
copyFailed:
  SetOutPath "$LOCALAPPDATA\Programs"
  RMDir /r "$INSTDIR.new"
  MessageBox MB_ICONSTOP "ELISSION could not be upgraded. Exit ELISSION from the notification area and retry. Setup did not replace the installed copy."
  Abort

recoveryRequired:
  MessageBox MB_ICONSTOP "Setup detected an unfinished upgrade in $LOCALAPPDATA\Programs. If ELISSION is missing and ELISSION.previous exists, rename ELISSION.previous to ELISSION before retrying."
  Abort

installDone:
SectionEnd

Section /o "Desktop shortcut"
  CreateShortcut "$DESKTOP\ELISSION.lnk" "$INSTDIR\ELISSION.exe"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$SMPROGRAMS\ELISSION.lnk"
  Delete "$DESKTOP\ELISSION.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ELISSION"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION"
  RMDir /r "$LOCALAPPDATA\Programs\ELISSION"
SectionEnd
