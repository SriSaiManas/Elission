Unicode True
Name "ELISSION"
OutFile "${SETUP_OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\ELISSION"
RequestExecutionLevel user
SetCompressor zlib
VIProductVersion "1.0.0.2"
VIAddVersionKey "ProductName" "ELISSION"
VIAddVersionKey "ProductVersion" "1.0.0-alpha.2"
VIAddVersionKey "FileVersion" "1.0.0-alpha.2"
VIAddVersionKey "FileDescription" "ELISSION Windows x64 Setup"
VIAddVersionKey "LegalCopyright" "ELISSION"
!include "MUI2.nsh"
!include "x64.nsh"
!define MUI_ICON "${APP_ICON}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\ELISSION.exe"
!define MUI_FINISHPAGE_RUN_NOTCHECKED
!insertmacro MUI_PAGE_WELCOME
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
FunctionEnd

Section "ELISSION"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD_DIR}/*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\ELISSION.lnk" "$INSTDIR\ELISSION.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "DisplayName" "ELISSION"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "DisplayVersion" "1.0.0-alpha.2"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "DisplayIcon" "$INSTDIR\ELISSION.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$SMPROGRAMS\ELISSION.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ELISSION"
  RMDir /r "$LOCALAPPDATA\Programs\ELISSION"
SectionEnd
