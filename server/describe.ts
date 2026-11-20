// A small question about a session, answered by a cheap model: a separate `claude -p` with
// no tools, no MCP servers, no settings and no saved transcript, so it costs a fraction of
// a cent and leaves nothing behind. It names a session the agent didn't name (autoTitle);
// other callers can ask other things of the same text (an emoji for a project, say).

import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import type { SessionMeta } from '../shared/types.ts'
import { addSpend, costOf } from '../shared/prices.ts'
import { CLAUDE, childEnv } from './auth.ts'
import { sessionEnv } from './billing.ts'
import { spend } from './meter.ts'
import { offTranscript } from './usage.ts'
import type { Session } from './session.ts'

const MODEL = 'haiku'
const TIMEOUT = 30_000
const MAX_TEXT = 4000

// Ask `ask` (the system prompt) about `text`; the answer's text, or null when the call failed.
// meta: the session to count the call's cost on.
export async function describe(text: string, ask: string, meta?: SessionMeta): Promise<string | null> {
  const args = [
    '-p', '--output-format', 'json', '--model', MODEL, '--tools', '', '--strict-mcp-config',
    '--setting-sources', '', '--disable-slash-commands', '--no-session-persistence', '--system-prompt', ask,
  ]
  let out = ''
  const code = await new Promise<number | null>((resolve) => {
    // Out of any project, so no CLAUDE.md or project settings come in.
    const p = spawn(CLAUDE, args, { cwd: os.tmpdir(), env: sessionEnv(childEnv()), windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
    const timer = setTimeout(() => p.kill('SIGTERM'), TIMEOUT)
    p.stdout.setEncoding('utf8').on('data', (d: string) => { out += d })
    p.stdin.on('error', () => {})
    p.stdin.end(text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + '…' : text)
    p.on('error', () => { clearTimeout(timer); resolve(-1) })
    p.on('exit', (c) => { clearTimeout(timer); resolve(c) })
  })
  let r: any = null
  try { r = JSON.parse(out) } catch { return null }
  const u = r?.usage
  if (u) {
    const model = Object.keys(r.modelUsage ?? {})[0] ?? MODEL
    spend(u, model)
    if (meta) { addSpend(meta, costOf(u, model)); offTranscript(meta.claudeSessionId, meta.cwd, u, model) }
  }
  if (code !== 0 || r.is_error || typeof r.result !== 'string') return null
  return r.result.trim() || null
}

// After this many finished turns with no name from the agent or the user, Codinger names it.
const TURNS = 2
const TITLE_ASK = 'Name a coding session for a sidebar, from the first messages its user sent. Reply with a short noun phrase of 2 to 5 words (never more than 5) that names the task, like "Login flow fix", "Billing export bug" or "Release notes draft". Use the language of the messages. Reply with the name only: no quotes, no full stop.'
const asked = new Set<string>()

// Whether a session still has only the name it started with: its folder's, which nobody chose.
export const untitled = (m: SessionMeta) => !m.titled && !m.titleByUser && m.title === path.basename(m.cwd)

// Called when a turn ends: name a worker session from its first messages, once, if nobody did.
export function autoTitle(s: Session, changed: () => void) {
  const m = s.meta
  if (m.kind !== 'worker' || !untitled(m) || asked.has(m.id)) return
  const ev = s.getEvents()
  if (ev.filter((e) => e.t === 'result').length < TURNS) return
  const said = ev.flatMap((e) => e.t === 'user' ? [e.parts.map((p) => p.text ?? '').join('\n').trim()] : []).filter(Boolean).slice(0, 3)
  if (!said.length) return
  asked.add(m.id)
  void describe(said.map((t, i) => `Message ${i + 1}:\n${t}`).join('\n\n'), TITLE_ASK, m).then((t) => {
    const title = t?.split('\n')[0].replace(/^["'“]+|["'”.]+$/g, '').split(/\s+/).filter(Boolean).slice(0, 6).join(' ').slice(0, 60)
    // The agent or the user may have named it while the call ran.
    if (!title || !untitled(m)) return
    m.title = title
    m.titled = true
    changed()
  })
}
