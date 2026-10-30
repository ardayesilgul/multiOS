# multiOS Automated Test Matrix & Fixture Overview

Overview of the automated unit, API, and native test suites executed against the Windows multiOS core runtime.

## Test Suites

| Suite | Runner | Scope | Execution |
|---|---|---|---|
| `tests/api.js` | Node.js Test Harness | HTTP endpoints, pairing tokens, file chunk streaming, clipboard isolation | Headless / Fast (<5s) |
| `tests/native.js` | Native Win32 Test | Window messages, tray hit-testing, clipboard helper child IPC | Windowed / OS-level |
| `tests/phone-ui.js` | Playwright (Chromium) | Mobile Safari web interface simulation, touch events, upload progress | Browser emulation |

## Fixture Isolation

- All test instances create randomized ephemeral temporary storage under `%TEMP%/multios-api-*`.
- The native test helper automatically tears down child helper processes and restores the system clipboard state on completion.
