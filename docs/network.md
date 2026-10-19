# multiOS Network Architecture & Local Discovery

This document details the network transport, device discovery, and communication lifecycle used by multiOS for zero-configuration local transfers between Windows and iPhone clients.

```
+-------------------+          mDNS / UDP Broadcast           +-------------------+
|                   |  <----------------------------------->  |                   |
|  iPhone / Client  |                                         |  Windows multiOS  |
|  (Safari Web UI)  |       Authenticated HTTP / WS           |  (Native Desktop) |
|                   |  ====================================>  |                   |
+-------------------+                                         +-------------------+
```

## Transport Layer Specifications

1. **Protocol Stack:**
   - **Transport:** TCP over IPv4 local subnets (802.11 / Wi-Fi).
   - **Handshake & Session:** TLS 1.3 / local ephemeral certificate with token-based authorization.
   - **Signaling:** WebSockets (`ws://` / `wss://`) on bound local port (default: 8765) for realtime clipboard state synchronization.
   - **Binary Streaming:** Chunked HTTP POST for file and photo payloads exceeding 2 MB.

2. **Network Topology Boundaries:**
   - Transfers never leave the local broadcast domain / gateway subnet.
   - Zero outbound WAN dependencies; all assets, icons, and client scripts are embedded and served directly from local memory.
   - Multihomed network adapters (e.g. Ethernet + Wi-Fi) are scanned to bind on the primary user-facing interface.

## Connection Lifecycle

| State | Event | Trigger | Security Check |
|---|---|---|---|
| `IDLE` | Server starts | Desktop app launch | Windows firewall rule verification |
| `PAIRING` | QR scan | Mobile scans dynamic QR | Dynamic HMAC token generation |
| `CONNECTED` | WebSocket ack | Mobile handshake confirmed | Session token validated |
| `TRANSFER` | Chunk stream | User drops media / file | Payload checksum & path verification |
| `DISCONNECT` | Ping timeout | Network drop / window closed | Ephemeral pairing invalidated on revoke |


## Interface Selection & Multihoming Behavior

When multiple network adapters are active (e.g. Wi-Fi + Ethernet / Hyper-V virtual bridge):
1. **Enumeration:** multiOS queries `os.networkInterfaces()` filtering out non-IPv4, loopback, and APIPA (`169.254.x.x`) addresses.
2. **Preference:** Wireless adapters matching standard 802.11 SSID broadcasts take precedence for mobile device alignment.
3. **Fallback:** If multi-subnet bridging is detected, the desktop UI provides an interface selector dropdown in the Diagnostics view.


## Broadcast Beacon Timing & Jitter

To prevent channel contention on crowded 2.4 GHz bands:
- Discovery beacons transmit at randomized intervals between 1200 ms and 1800 ms (`±300ms` Poisson jitter).
- Background sleep mode throttles discovery broadcasts to once every 10 seconds until an incoming connection is negotiated.


## Socket Keep-Alive & TCP NoDelay

- Sockets are configured with `TCP_NODELAY` enabled (`setNoDelay(true)`) to disable Nagle's algorithm for sub-10ms clipboard synchronization.
- TCP keep-alive probes are emitted every 15,000 ms with 3 unacknowledged probes before aborting dead wireless sessions.
