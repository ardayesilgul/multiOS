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
