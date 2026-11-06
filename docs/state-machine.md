# multiOS Peer State Machine & Reconnection Lifecycle

Detailed state machine mapping mobile client authentication, active data exchange, and network recovery flows.

```
+------------+       Connect / Valid Token       +--------------+
| UNPAIRED   | --------------------------------> | CONNECTED    |
+------------+                                   +--------------+
      ^                                                 |
      | Revoke Pairing                                  | Socket Drop
      |                                                 v
+------------+       Reconnect (Backoff)         +--------------+
| INVALID    | <-------------------------------- | RECONNECTING |
+------------+                                   +--------------+
```

## State Invariants

- **`UNPAIRED`:** Rejects all non-pairing HTTP endpoints with status 401. Re-generates dynamic HMAC secret on each QR refresh.
- **`CONNECTED`:** Heartbeat frame required every 15 seconds. Unanswered pings increment miss counter.
- **`RECONNECTING`:** Buffers outbound clipboard frames up to 1 MB for 60 seconds before flushing pending transmission.
