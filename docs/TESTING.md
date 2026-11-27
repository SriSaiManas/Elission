# ELISSION 2.0 preview test report

## Checks on the development environment

- Twelve Node regression tests cover search intent, query encoding and exact verification, plan validation and checkpoints, cancellation of paired bridge requests, consent origin, preserved Java files, arithmetic, command parsing, and model stream transport.
- Linux Electron smoke tests cover the overlay, hidden startup, settings validation, reminders, dismissal and persistence. A real SmolLM2 model via llama.cpp produced a response in the application.
- Chromium for Testing exercises the real extension worker with a local fixture, including pairing, a document read, HTML tables, a verified textarea draft, and revocation on navigation. The harness uses temporary host permissions for the fixtures because it cannot emulate the user's toolbar grant. This is not a live Google or Edge test.
- The Windows native helper cross-compiles in this environment. The NSIS script compiles with warnings treated as errors. Installer extraction can be audited without launching Windows.

## Windows acceptance matrix

No Windows machine or ASUS ROG hardware was available. Tests below remain pending on actual hardware unless the feature is listed as incomplete.

| # | Check | Status |
|---|---|---|
| 1 | Startup hidden | Linux smoke passes. Windows pending |
| 2–3 | M5 summon and dismiss | Pending ASUS Armoury Crate and Windows confirmation |
| 4 | Chrome Google search | Chromium fixture proves query placement and navigation witness. Live Google pending |
| 5–6 | Approved tab summary and table | Chromium fixture verifies content and table read. Linux model test verifies actual chat response independently |
| 7 | Draft into a harmless form | Chromium textarea fixture passes with no submission |
| 8 | Generate Java in a selected file | New-file write and overwrite protection pass unit tests. Full Windows model-to-save flow pending |
| 9 | Run project tests | Incomplete |
| 10 | Multi-step browser navigation and extraction | Registry and checkpoints tested. General navigation incomplete. Explicit tab grants are required when documents change |
| 11 | Sensitive form submission | Submission is outside this preview. Existing supported sensitive actions require confirmation |
| 12 | Task cancellation | Node bridge cancellation and Linux chat cancellation pass. Voice cancellation and Windows pending |
| 13–14 | Hide leaves app running and Exit shuts down | Linux dismissal and shutdown tested. Windows tray and helper lifecycle pending |
| 15 | Upgrade preserves data | Installer staging and rollback paths compiled. Windows upgrade and uninstall pending |

Before a stable release, also test elevated or exclusive full-screen apps, microphone and accessibility permissions, Ollama qwen3.5:4b performance on the RTX 4050, real Chrome and Edge toolbar grants, and installation over the previous version while it is closed.

## Alpha 2 voice and research

- The Windows voice helper cross-compiles with the offline Vosk recognizer and NAudio microphone capture. On Linux the same Vosk version and English model transcribed the upstream sample audio. Live Windows microphone access, device selection, and endpointing still require hardware validation.
- The DuckDuckGo parser returned live titles, snippets, and links for the reported Lelouch query. Automated fixtures check routing, unsafe-link exclusion, deduplication, and the no-results error. The preview does not attempt to bypass search-provider challenges.
