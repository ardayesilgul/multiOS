# multiOS Event Dispatcher & Message Bus Architecture

Technical overview of internal message routing between the Node.js server thread, WebSocket handlers, and native Win32 window processes.

## Message Bus Topology

- **In-Memory Pub/Sub:** Decoupled event bus handling state changes (`DEVICE_PAIRED`, `TRANSFER_PROGRESS`, `CLIPBOARD_INCOMING`).
- **Zero Serialization Overhead:** Local events pass references without redundant JSON stringify/parse cycles.
- **Backpressure Propagation:** Stream watermarks automatically pause incoming WebSocket binary frames if disk write queues back up.


## Event Priorities & Queue Dispatch

1. **High Priority (Immediate):** `PAIR_REVOKE`, `CLIPBOARD_PURGE` (dispatched synchronously).
2. **Normal Priority:** `PROGRESS_TICK`, `TELEMETRY_LOG` (batched at 60 FPS tick intervals).
