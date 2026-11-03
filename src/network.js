'use strict';

const os = require('os');
const { execFile } = require('child_process');

const VIRTUAL = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|Bluetooth|Tailscale|ZeroTier|Npcap|TAP|VPN/i;
const PREFERRED = /Wi-?Fi|Wireless|WLAN|Kablosuz|Ethernet/i;

function isPrivate(ip) {
  return /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

// Picks the IPv4 address the iPhone is most likely to reach on the home LAN.
function getLanAddress() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      let score = 0;
      if (isPrivate(a.address)) score += 4;
      if (PREFERRED.test(name)) score += 2;
      if (VIRTUAL.test(name)) score -= 10;
      if (a.address.startsWith('169.254.')) score -= 20;
      candidates.push({ name, address: a.address, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  return candidates[0] || { name: 'loopback', address: '127.0.0.1', score: -100 };
}

function getNetworkProfile(iface) {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve({ category: null, firewall: null });
    const script = "$ErrorActionPreference='Stop'; $p=Get-NetConnectionProfile -InterfaceAlias $env:MULTIOS_NETWORK_IFACE | Select-Object -First 1; $name=if($p.NetworkCategory -eq 'DomainAuthenticated'){'Domain'}else{[string]$p.NetworkCategory}; $f=Get-NetFirewallProfile -PolicyStore ActiveStore -Name $name; @{ category=[string]$p.NetworkCategory; firewall=[bool]$f.Enabled } | ConvertTo-Json -Compress";
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, timeout: 8000, env: { ...process.env, MULTIOS_NETWORK_IFACE: iface },
    }, (error, stdout) => {
      if (!error) { try { return resolve(JSON.parse(stdout)); } catch {} }
      resolve({ category: null, firewall: null });
    });
  });
}

module.exports = { getLanAddress, getNetworkProfile };
