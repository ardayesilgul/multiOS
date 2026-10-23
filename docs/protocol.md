# multiOS Protocol Specification & Wire Formats

This document specifies the binary and JSON message contracts exchanged across WebSocket and HTTP endpoints.

## 1. WebSocket Control Frames

All control frames exchanged over WebSocket are UTF-8 encoded JSON payloads with a top-level `type` discriminator.

### 1.1 Ping / Heartbeat
Sent every 15 seconds by the active mobile peer to keep the TCP socket open and detect connection dropouts early.

```json
{
  "type": "ping",
  "timestamp": 1729674000000
}
```

Desktop response:
```json
{
  "type": "pong",
  "timestamp": 1729674000010
}
```

### 1.2 Clipboard Sync Event
Broadcast to the paired client whenever local desktop clipboard changes (if clipboard synchronization is active).

```json
{
  "type": "clipboard:update",
  "contentType": "text/plain",
  "length": 142,
  "checksum": "a8f3b4c1...",
  "updatedAt": 1729674012000
}
```

## 2. Multipart Chunked Transfer Spec

- **File Header:** Contains original filename, byte length, and MIME type.
- **Chunk Size:** Bounded to 512 KB per buffer frame to prevent memory spikes in low-end hardware.
- **Verification:** Completed file size must strictly match `Content-Length`. Any incomplete transfer is flushed from temporary storage upon connection abort.


## 3. Disconnection & Reconnection Matrix

When mobile Safari enters the background on iOS (app switch / lock screen):
- The WebSocket connection is suspended by the operating system within 30 seconds.
- Upon returning to Safari, the client automatically triggers an immediate WebSocket reconnect with exponential backoff:
  - Attempt 1: Immediate (0 ms)
  - Attempt 2: 500 ms
  - Attempt 3: 1500 ms
  - Attempt 4: 3000 ms (capped)
