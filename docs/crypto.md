# multiOS Local Cryptographic Primitives

Technical notes on the hashing, token verification, and data integrity checks applied within multiOS.

## Hash Algorithms

1. **Session Identifiers:** SHA-256 for public-facing truncated session identifiers (e.g. `sessionId.slice(0, 8)`).
2. **File Checksums:** SHA-256 computed on the fly during chunked ingestion to guarantee zero corruption over lossy Wi-Fi connections.
3. **QR Payload Verification:** Dynamic pairing tokens are salt-encoded with local system timestamp to prevent replay attacks across application restarts.
