# multiOS Event Dispatcher & Message Bus Architecture

Technical overview of internal message routing between the Node.js server thread, WebSocket handlers, and native Win32 window processes.

## Message Bus Topology

- **In-Memory Pub/Sub:** Decoupled event bus handling state changes (`DEVICE_PAIRED`, `TRANSFER_PROGRESS`, `CLIPBOARD_INCOMING`).
- **Zero Serialization Overhead:** Local events pass references without redundant JSON stringify/parse cycles.
- **Backpressure Propagation:** Stream watermarks automatically pause incoming WebSocket binary frames if disk write queues back up.
