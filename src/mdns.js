'use strict';

const multicastDns = require('multicast-dns');

// Answers A-record queries for e.g. "multios.local" so the iOS shortcut can use
// a stable hostname instead of a DHCP address that changes after router reboots.
function startMdns({ hostname, getAddress, log }) {
  const host = hostname.toLowerCase();
  let mdns;
  try {
    mdns = multicastDns({ bind: '0.0.0.0', interface: getAddress(), reuseAddr: true });
  } catch (err) {
    log(`mDNS baslatilamadi: ${err.message}`);
    return { stop() {} };
  }

  mdns.on('query', (query) => {
    const wanted = query.questions.some(
      (q) => q.name.toLowerCase() === host && (q.type === 'A' || q.type === 'ANY')
    );
    if (!wanted) return;
    mdns.respond({
      answers: [{ name: hostname, type: 'A', ttl: 120, flush: true, data: getAddress() }],
    });
  });

  mdns.on('error', (err) => log(`mDNS hatasi: ${err.message}`));
  mdns.on('warning', (err) => log(`mDNS uyarisi: ${err.message}`));

  return {
    stop() {
      try { mdns.destroy(); } catch { /* already closed */ }
    },
  };
}

module.exports = { startMdns };
