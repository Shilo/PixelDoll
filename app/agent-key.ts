import type { IncomingHttpHeaders } from 'node:http'

// Request guard for the dev server's /__dev endpoints (vite.config.ts): same-origin requests from this machine only.
// Loopback socket, Host = localhost, Sec-Fetch-Site = same-origin, and no proxy headers (HTTP-aware proxies and tunnels add
// them). A raw TCP forward (ssh -L/-R, socat) looks exactly like a local request, so the real rule is in AGENTS.md: never
// expose the agent server beyond localhost.
export const localSameOrigin = (req: { headers: IncomingHttpHeaders; socket: { remoteAddress?: string } }) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') &&
  /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? '') &&
  req.headers['sec-fetch-site'] === 'same-origin' &&
  !Object.keys(req.headers).some((h) => h === 'forwarded' || h === 'via' || h.startsWith('x-forwarded-'))

// Run by `npm run selftest` (scripts/selftest.ts).
export function selfTest() {
  const host = 'localhost:5199'
  const ok = { host, 'sec-fetch-site': 'same-origin' }
  const allowed = (headers: IncomingHttpHeaders, remoteAddress = '::1') => localSameOrigin({ headers, socket: { remoteAddress } })
  console.assert(allowed(ok), 'valid local same-origin request allowed')
  console.assert(allowed(ok, '127.0.0.1') && allowed(ok, '::ffff:127.0.0.1'), 'IPv4 loopback socket allowed')
  for (const site of ['same-site', 'cross-site', 'none']) console.assert(!allowed({ ...ok, 'sec-fetch-site': site }), `Sec-Fetch-Site ${site} rejected`)
  console.assert(!allowed({ host }), 'missing Sec-Fetch-Site rejected')
  for (const h of ['evil.example', 'localhost.evil.example']) console.assert(!allowed({ ...ok, host: h }), `Host ${h} rejected`)
  console.assert(!allowed({ 'sec-fetch-site': 'same-origin' }), 'missing Host rejected')
  console.assert(!allowed(ok, '192.168.1.5'), 'non-loopback socket rejected')
  for (const h of ['forwarded', 'via', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto']) console.assert(!allowed({ ...ok, [h]: 'x' }), `${h} header rejected`)
}
