// One small question to a cheap model, with no tools, MCP servers or saved session: for short
// answers Codinger wants for itself (a project's emoji, server/projecticons.ts). The prompt goes on
// stdin. Resolves to the answer's text, or '' when Claude Code gives none.

import { execFile } from 'node:child_process'
import os from 'node:os'
import { CLAUDE, childEnv } from './auth.ts'
import { modelFor, sessionEnv } from './billing.ts'

export function oneShot(prompt: string, opts: { model?: string; cwd?: string; timeout?: number } = {}): Promise<string> {
  const model = modelFor(opts.model ?? 'haiku') ?? 'haiku'
  return new Promise((resolve) => {
    const p = execFile(CLAUDE, ['-p', '--model', model, '--output-format', 'json', '--no-session-persistence', '--tools', '', '--strict-mcp-config'],
      { cwd: opts.cwd ?? os.tmpdir(), env: sessionEnv(childEnv()), timeout: opts.timeout ?? 60_000, windowsHide: true, maxBuffer: 1 << 20 }, (_err, out) => {
        try { resolve(String(JSON.parse(out).result ?? '').trim()) } catch { resolve('') }
      })
    p.stdin?.end(prompt)
  })
}
