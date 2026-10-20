# multiOS Local Discovery Specification (mDNS / Bonjour)

Details on how the native desktop application advertises its transfer capabilities to iOS Safari and mobile multiOS companions.

## Service Record Parameters

- **Service Type:** `_multios._tcp.local.`
- **Port:** Configured HTTP port (default: `8765`)
- **TXT Record Fields:**
  - `v`: Protocol version (`1`)
  - `name`: Sanitized Windows hostname (`DESKTOP-XXX`)
  - `auth`: Required auth mode (`token`)
  - `os`: Native platform (`windows`)

## iOS Discovery Fallback

When multicast DNS packets are dropped by network switches with IGMP snooping enabled:
- The user scans the QR code directly containing `http://<LAN_IP>:<PORT>/?token=<PAIRING_TOKEN>`.
- The web companion caches the origin for subsequent quick reconnects within the same network session.
