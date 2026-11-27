# ELISSION 1.0.0 for Windows x64

Run ELISSION-Setup-x64.exe on Windows, then launch ELISSION from the Start menu. The installer is unsigned and installs for the current user. See ELISSION-README.md for setup and ELISSION-Test-Report.md for verification status. Verify the installer against SHA256SUMS.txt.

## Reproduce on Windows with the ELISSION source

Use Node.js 22.12 or later, npm, .NET 8 SDK, and NSIS 3.11. Extract the ELISSION source archive and run the following from the source root in PowerShell. The build uses npm, NuGet, and the pinned Electron download.

```powershell
npm ci
npm run pack:win
Expand-Archive .\release\ELISSION-Windows-x64.zip .\release\payload -Force
```

The portable app is at `release\payload\ELISSION\ELISSION.exe`. Keep the other files in that folder alongside it. To recreate the setup executable, run the following from the source root with makensis.exe on PATH.

```powershell
makensis /WX "/DPAYLOAD_DIR=$PWD\release\payload\ELISSION" "/DSETUP_OUTPUT=$PWD\release\ELISSION-Setup-x64.exe" "/DAPP_ICON=$PWD\assets\elission.ico" .\scripts\installer.nsi
```

The result installs the same application. The installer binary can differ due to build timestamps, tool versions, or the build environment.
