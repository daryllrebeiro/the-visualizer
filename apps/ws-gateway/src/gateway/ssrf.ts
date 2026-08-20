import * as dns from 'dns';

/**
 * Checks if an IP is in the loopback, private, or link-local subnets.
 * Handles IPv4 and common IPv6 formats.
 */
export function isIpBlocked(ip: string): boolean {
  const cleanIp = ip.trim();

  // IPv6 loopback
  if (cleanIp === '::1' || cleanIp === '0000:0000:0000:0000:0000:0000:0000:0001') {
    return true;
  }

  // IPv6 Link-local / Unique-local
  const lowerIp = cleanIp.toLowerCase();
  if (lowerIp.startsWith('fe80:') || lowerIp.startsWith('fc00:') || lowerIp.startsWith('fd00:')) {
    return true;
  }

  // Handle IPv4 mapped IPv6 (e.g. ::ffff:127.0.0.1)
  let ipv4 = cleanIp;
  if (cleanIp.startsWith('::ffff:')) {
    ipv4 = cleanIp.substring(7);
  }

  const parts = ipv4.split('.');
  if (parts.length === 4) {
    const p0 = parseInt(parts[0] ?? '0', 10);
    const p1 = parseInt(parts[1] ?? '0', 10);

    // 127.0.0.0/8 (Loopback)
    if (p0 === 127) return true;

    // 10.0.0.0/8 (Private class A)
    if (p0 === 10) return true;

    // 172.16.0.0/12 (Private class B)
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;

    // 192.168.0.0/16 (Private class C)
    if (p0 === 192 && p1 === 168) return true;

    // 169.254.0.0/16 (Link local / AWS metadata)
    if (p0 === 169 && p1 === 254) return true;

    // 0.0.0.0/8 (Broadcast/Local)
    if (p0 === 0) return true;
  }

  return false;
}

/**
 * Resolves a host name, checks it against the private IP blocklist,
 * and returns the resolved safe IP address.
 * Prevents DNS Rebinding attacks by forcing the socket to use the resolved IP directly.
 */
export async function validateHostAndGetIp(host: string): Promise<string> {
  // If the host is already a direct IP address
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':')) {
    if (isIpBlocked(host)) {
      throw new Error(`Connection to internal IP address "${host}" is blocked (SSRF Protection)`);
    }
    return host;
  }

  return new Promise((resolve, reject) => {
    dns.lookup(host, { family: 4 }, (err, address) => {
      if (err) {
        return reject(new Error(`Failed to resolve host "${host}": ${err.message}`));
      }

      if (isIpBlocked(address)) {
        return reject(
          new Error(`Connection to internal IP address "${address}" is blocked (SSRF Protection)`),
        );
      }

      resolve(address);
    });
  });
}
