# multiOS Windows Shell & System Tray Integration

Details on the native tray menu lifecycle, icon state indicators, and notification hooks.

## Notification Toast Dispatch

- Emits native Windows Action Center notifications via PowerShell WinRT bridge.
- Provides one-click action to reveal the received file in Windows Explorer (`explorer.exe /select,"<PATH>"`).


## Shell Balloon Fallback (Windows 10 & 11)

- Legacy Windows 10 builds without WinRT notification registration fall back to `NIM_MODIFY` tray balloon popups.
- Balloon notifications automatically self-dismiss after 4 seconds without blocking thread execution.
