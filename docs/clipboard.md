# multiOS Clipboard Synchronization Architecture

Architecture of the bi-directional clipboard synchronization pipeline between Windows Win32 API and iOS Safari.

## Architecture Pipeline

```
+------------------+         PostMessage (WM_CLIPBOARDUPDATE)        +-------------------+
|  Win32 Clipboard | ----------------------------------------------> |  Native Helper    |
+------------------+                                                 +-------------------+
                                                                               |
                                                                               | IPC Stream (stdout)
                                                                               v
+------------------+                    WebSocket Broadcast          +-------------------+
|   Mobile Safari  | <============================================== |  multiOS Server   |
+------------------+                                                 +-------------------+
```

## Supported Formats

- **Plain Text (`CF_UNICODETEXT`):** Full UTF-16 decoding on Windows; served as UTF-8 JSON payload to mobile.
- **Image Formats (`CF_DIBV5` / PNG):** Converted to standard PNG buffer before transmission to mobile preview.
- **Size Guards:** Payloads exceeding 5 MB text or 20 MB image are truncated with a notification to avoid memory exhaustion.
