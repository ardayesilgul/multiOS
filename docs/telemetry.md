# multiOS Diagnostic Telemetry & Log Format Specifications

Specification of structured diagnostics produced by multiOS for connection verification, pairing diagnostics, and transfer progress monitoring.

## Log Event Categories

1. **`NET_DISCOVERY`**: Broadcast interfaces, IP assignment, and socket binding events.
2. **`AUTH_PAIRING`**: QR generation, token validation, and session revocation.
3. **`TRANSFER_STREAM`**: File metadata header parsing, chunk sequence tracking, and hash verification.
4. **`CLIPBOARD_IPC`**: Native helper heartbeat, clipboard format detection, and synchronization events.

## Diagnostic Fields

```json
{
  "timestamp": "2026-10-31T12:00:00.000Z",
  "category": "AUTH_PAIRING",
  "level": "INFO",
  "event": "PAIRING_ESTABLISHED",
  "sessionId": "a91f3b...",
  "peer": {
    "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 ...)",
    "localIp": "192.168.1.105"
  }
}
```
