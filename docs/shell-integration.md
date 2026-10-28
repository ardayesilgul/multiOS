# multiOS Windows Shell & System Tray Integration

Details on the native tray menu lifecycle, icon state indicators, and notification hooks.

## Notification Toast Dispatch

- Emits native Windows Action Center notifications via PowerShell WinRT bridge.
- Provides one-click action to reveal the received file in Windows Explorer (`explorer.exe /select,"<PATH>"`).


## Shell Balloon Fallback (Windows 10 & 11)

- Legacy Windows 10 builds without WinRT notification registration fall back to `NIM_MODIFY` tray balloon popups.
- Balloon notifications automatically self-dismiss after 4 seconds without blocking thread execution.


## Dark Mode Theme Sync & Mica Material

- Listens for `WM_SETTINGCHANGE` / `ImmersiveColorSet` notifications to mirror Windows system light/dark theme switches instantly.
- Context menus utilize acrylic blur effects matching native Windows 11 shell styling guidelines.


## High-DPI Display Scaling & Per-Monitor V2

- Explicit `SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)` call on runtime startup.
- Dynamically recalculates tray hit-test bounding rectangles upon `WM_DPICHANGED` messages when moving across multiple mixed-DPI displays.
