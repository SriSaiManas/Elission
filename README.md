# ELISSION

A Windows x64 desktop assistant with an interactive crimson particle core, local Windows speech, allowlisted system commands, and optional streaming AI conversation.

## Run the portable build

1. On Windows 11 x64, extract the entire archive to a local folder. The app requires .NET Framework 4.8 or newer, which is included with current Windows 11 installations. Windows 10 compatibility is unverified.
2. Open the extracted **ELISSION** folder and launch **ELISSION.exe** there. Keep the sibling runtime files and `resources` directory alongside it. The executable is unsigned.
3. ELISSION starts in the Windows notification area. Choose **Open ELISSION** from its tray menu to type a command or **Settings** to configure it. Try `calculate (12 + 4) * 3` in the prompt. This works without an AI provider.
4. To use voice, enable Windows microphone access for desktop apps and install a desktop/SAPI recognition language pack with dictation support. Check **Settings → Voice** for available desktop voices. Some modern Windows narrator voices are unavailable to desktop SAPI.
5. Hold **I** and say **“Eli”**. Give the recognizer a moment to open the microphone before speaking. After the core activates, speak the request. Release **I** once the gesture completes. **Ctrl + Alt + Space** toggles the overlay without starting the microphone. The microphone button starts dictation when the overlay is open. Both global activation methods can be changed or disabled in Settings. The hold key continues to reach the focused application.
6. Stop with **Esc**, **Stop**, or the fallback activation shortcut. For spoken interruption, enable **“Eli, stop” during playback** in Settings. The audio device remains open while this option actively listens. Headphones reduce speaker feedback.

Use the title bar to drag the window, drag an edge to resize, or use the compact and fullscreen controls. Escape or the window’s X hides the overlay. Select **Exit** from the tray to shut down ELISSION.

## AI setup

**Settings → Conversation provider** accepts OpenAI-compatible **Chat Completions** URLs. ELISSION starts in **Local commands only** mode.

- **Cloud** uses an HTTPS endpoint, a model ID, and an API key for that endpoint. The default URL is `https://api.openai.com/v1/chat/completions`.
- **Local** requires a separately installed and running OpenAI-compatible loopback server. Run `ollama list` for the exact model ID. Set the full URL, for example `http://127.0.0.1:11434/v1/chat/completions` for a compatible Ollama setup, and a model already installed there.
- Saving a new configuration verifies the selected model with a short chat request. Local endpoints must also expose an OpenAI-compatible model list. Existing settings from earlier versions require one verification on save.
- Model text is streamed into the conversation panel. A local SAPI voice synthesizes the completed response. Pitch and expressiveness support depend on the installed voice.
- The provider receives prompts entered for AI conversation and any enabled conversation context. Saved preferences are shared only when enabled. File contents require a separate confirmation naming the destination. ELISSION can summarize UTF-8 TXT, MD, CSV, LOG, or JSON files up to 48 KB.

## Commands

| Request | Operation |
| --- | --- |
| `open Chrome` / `search installed apps for chrome` | Launch or find a matching Start menu shortcut |
| `close Notepad` / `switch to Notepad` | Find one matching desktop window and request close or restore/focus |
| `open a file` / `open a folder` | Use the Windows file/folder picker and open the selection |
| `volume 35` / `mute` / `unmute` | Change the Windows multimedia endpoint |
| `play` / `pause` / `next track` / `previous track` | Send Windows media keys. Play and pause share the OS toggle key |
| `brightness 60` | Adjust displays that expose WMI brightness controls |
| `screenshot` | Save the primary display as PNG after approval |
| `what's my CPU usage?` / `check battery` / `memory usage` / `time` | Read Windows or local system information |
| `search the web for lunar eclipses` / `open https://example.com` | Launch the default browser after approval |
| `summarize this document` | Select and approve a text file for summarization |
| `note buy a USB cable` / `remember I prefer metric units` | Store personal notes or preferences locally |
| `remind me in 5 minutes to check the oven` | Schedule a persisted desktop notification. ELISSION must be running to deliver it on time |
| `calculate (12 + 4) * 3` | Evaluate arithmetic |
| `move this file` | Select a source and destination, then approve a move. Existing destination files are protected |

**Activity** contains recent conversation turns, saved memory, operation status, and pending reminders. To create an alias, choose the **command** memory type and enter, for example, `launch my browser => open Chrome`. Commands use a fixed parser and implementation. Generated AI text has no access to the execution path.

On Windows, provider credentials and the contents of saved conversations, memories, and reminders are protected with Electron's Windows DPAPI-backed storage. SQLite lives in ELISSION's Electron user data directory under your Windows account. The database retains settings and operation metadata such as action names, timestamps, and outcomes. Microphone recognition and voice synthesis are handled by local Windows speech services. Synthesis uses a temporary WAV and deletes it after playback or cancellation. A process crash can leave a temporary file. Operations already dispatched to Windows can take effect after cancellation.

## Build from source

Requirements include Node.js 22.12 or later, npm, the .NET 8 SDK, and access to npm, NuGet, and the pinned Electron release.

```sh
npm ci
npm test
npm run pack:win
```

The output is `release/ELISSION-Windows-x64.zip`. A Linux or Windows machine can cross-package it. To use a predownloaded runtime, set `ELISSION_ELECTRON_ZIP` to the verified Electron 45.5.0 Windows x64 archive. `ELISSION_RELEASE_DIR` can override the destination. For Windows development, run `npm run build:win-helper` before `npm start`.

- `src/main.cjs` owns session lifecycle, Windows commands, and permission prompts.
- `src/core.cjs` owns command parsing, arithmetic, and streaming AI transport.
- `src/storage.cjs` owns persistence and Windows data protection.
- `src/hologram.js` renders the WebGL particle layers, orbits, and audio visualization.
- `windows/` contains the compiled x64 helper's source for Win32, SAPI, WMI, and Core Audio.

For the separate Linux Electron smoke test, run `npm run test:desktop` with an X11 display or Xvfb available. Set `ELISSION_ELECTRON` to use an independently downloaded Electron 45.5.0 Linux executable.

For ELISSION 2.0 setup, browser pairing, ASUS M5 mapping and architecture, see [the preview guide](docs/ELISSION-2.md). See [the test report](docs/TESTING.md) for hardware-specific checks.
