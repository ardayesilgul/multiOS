# multiOS Connection Troubleshooting Guide

Common network issues and diagnostic steps when pairing an iPhone with the Windows multiOS desktop application.

## 1. AP / Client Isolation on Routers

Some modern Wi-Fi routers (especially guest networks or enterprise mesh networks) enable "Client Isolation" by default, preventing devices connected to the same SSID from communicating directly.

- **Symptom:** The QR code cannot be loaded by the phone, or connection drops immediately.
- **Resolution:**
  - Verify both devices are connected to the main Wi-Fi band (avoid guest networks).
  - Test ping from Windows terminal to the phone's local IP address:
    ```powershell
    Test-NetConnection -ComputerName <PHONE_IP> -Port 8765
    ```

## 2. Windows Defender Firewall Configuration

multiOS requires inbound permission on the bound local TCP port for the Private network profile.

- If Windows prompts for firewall access on initial run, ensure **Private Networks** is checked.
- To inspect or reset the firewall rule via PowerShell (Run as Administrator):
  ```powershell
  Get-NetFirewallRule -DisplayName "*multiOS*" | Select-Object Name, Enabled, Direction, Action
  ```

## 3. Subnet Mismatches (VPNs & Virtual Adapters)

- If Windows is running a VPN (WireGuard, OpenVPN, Tailscale) or Hyper-V / WSL2 virtual switches, ensure multiOS selects the physical LAN adapter.
- The desktop diagnostics panel displays the actively bound IPv4 address. Ensure your iPhone's IP starts with the same subnet prefix (e.g. `192.168.1.x`).
