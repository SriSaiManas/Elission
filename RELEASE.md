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

## Windows acceptance checks before packaging

Install Node.js and the .NET SDK. Run `npm ci`, `npm test`, and `npm run build:win-helper` from the source root, then use `npm start` on Windows x64 for the runtime check.

- Confirm that startup creates a notification-area icon with the overlay hidden. Repeat launch and confirm that there is still one Electron main process.
- From the tray open Settings. With a working local endpoint or cloud account, save an invalid configuration and verify that it is rejected. Save a valid one, submit a message, and confirm the model’s actual response. Local servers should list the selected ID from their OpenAI-compatible models endpoint.
- Focus Notepad. Hold I, say “Eli”, and release. Repeat with the assistant hidden again, including a quick release immediately after speaking. Confirm the foreground app receives the I key and that a hold with no speech does not open the overlay. Change and disable the shortcut in Settings. Confirm that missing microphone access produces a useful error.
- Toggle the overlay with Ctrl+Space, hide it with Escape and X, and reopen it from the tray. Choose Exit and confirm in Task Manager that the Electron app and its `Elission.Windows.exe` helpers have terminated. Repeat startup and shutdown.
- After those checks pass, run the packaging commands above.
