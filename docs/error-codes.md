# multiOS Error Handling & Diagnostic Fault Codes

Technical catalog of internal and network error codes produced across WebSocket signaling, HTTP chunk streaming, and Win32 background IPC.

## Network & Signaling Error Codes

| Error Code | HTTP Status | Description | Recovery Strategy |
|---|---|---|---|
| `ERR_AUTH_EXPIRED` | 401 | Pairing session token expired or invalid | Trigger automatic pairing refresh in mobile companion |
| `ERR_PAYLOAD_TOO_LARGE` | 413 | Inbound file exceeds configured single-transfer limit | Stream via chunked multipart buffer pipeline |
| `ERR_UNSUPPORTED_MEDIA` | 415 | File extension or MIME signature disallowed | Reject pre-flight check before temporary disk allocation |
| `ERR_DISK_FULL` | 507 | Insufficient free space on target storage drive | Pause active ingestion streams and emit notification toast |
| `ERR_HELPER_TIMEOUT` | 504 | Native Windows clipboard helper timed out | Restart clipboard worker child process without dropping server |


## IPC Failure Modes & Automatic Worker Recovery

When the Windows clipboard monitoring helper encounters an unhandled exception or terminates unexpectedly:
1. **Detection:** The primary Node.js process listens on the child process `exit` event.
2. **Exponential Backoff:** Worker restarts with an initial delay of 250ms, doubling up to a maximum 4,000ms ceiling.
3. **State Preservation:** System clipboard content is cached in memory prior to restart, preventing clipboard data loss across process boundaries.
