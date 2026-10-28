# multiOS Windows Shell & System Tray Integration

Details on the native tray menu lifecycle, icon state indicators, and notification hooks.

## Notification Toast Dispatch

- Emits native Windows Action Center notifications via PowerShell WinRT bridge.
- Provides one-click action to reveal the received file in Windows Explorer (`explorer.exe /select,"<PATH>"`).
