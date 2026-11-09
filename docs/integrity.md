# multiOS Data Integrity & Chunk Checksum Verification

End-to-end checksum verification strategy for high-throughput local Wi-Fi file transfers.

## Checksum Verification Pipeline

1. **Client-Side Digest:** Inbound files stream through an incremental streaming SHA-256 hash calculator during transmission.
2. **Atomic Verification:** Upon receiving the terminal multipart boundary chunk, the calculated SHA-256 hash is compared against the header digest.
3. **Rollback Guarantee:** If a hash mismatch occurs (due to Wi-Fi packet degradation or aborted transmission), the partial temporary file is unlinked immediately (`fs.unlinkSync`) prior to notifying the client.
