// A page a server on this machine serves (a dev server, a backend), for a browser on another
// machine. On a desk behind `tailscale serve` (CODINGER_HOSTS names a *.ts.net host), Codinger
// shares the local port on the tailnet at an HTTPS port of its own, https://<host>:<port>/,
// which only the tailnet reaches. A share ends when the local server stops listening.
// Between the two, a small proxy here names the local host (Host: localhost:<port>), as dev
// servers such as vite refuse a host they don't know.
// (Desks behind Caddy, such as Softmax's agent hosts, have their own way to reach a port.)

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { DATA } from './store.ts'
import { desk } from './agent.ts'

// The HTTPS ports Codinger takes for shares: apart from the ones desks use (443, 8443-8449).
const FIRST = 9100, LAST = 9199
const FILE = path.join(DATA, 'shared-ports.json')
const CHECK_MS = 30_000

type Share = { port: number; https: number; target: string; at: number }

// The proxies, by local port: each listens on a free port of 127.0.0.1, which tailscale serve targets.
const proxies = new Map<number, { server: http.Server; at: number }>()

function startProxy(port: number, target: string): Promise<number> {
  const t = new URL(target)
  const host = t.hostname.replace(/^\[|\]$/g, '')
  const headersFor = (req: http.IncomingMessage) => ({
    ...req.headers, host: `localhost:${port}`,
    'x-forwarded-host': req.headers.host ?? '', 'x-forwarded-proto': 'https',
  })
  const server = http.createServer((req, res) => {
    const p = http.request({ host, port, method: req.method, path: req.url, headers: headersFor(req) }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers)
      r.pipe(res)
    })
    p.on('error', () => { if (!res.headersSent) res.writeHead(502).end(`Nothing answers on port ${port} on the desk.`) })
    req.pipe(p)
  })
  // Websockets (vite's hot reload): the same request, then bytes both ways.
  server.on('upgrade', (req, socket, head) => {
    const up = net.connect({ host, port }, () => {
      const h = headersFor(req)
      up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(h).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => `${k}: ${x}\r\n`)).join('') + '\r\n')
      if (head.length) up.write(head)
      up.pipe(socket).pipe(up)
    })
    up.on('error', () => socket.destroy())
    socket.on('error', () => up.destroy())
  })
  return new Promise((ok, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      proxies.get(port)?.server.close()
      proxies.set(port, { server, at: Date.now() })
      ok((server.address() as net.AddressInfo).port)
    })
  })
}

// The tailnet host this desk is served as, from CODINGER_HOSTS: null when it is not behind tailscale serve.
const TAILNET = (desk('HOSTS') ?? '').split(',').map((h) => h.trim().toLowerCase().replace(/:\d+$/, '')).find((h) => h.endsWith('.ts.net')) ?? null
export const canShare = () => TAILNET != null

let shares: Share[] = []
try { shares = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { /* none yet */ }
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(shares, null, 1)) } catch { /* next time */ } }

const run = (args: string[]) => new Promise<{ ok: boolean; out: string }>((ok) =>
  execFile('tailscale', args, { timeout: 20_000 }, (err, out, errOut) => ok({ ok: !err, out: String(out) + String(errOut) })))

// The address a local server answers on: vite and others listen on ::1 only, some on 127.0.0.1 only.
const answers = (host: string, port: number) => new Promise<boolean>((ok) => {
  const s = net.connect({ host, port, timeout: 1500 })
  s.once('connect', () => { s.destroy(); ok(true) }).once('error', () => ok(false)).once('timeout', () => { s.destroy(); ok(false) })
})
async function targetOf(port: number): Promise<string | null> {
  if (await answers('127.0.0.1', port)) return `http://127.0.0.1:${port}`
  if (await answers('::1', port)) return `http://[::1]:${port}`
  return null
}

const urlOf = (s: Share) => `https://${TAILNET}:${s.https}`

// Share a local port; its tailnet address (no trailing slash), or an error to tell the agent.
export async function sharePort(port: number): Promise<{ url: string } | { error: string }> {
  if (!TAILNET) return { error: 'This desk is not behind tailscale serve, so it can not share a port.' }
  const target = await targetOf(port)
  if (!target) return { error: `Nothing listens on port ${port} on this machine. Start the server first.` }
  const had = shares.find((s) => s.port === port)
  if (had?.target === target && proxies.has(port)) return { url: urlOf(had) }
  // The HTTPS ports in use: the shares of every desk and app on this machine, not only Codinger's.
  const status = await run(['serve', 'status', '--json'])
  let used = new Set<number>()
  try { used = new Set(Object.keys(JSON.parse(status.out || '{}').TCP ?? {}).map(Number)) } catch { /* empty config */ }
  const https = had?.https ?? [...Array(LAST - FIRST + 1).keys()].map((i) => FIRST + i).find((p) => !used.has(p))
  if (!https) return { error: 'All the ports Codinger shares on are taken.' }
  let local: number
  try { local = await startProxy(port, target) } catch (e) { return { error: `Can't start the proxy: ${(e as Error).message}` } }
  const r = await run(['serve', '--bg', `--https=${https}`, `http://127.0.0.1:${local}`])
  if (!r.ok) { proxies.get(port)?.server.close(); proxies.delete(port); return { error: `tailscale serve failed: ${r.out.trim().slice(0, 300)}` } }
  shares = [...shares.filter((s) => s.port !== port), { port, https, target, at: Date.now() }]
  save()
  return { url: urlOf(shares.at(-1)!) }
}

// End the shares whose local server stopped.
async function sweep() {
  const gone: Share[] = []
  for (const s of shares) if (!(await answers(new URL(s.target).hostname.replace(/^\[|\]$/g, ''), s.port))) gone.push(s)
  if (!gone.length) return
  for (const s of gone) { await run(['serve', `--https=${s.https}`, 'off']); proxies.get(s.port)?.server.close(); proxies.delete(s.port) }
  shares = shares.filter((s) => !gone.includes(s))
  save()
}

export function startPortShares() {
  if (!TAILNET) return
  // The last server's proxies are gone: a share whose server still runs gets a new one, at the same address.
  void sweep().then(async () => { for (const s of [...shares]) await sharePort(s.port) })
  setInterval(() => void sweep(), CHECK_MS).unref()
}
