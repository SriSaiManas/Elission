# ELISSION 2.0 preview

## Installation and summoning

On Windows 11 x64, exit an older ELISSION from the notification area before running setup. Setup checks for .NET Framework 4.8, stages the new application before replacing the installation, and can restore the previous directory if publishing the staged directory fails. It installs for the current user and keeps application data in the user's Electron data directory. The installer is unsigned. The final installer page offers to start ELISSION in the notification area. A desktop shortcut is optional. Windows sign-in startup is configurable in Settings.

Use **Ctrl + Alt + Space** to show or hide the overlay. This shortcut works independently of the microphone. The tray menu opens ELISSION or Settings, pauses or resumes background work, or exits. The microphone button remains available. Enable hold-to-wake in Settings if you want the optional hold-and-say gesture. Spoken follow-up listening defaults to off for fresh settings and migration from earlier settings.

To map an ASUS ROG M5 key on a supported model:

1. Open **Armoury Crate → Device → your laptop → Customizable Hotkey**.
2. Select **M5** and choose **Key Combination**.
3. Record **Ctrl + Alt + Space** as one chord, apply the setting, and test it from another application.
4. If the section or M5 assignment is absent, use the keyboard chord directly. ASUS documents that availability and key layout depend on the laptop.

[ASUS Armoury Crate documentation](https://www.asus.com/support/faq/1050463/)

## Ollama

Install and start [Ollama for Windows](https://ollama.com/download/windows). In PowerShell, run `ollama pull qwen3.5:4b`, then `ollama list` to confirm it is installed. ELISSION can discover the model on startup while the provider is off. It verifies the local model list and sends a short streaming test message before enabling it. For manual configuration choose **Local**, use `http://localhost:11434/v1/chat/completions`, and set the model ID to `qwen3.5:4b`. No paid key is needed for a standard local server. The alternative cloud option still accepts only OpenAI-compatible endpoints.

For a laptop with 6 GB VRAM, leave context and placement under Ollama's control to start. Observe CPU/GPU allocation with `ollama ps`. Large context windows and GPU workloads can require CPU/RAM offload. No model is bundled. The 4B model itself has no Windows or GPU performance result in this preview. [Ollama model listing](https://ollama.com/library/qwen3.5%3A4b)

## Use the current Chrome or Edge session

1. Open `chrome://extensions` or `edge://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked** and select `%LOCALAPPDATA%\Programs\ELISSION\BrowserExtension`. If the unpacked install path changes, reload the extension.
3. In ELISSION Settings, choose **Generate pairing code**. Paste the code into the extension toolbar popup and connect. Use the code within two minutes. Pair again after restarting ELISSION or disconnecting.
4. To grant access to one page, open that page and choose **Allow this tab** in the popup. Permission is tied to the current active document and is revoked on navigation, close, or disconnect.
5. For navigation verification, also choose **Allow verified Google search** and accept the Google host permission. ELISSION opens the query in that browser and checks the loaded URL and exact query. Without the bridge it can dispatch the search to the default browser and reports that verification is unavailable.

Supported commands include:

- `Search Google for LELOUCH Vi Britannia`
- `Inspect the active browser tab` or `Summarize the active browser tab`
- `Read tables from the active browser tab`
- `Draft in textarea Comments: A draft to review.`
- `Inspect window Notepad` for visible Windows accessibility control names
- `Inspect a project` for a bounded, user-selected directory listing
- `Generate Java class Example: Create a class with a hello method` for a reviewed new file
- `Plan and run these actions: calculate 7 * 6 and inspect the active browser tab`

A draft requires confirmation and an empty textarea with a unique accessible label. The site can react to ordinary input events. The extension verifies the value and has no submission action. ELISSION asks before sending an approved page to a cloud model. Page content and generated source are not stored in conversation history by these actions.

## Architecture and scope

Electron retains the main/renderer separation, SQLite preferences, Windows DPAPI storage, hologram, and voice flow. The renderer sees a narrow preload API. The .NET Framework helper provides the existing keyboard and audio backend plus scoped UI Automation control-name inspection. The primary summon hotkey uses Electron's global shortcut system. No model drives desktop input by arbitrary coordinates.

The Chromium Manifest V3 extension uses per-document activeTab grants and a loopback WebSocket protected by a short-lived application session code. The desktop only accepts extension-origin upgrades and requires pairing before it sends requests. The extension rechecks the selected tab, URL, and document ID before executing a page operation. No cookie, browser-password, credential-field or session-token API is used. Disconnecting closes the bridge without closing user tabs.

The planner receives only the user instruction and a bounded action schema. It proposes up to five steps, validates them against a fixed registry, and waits for approval. Steps record status, time out where their underlying operation is abortable, and stop at a blocker. Plans are never automatically resumed after a crash. Browser observations are treated as data and do not feed back into planner instructions. Browser and project actions have limited scope in this preview. There is no general-purpose mouse automation, active-window OCR, browsing across arbitrary links and tabs, sensitive submission or purchasing workflow, existing-file patching, Git/IDE automation, or project test/build runner.

See [the test report](TESTING.md) for what is verified and what still needs Windows hardware.

## Voice and research in Alpha 2

Open the overlay and click the microphone button once. Wait for **Microphone active**, then speak a short command. The installer bundles a small Vosk English model and runs dictation locally on the Windows default input device. The overlay shows recognized words as they arrive. If no signal is detected, check **Windows Settings → System → Sound → Input**, then enable **Microphone access** and **Let desktop apps access your microphone** under **Privacy & security → Microphone**. Optional wake and spoken cancellation still use Windows desktop speech components.

Say or type **Look up Lelouch vi Britannia** to fetch titles, snippets, and clickable source links from DuckDuckGo inside ELISSION. A verified local model can summarize those snippets. If you specifically ask to search Google, ELISSION also requests Google in your browser and identifies DuckDuckGo as the source of the displayed results. DuckDuckGo may occasionally block the HTML results endpoint or return a browser challenge. Subsequent questions can use up to five recent turns while ELISSION is open. Saving conversation history is still optional.

## Alpha 3 speed and workflows

At the standard local Ollama address, ELISSION uses Ollama's native stream with thinking disabled, a 4K context, and a bounded response length. It keeps the model loaded for 15 minutes after use and requests a background warm-up on startup when model auto-connect is enabled. Other OpenAI-compatible endpoints keep their existing transport. ELISSION uses a smaller recent history window and can handle common actions and supported sequences without a planning model call.

For a lightweight model, run `ollama pull qwen3.5:2b` and select `qwen3.5:2b` under the local provider if conversation speed matters most. Keep `qwen3.5:4b` for more demanding coding. First-response time depends on warm-up, GPU offload and model size. Check `ollama ps` to see how much of the selected model is on the GPU.

To use the LeetCode workflow, reload the unpacked BrowserExtension after upgrading, pair it with ELISSION in your signed-in Chrome profile, and choose **Allow LeetCode workflows** from the extension popup. Select **Python3** in LeetCode and confirm ELISSION's editor-replacement and submission prompts separately. Use ordinary language such as “Open Chrome, go to LeetCode and solve problem 1124, submit it.” The workflow uses the numbered public problem catalog, the visible description and the selected model. Generated code may fail judging. If ELISSION cannot safely set the editor, it returns the draft for manual paste.

“Submit the current LeetCode solution twice” requests two separate approvals for the current editor. A repeated submission requires the original tab and a fresh receipt from the previous attempt. A receipt confirms the site recorded a submission. A judging status is reported only if the result view identifies that same submission. If ELISSION cannot confirm a receipt, verify your submissions in LeetCode before retrying.

Dictation accepts common spoken number forms such as “eleven twenty-four” and “one one two four,” plus a short list of LeetCode speech variants. Recognition still depends on audio quality and the bundled English speech model.
