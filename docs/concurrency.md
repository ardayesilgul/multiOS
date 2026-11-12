# multiOS Concurrency Controls & Shared Resource Locks

Internal synchronization model preventing race conditions during simultaneous clipboard updates and file uploads.

## Resource Locking Model

1. **Clipboard Mutex:** Native clipboard reads and writes are serialized through a single-ticket mutex (`PromiseQueue`) to prevent OS-level `CLIPBRD_E_CANT_OPEN` errors.
2. **File Allocation Lock:** Multi-part file streaming uses atomic reservation keys, avoiding collision when concurrent mobile clients transfer identically named files.
3. **Graceful Drain:** Server shutdown acquires a drain lock, giving active file streams up to 5,000ms to complete before terminating transport sockets.
