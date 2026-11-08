// The improvement loop. People (the Report button) and agents (the file_issue tool) file
// issues in a GitHub repo, best a private one (Settings.issues.repo). Every desk with that
// setting can file; the one desk with issues.loop on also works on them:
//
//   1. Each minute it lists the open issues. A new one gets a kind (a label a person set,
//      else a cheap model's guess): tiny, straightforward or complex.
//   2. Tiny ones, and straightforward ones an owner filed (or labelled go), take the ship
//      path; the rest take the prototype path. Either way a worker session starts in a
//      git worktree on branch loop/<n>, on autopilot with a budget in dollars.
//   3. When autopilot ends, the worker has left result.json in the issue's folder. A ship
//      goes through the gate: rebase on origin/main, a diff of at most maxDiff lines (an
//      owner's go label lifts that), npm ci, build and tests, then push to main, at most
//      dailyPushes a day. What fails the gate waits on its branch for a go. A prototype's
//      branch is pushed, and its screenshots go up to the issues repo with a comment.
//
// The gate tests the very commit it pushes, so main only gets what built and passed.

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Person, Settings } from '../shared/types.ts'
import { childEnv } from './auth.ts'
import { describe } from './describe.ts'
import { DATA } from './store.ts'

export type IssuesConfig = NonNullable<Settings['issues']>
type Kind = 'tiny' | 'straightforward' | 'complex'
type Way = 'ship' | 'proto'
type Job = {
  n: number; title: string; kind: Kind; way: Way; checkout: string; dir: string; branch: string; sid?: string; started: number
  // working: the worker has it. queued: it waits for the gate (or for tomorrow's cap).
  // review: on its branch, waiting for a go. shipped, prototyped, failed: done with it.
  state: 'working' | 'queued' | 'review' | 'shipped' | 'prototyped' | 'failed'
  approved?: boolean; note?: string
}
type State = { jobs: Record<string, Job>; pushes: string[] }
type Issue = { number: number; title: string; body: string; author: { login: string }; labels: { name: string }[] }

export type LoopCtx = {
  settings(): Settings
  desk: string
  // Start a worker on autopilot; its id.
  start(o: { cwd: string; title: string; prompt: string; goal: string; usd: number }): string
  // Why the worker's autopilot ended; null while it still works.
  ended(sid: string): string | null
  archive(sid: string): void
}

const KINDS: Kind[] = ['tiny', 'straightforward', 'complex']
// Labels that mean the loop has it, or had it.
const TAKEN = ['loop-working', 'shipped', 'prototyped', 'loop-failed', 'needs-review', 'hold']
const LABELS: Record<string, [string, string]> = {
  tiny: ['0e8a16', 'Obvious small win, ships by itself'],
  straightforward: ['1d76db', 'Clear feature; ships by itself when an owner files it'],
  complex: ['d93f0b', 'Gets a prototype on a branch'],
  'loop-working': ['fbca04', 'The loop works on it now'],
  shipped: ['5319e7', 'On main'],
  prototyped: ['c5def5', 'Prototype branch and screenshots posted'],
  'needs-review': ['e99695', 'Done on its branch; label it go to ship it'],
  'loop-failed': ['b60205', 'The loop could not finish it'],
  go: ['0e8a16', 'An owner says ship it'],
  hold: ['cccccc', 'The loop leaves it alone'],
}
const META = /<!-- workwith-loop (\{.*?\}) -->/

export const DEFAULTS = { dailyPushes: 5, issueUsd: 3, maxDiff: 150, parallel: 2 }
const DIR = path.join(DATA, 'loop')
const STATE = path.join(DIR, 'state.json')
const TICK = 60_000

let ctx: LoopCtx
let state: State = { jobs: {}, pushes: [] }
let ticking = false
let gateChain: Promise<unknown> = Promise.resolve()

const cfg = (): IssuesConfig | undefined => ctx?.settings().issues
const opt = <K extends keyof typeof DEFAULTS>(k: K): number => Number(cfg()?.[k] ?? DEFAULTS[k])

function save() { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(state, null, 1)) }
function load() { try { state = { jobs: {}, pushes: [], ...JSON.parse(fs.readFileSync(STATE, 'utf8')) } } catch { /* first start */ } }

function run(cmd: string, args: string[], o: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = execFile(cmd, args, { cwd: o.cwd, env: o.env ?? childEnv(), timeout: o.timeout ?? 60_000, maxBuffer: 32 << 20 }, (err, out, errOut) => {
      if (err) reject(new Error(`${cmd} ${args.slice(0, 3).join(' ')}: ${(errOut || err.message).trim().slice(-1500)}`))
      else resolve(out)
    })
    if (o.input != null) { p.stdin?.on('error', () => {}); p.stdin?.end(o.input) }
  })
}
const gh = (args: string[], input?: string) => run('gh', args, { input })
const git = (dir: string, ...args: string[]) => run('git', ['-C', dir, ...args])

// ---- filing ------------------------------------------------------------------

// File an issue; its address. by: who filed it, as the proxy names them (null: nobody named).
export async function fileIssue(o: { title: string; body: string; by: Person | null; agent?: { session: string } }): Promise<string> {
  const c = cfg()
  if (!c?.repo) throw new Error('No issues repo is set (settings.json: issues.repo)')
  const title = o.title.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!title) throw new Error('Give a title')
  const who = o.agent ? `an agent in session ${o.agent.session}` : o.by ? o.by.name : 'someone'
  const meta = { by: o.agent ? null : o.by?.login ?? null, via: o.agent ? 'agent' : 'button', desk: ctx.desk, ...(o.agent ? { session: o.agent.session } : {}) }
  const body = `${o.body.trim()}\n\n---\n_Filed by ${who} on ${ctx.desk}._\n<!-- workwith-loop ${JSON.stringify(meta)} -->\n`
  const out = await gh(['issue', 'create', '-R', c.repo, '--title', title, '--body-file', '-'], body)
  setTimeout(() => void tick(), 2000)
  return out.trim().split('\n').pop()!
}

// ---- the loop ----------------------------------------------------------------

export function startLoop(c: LoopCtx) {
  ctx = c
  load()
  if (!cfg()?.loop || !cfg()?.repo) return
  void ensureLabels().catch((e) => console.warn('[loop] labels:', e.message))
  setTimeout(() => void tick(), 5000)
  setInterval(() => void tick(), TICK).unref()
}

async function ensureLabels() {
  const have = new Set((JSON.parse(await gh(['label', 'list', '-R', cfg()!.repo, '--json', 'name', '--limit', '100'])) as { name: string }[]).map((l) => l.name))
  for (const [name, [color, desc]] of Object.entries(LABELS)) if (!have.has(name)) await gh(['label', 'create', name, '-R', cfg()!.repo, '-c', color, '-d', desc]).catch(() => {})
}

export async function tick() {
  const c = cfg()
  if (!c?.loop || !c.repo || ticking) return
  ticking = true
  try {
    for (const j of Object.values(state.jobs)) {
      if (j.state === 'working' && j.sid) { const why = ctx.ended(j.sid); if (why != null) await finished(j, why) }
    }
    const open: Issue[] = JSON.parse(await gh(['issue', 'list', '-R', c.repo, '--state', 'open', '--limit', '100', '--json', 'number,title,body,author,labels']))
    for (const i of open.sort((a, b) => a.number - b.number)) {
      const labels = i.labels.map((l) => l.name)
      const j = state.jobs[i.number]
      // An owner's go on what waits for review: through the gate, with no size cap.
      if (j && labels.includes('go') && (j.state === 'review' || j.state === 'prototyped')) { j.approved = true; j.state = 'queued'; save() }
      if (j || labels.some((l) => TAKEN.includes(l))) continue
      if (Object.values(state.jobs).filter((x) => x.state === 'working').length >= opt('parallel')) continue
      await take(i, labels).catch((e) => console.warn(`[loop] #${i.number}:`, e.message))
    }
    for (const j of Object.values(state.jobs)) if (j.state === 'queued') await toGate(j)
  } catch (e) {
    console.warn('[loop]', (e as Error).message)
  } finally {
    ticking = false
  }
}

function metaOf(i: Issue): { by?: string | null; via?: string } | null {
  const m = META.exec(i.body ?? '')
  try { return m ? JSON.parse(m[1]) : null } catch { return null }
}

// An owner filed it: from a desk, with their login; on GitHub itself, as their user; or labelled go.
export function byOwner(i: Pick<Issue, 'body' | 'author' | 'labels'>, owners: string[]): boolean {
  const own = new Set(owners.map((o) => o.toLowerCase()))
  if (i.labels.some((l) => l.name === 'go')) return true
  const m = metaOf(i as Issue)
  return m ? !!m.by && own.has(m.by.toLowerCase()) : own.has(i.author.login.toLowerCase())
}

const TRIAGE = `You sort issues for the improvement loop of a web app (a TypeScript server and a React page). Reply with JSON only, on one line: {"kind": "tiny" | "straightforward" | "complex", "why": "one short sentence"}.
tiny: an obvious small win with no design choice: a wrong word, a small style fix, a clear small bug.
straightforward: a clear fix or feature with one obvious way to build it, in a few files.
complex: anything else: design choices, unclear asks, large changes, or changes to login, auth, data files, session processes, updates or billing.
When unsure, say complex.`

export function parseKind(answer: string | null): { kind: Kind; why: string } {
  const m = /\{[\s\S]*\}/.exec(answer ?? '')
  try {
    const r = JSON.parse(m![0])
    if (KINDS.includes(r.kind)) return { kind: r.kind, why: String(r.why ?? '') }
  } catch { /* fall through */ }
  return { kind: 'complex', why: 'The triage gave no clear answer.' }
}

async function take(i: Issue, labels: string[]) {
  const c = cfg()!
  const set = KINDS.find((k) => labels.includes(k))
  const { kind, why } = set ? { kind: set, why: 'A person set the kind.' } : parseKind(await describe(`${i.title}\n\n${(i.body ?? '').replace(META, '')}`, TRIAGE))
  const way: Way = kind === 'tiny' || (kind === 'straightforward' && byOwner(i, c.owners ?? [])) ? 'ship' : 'proto'
  const checkout = c.checkout ? path.resolve(c.checkout.replace(/^~/, os.homedir())) : process.cwd()
  const dir = path.join(DIR, 'trees', `issue-${i.number}`)
  const out = path.join(DIR, 'issues', String(i.number))
  const branch = `loop/${i.number}`
  fs.mkdirSync(out, { recursive: true })
  fs.rmSync(path.join(out, 'result.json'), { force: true })
  await git(checkout, 'fetch', '-q', 'origin', 'main')
  if (!fs.existsSync(dir)) await git(checkout, 'worktree', 'add', '-q', '-B', branch, dir, 'origin/main')
  const j: Job = { n: i.number, title: i.title, kind, way, checkout, dir, branch, started: Date.now(), state: 'working' }
  state.jobs[i.number] = j
  save()
  await gh(['issue', 'edit', String(i.number), '-R', c.repo, '--add-label', `loop-working,${kind}`])
  await comment(j, `The loop took this issue as **${kind}** (${why}) and will ${way === 'ship' ? 'build it and ship it to main if it passes the checks' : 'build a prototype on a branch, with screenshots'}.`)
  j.sid = ctx.start({ cwd: dir, title: `#${i.number} ${i.title}`.slice(0, 60), prompt: prompt(i, j, out, c), goal: `${way === 'ship' ? 'Fix' : 'Prototype'} issue #${i.number}, then write result.json`, usd: opt('issueUsd') })
  save()
}

function prompt(i: Issue, j: Job, out: string, c: IssuesConfig): string {
  const port = 4700 + (j.n % 100)
  const common = `[workwith improvement loop] Issue #${j.n} in ${c.repo}: "${i.title}"

${(i.body ?? '').replace(META, '').trim() || '(no text)'}

---
You work in ${j.dir}, a git worktree on branch \`${j.branch}\`, made from origin/main.
- Install with \`npm ci\`. Build with \`npm run build\`. Test with \`CODINGER_HOME=$(mktemp -d) npm test\`: never without a temporary CODINGER_HOME, so the tests cannot touch this desk's data.
- Commit on \`${j.branch}\`. End each commit message with the line \`Issue: ${c.repo}#${j.n}\`. Never push to main and never merge: the loop does that after its own checks.
- Keep personal data out of the code, the commits and the result: no names of real people, no emails, no home folder paths, no text from other sessions.
- Write down each choice you make that matters.`
  const ship = `
- This is the ship path. Keep the change small and focused: the loop ships it only when the diff is at most ${opt('maxDiff')} lines (added plus removed). If the issue truly needs more, or needs a design choice, build it as a prototype and set "way": "proto" in the result.`
  const proto = `
- This is the prototype path. Build a working prototype; you may make design choices.
- Take PNG screenshots of the result and save them in ${out}/screens/. Start a server with start_task: \`CODINGER_HOME=$(mktemp -d) PORT=${port} npm start\`, and use the headless browser. Give the server test data with neutral names only.
- If that server keeps running, call show_artifact with its url, and put the address it returns in the result as "demo".
- You may push this branch, and only this branch: \`git push -u origin ${j.branch}\`.`
  const end = `
- When you are done, or blocked, write ${out}/result.json: {"status": "done" | "failed", "way": "ship" | "proto", "summary": "what you did and why, in a few sentences, for the issue", "choices": ["each choice that matters"], "demo": "an address, or leave it out"}. Then end your message with <autopilot-stop reason="…"/>.`
  return common + (j.way === 'ship' ? ship : proto) + end
}

type Result = { status?: string; way?: Way; summary?: string; choices?: string[]; demo?: string }

async function finished(j: Job, why: string) {
  const out = path.join(DIR, 'issues', String(j.n))
  let r: Result = {}
  try { r = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8')) } catch { /* none */ }
  await gh(['issue', 'edit', String(j.n), '-R', cfg()!.repo, '--remove-label', 'loop-working']).catch(() => {})
  if (r.status !== 'done') return fail(j, `The worker stopped (${why}) with no finished result.${r.summary ? `\n\n${r.summary}` : ''}`)
  j.note = [r.summary, ...(r.choices?.length ? ['Choices:', ...r.choices.map((c) => `- ${c}`)] : [])].filter(Boolean).join('\n')
  if (r.way === 'proto') j.way = 'proto'
  if (j.way === 'ship') { j.state = 'queued'; save(); return }
  // A prototype: its branch and screenshots up, for an owner to look at.
  await git(j.dir, 'push', '-q', '-u', 'origin', `${j.branch}:${j.branch}`).catch(() => {})
  const shots = await upload(j, path.join(out, 'screens'))
  const code = cfg()!.codeRepo
  await comment(j, [
    `**Prototype ready** on branch \`${j.branch}\`${code ? ` ([compare](https://github.com/${code}/compare/main...${j.branch}))` : ''}.`,
    // A localhost address is of no use to anyone reading the issue.
    j.note, r.demo && !/^https?:\/\/(localhost|127\.|\[::1\])/.test(r.demo) ? `Live demo (on the desk's tailnet): ${r.demo}` : '', ...shots,
    'Label this issue **go** to ship the branch to main.',
  ].filter(Boolean).join('\n\n'))
  await gh(['issue', 'edit', String(j.n), '-R', cfg()!.repo, '--add-label', 'prototyped']).catch(() => {})
  j.state = 'prototyped'
  save()
}

async function fail(j: Job, text: string) {
  j.state = 'failed'
  save()
  await comment(j, `**The loop could not finish this issue.** ${text}\n\nThe work so far is in the worktree on branch \`${j.branch}\`. Take the loop-failed label off to try again.`)
  await gh(['issue', 'edit', String(j.n), '-R', cfg()!.repo, '--add-label', 'loop-failed']).catch(() => {})
  // A retry starts over.
  delete state.jobs[j.n]
  save()
}

async function review(j: Job, why: string) {
  j.state = 'review'
  save()
  await git(j.dir, 'push', '-q', '-u', 'origin', `${j.branch}:${j.branch}`).catch(() => {})
  await comment(j, `**Done on branch \`${j.branch}\`, not shipped:** ${why}\n\n${j.note ?? ''}\n\nLabel this issue **go** to ship it.`)
  await gh(['issue', 'edit', String(j.n), '-R', cfg()!.repo, '--add-label', 'needs-review']).catch(() => {})
}

const today = () => new Date().toLocaleDateString('sv')

// One gate at a time: each rebases on the main the last one pushed.
function toGate(j: Job): Promise<unknown> {
  if (j.state !== 'queued') return Promise.resolve()
  const pushes = state.pushes.filter((d) => d === today()).length
  if (pushes >= opt('dailyPushes')) return Promise.resolve() // waits for tomorrow
  gateChain = gateChain.then(() => gate(j)).catch((e) => fail(j, `The gate broke: ${(e as Error).message}`))
  return gateChain
}

export function diffLines(numstat: string): number {
  return numstat.split('\n').reduce((n, l) => { const [a, d] = l.split('\t'); return n + (Number(a) || 0) + (Number(d) || 0) }, 0)
}

async function gate(j: Job, again = false): Promise<void> {
  await git(j.dir, 'fetch', '-q', 'origin', 'main')
  try { await git(j.dir, 'rebase', '-q', 'origin/main') } catch {
    await git(j.dir, 'rebase', '--abort').catch(() => {})
    return review(j, 'it does not rebase cleanly on main.')
  }
  const ahead = Number((await git(j.dir, 'rev-list', '--count', 'origin/main..HEAD')).trim())
  if (!ahead) return fail(j, 'The worker made no commit.')
  const lines = diffLines(await git(j.dir, 'diff', '--numstat', 'origin/main...HEAD'))
  if (lines > opt('maxDiff') && !j.approved) return review(j, `the diff has ${lines} lines, over the cap of ${opt('maxDiff')}.`)
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-gate-'))
  const env = { ...childEnv(), CODINGER_HOME: home }
  try {
    await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: j.dir, env, timeout: 600_000 })
    await run('npm', ['run', 'build'], { cwd: j.dir, env, timeout: 600_000 })
    await run('npm', ['test'], { cwd: j.dir, env, timeout: 600_000 })
  } catch (e) {
    return review(j, `the build or the tests failed:\n\n\`\`\`\n${(e as Error).message.slice(-1200)}\n\`\`\``)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
  try { await git(j.dir, 'push', '-q', 'origin', 'HEAD:main') } catch (e) {
    // Main moved while the tests ran: once more on the new main.
    if (!again) return gate(j, true)
    return review(j, `the push to main failed: ${(e as Error).message}`)
  }
  const sha = (await git(j.dir, 'rev-parse', 'HEAD')).trim()
  state.pushes = [...state.pushes.filter((d) => d === today()), today()]
  j.state = 'shipped'
  save()
  const code = cfg()!.codeRepo
  await comment(j, `**Shipped to main** as ${code ? `${code}@${sha}` : `\`${sha.slice(0, 7)}\``} (${lines} lines; build and tests passed).\n\n${j.note ?? ''}`)
  await gh(['issue', 'close', String(j.n), '-R', cfg()!.repo, '--reason', 'completed']).catch(() => {})
  await gh(['issue', 'edit', String(j.n), '-R', cfg()!.repo, '--add-label', 'shipped', '--remove-label', 'needs-review,prototyped,go']).catch(() => {})
  if (j.sid) ctx.archive(j.sid)
  await git(j.dir, 'push', '-q', 'origin', '--delete', j.branch).catch(() => {})
  // Its node_modules alone is hundreds of megabytes.
  await git(j.checkout, 'worktree', 'remove', '--force', j.dir).catch((e) => console.warn(`[loop] worktree #${j.n}:`, e.message))
}

function comment(j: Job, text: string) {
  return gh(['issue', 'comment', String(j.n), '-R', cfg()!.repo, '--body-file', '-'], text).catch((e) => console.warn(`[loop] comment #${j.n}:`, e.message))
}

// Put the screenshots in the issues repo (private, unlike the code), as markdown images.
async function upload(j: Job, dir: string): Promise<string[]> {
  let files: string[] = []
  try { files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f)).slice(0, 8) } catch { return [] }
  const repo = cfg()!.repo
  const out: string[] = []
  for (const f of files) {
    const at = `screens/${j.n}/${Date.now()}-${f.replace(/[^\w.-]/g, '_')}`
    const input = JSON.stringify({ message: `Screenshot for #${j.n}`, content: fs.readFileSync(path.join(dir, f)).toString('base64') })
    try {
      const r = JSON.parse(await gh(['api', '-X', 'PUT', `repos/${repo}/contents/${at}`, '--input', '-'], input))
      out.push(`![${f}](${r.content.html_url}?raw=true)`)
    } catch (e) { console.warn(`[loop] upload ${f}:`, (e as Error).message) }
  }
  return out
}
