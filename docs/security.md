# multiOS Security Model & Threat Boundaries

multiOS implements a strict defense-in-depth model for peer-to-peer data transfers over shared and untrusted local networks.

## Threat Model Assumptions

1. **Untrusted Local Wi-Fi:**
   - Public or shared networks (cafes, offices, dormitories) may have other clients capable of port scanning, packet inspection, or attempting unauthorized local connections.
   - Any client that can reach the bound port must still be treated as unauthenticated until proven otherwise.

2. **Access Control Guarantees:**
   - **Origin Isolation:** Cross-Origin Resource Sharing (CORS) strictly forbids foreign browser origins from invoking any control or transfer endpoint.
   - **One-Time Pairing Secrets:** The pairing QR code encodes a high-entropy cryptographically random session token. Unpaired requests are immediately rejected with `401 Unauthorized`.
   - **Path Traversal Protection:** All incoming file transfers normalize destination paths and restrict writes exclusively to the designated local incoming directory. Slashes, null bytes, and parent directory references (`..`) are rejected before disk writes.

3. **Clipboard Protection:**
   - OS-level clipboard updates require an active paired session and positive acknowledgment from the background helper process.
   - Paused clipboard state suspends listener hooks and purges volatile clipboard memory immediately.
