import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
export function publicAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  if (isIP(ip) === 6) {
    const value = ip.toLowerCase();
    // Permit only global unicast. This also excludes loopback, ULA, link-local,
    // IPv4-mapped/compatible addresses and multicast.
    return /^[23]/.test(value) && !value.startsWith('2001:db8') && !value.startsWith('2002:');
  }
  return false;
}
export async function isPublicUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) return false;
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const results = await lookup(hostname, { all: true });
    return results.length > 0 && results.every(r => publicAddress(r.address));
  } catch { return false; }
}
