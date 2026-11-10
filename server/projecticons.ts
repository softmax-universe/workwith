// A project's icon for the sidebar (web/src/components/ProjectIcon.tsx). From the session's folder up
// to its repository's root, the nearest folder with an icon set by hand (Settings.projectIcons: an
// image or an emoji) or an icon of its own (findIn: a favicon, an app icon, a logo); else an emoji Claude picked for the
// repository from its name and README (Settings.projectEmoji); else the critter, until it has one.
// A folder that is not a project (the home folder, a folder of projects) is never walked for an
// image: it wears the icon of the one project in it, if it holds just one, else its own emoji.
// What is found is never saved, so a project that gets a logo later wears it within a minute or two.

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe } from './describe.ts'
import { readable } from './guarded.ts'

// The repository's root: the nearest folder up with .git, or the folder itself.
function rootOf(dir: string): string {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d
    if (path.dirname(d) === d) return dir
  }
}

const isFile = (f: string) => { try { return fs.statSync(f).isFile() } catch { return false } }

// A project: a folder in a git repository, or one with a project's files at its top. The home folder
// is not one, even with a stray package.json or a git repository of dotfiles: it holds projects.
const MARKERS = ['.git', 'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', 'pubspec.yaml', 'deno.json', 'Package.swift', 'build.gradle', 'pom.xml', 'Gemfile', 'setup.py', 'requirements.txt', 'CMakeLists.txt', 'manifest.json']
const hasMarker = (d: string) => MARKERS.some((m) => fs.existsSync(path.join(d, m)))
const isHome = (d: string) => path.resolve(d) === path.resolve(os.homedir())
export function isProject(dir: string): boolean {
  if (isHome(dir)) return false
  const root = rootOf(dir)
  return (fs.existsSync(path.join(root, '.git')) && !isHome(root)) || hasMarker(dir)
}

// The projects in a folder that is not one, up to 2 levels down; it stops at the second.
function projectsIn(dir: string): string[] {
  const out: string[] = []
  const look = (d: string, depth: number) => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (out.length > 1) return
      if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith('.')) continue
      const sub = path.join(d, e.name)
      if (!readable(sub)) continue
      if (hasMarker(sub)) out.push(sub)
      else if (depth < 2) look(sub, depth + 1)
    }
  }
  look(dir, 1)
  return out
}

// Images a project's scaffold ships and nobody has replaced yet (md5): create-next-app's favicon.ico.
const DEFAULTS = new Set(['c30c7d42707a47a3f4591831641e50dc'])
const isDefault = (f: string) => {
  try { return fs.statSync(f).size < 1_000_000 && DEFAULTS.has(crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')) } catch { return false }
}

// A folder's own icon, found by a short walk through it (at most 6 levels and 5000 entries), each image
// scored by its name and place. An image that the project points to wins: an icon in a web app
// manifest (manifest.json, *.webmanifest; a Chrome extension's too), a page's <link rel="icon">, the
// "icon" of package.json (a VS Code extension, electron-builder), or a logo at the top of the README.
// Else the best name: favicon, apple-touch-icon, maskable, an Android launcher icon (mipmap-*/
// ic_launcher), an iOS AppIcon.appiconset, Tauri's src-tauri/icons, icon, logo, mascot; in a
// public/, static/, assets/ or res/ folder a little more, deeper a little less. Images of other
// brands and of the UI (github.svg, arrow.svg, a folder of many icons) count less, and none below a
// score of 25 counts. A build's copy (dist/, out/) counts less; folders of dependencies (and Library) are not walked. When the folder is one
// above the session's, its packages (apps/, packages/..., or a folder with a package.json, Cargo.toml,
// pyproject.toml, go.mod or .git of its own) are not walked either: they are a sibling's icon.
const IMAGE = /\.(svg|png|ico|webp|jpe?g|gif)$/i
const SKIP = new Set(['node_modules', '.git', 'target', 'vendor', '.next', '.nuxt', '.svelte-kit', 'coverage', '__pycache__', 'venv', '.venv', 'env', 'Pods', 'DerivedData', '.gradle', '.idea', '.vscode', 'tmp', 'temp', 'third_party', 'third-party', '__tests__', 'test', 'tests', 'fixtures', 'examples', 'example', 'bower_components', 'site-packages', '.cache', '.turbo', '.expo', 'intermediates', 'generated', 'Library', 'archive', '_archive', 'archived', 'old', 'raw', 'drafts', 'experiments', 'experiment'])
const PACKAGES = new Set(['apps', 'packages', 'services', 'libs', 'crates', 'modules', 'projects', 'plugins', 'extensions'])
const PROJECT = ['package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', '.git', 'pubspec.yaml']
const NAMED: [RegExp, number][] = [
  [/favicon/, 60], [/apple-touch-icon/, 55], [/ic_launcher|playstore/, 50], [/app[-_ ]?icon/, 50], [/maskable/, 50],
  [/android-chrome|mstile/, 45], [/^icon\b|^icon[-_\d]/, 45], [/logo/, 40], [/mascot/, 35], [/brand|emblem/, 25], [/icon/, 20],
]
const PLACE: [RegExp, number][] = [
  [/(^|\/)appicon\.appiconset\//, 50], [/(^|\/)src-tauri\/icons\//, 45], [/(^|\/)mipmap-xxxhdpi\//, 48], [/(^|\/)mipmap-xxhdpi\//, 46], [/(^|\/)mipmap-[a-z]+\//, 40],
]
const NEAR = /(^|\/)(public|static|assets|res|resources|build|app|images|img|media|branding|brand|art|\.github|_static|www|web)\//
// Words of a name (my-logo, myLogo, my_logo.dark) that make it another brand's image, or a UI icon. A
// logo with a UI word is still a logo (acme_plus_logo).
const BRANDS = /^(github|gitlab|bitbucket|twitter|discord|slack|google|facebook|meta|microsoft|windows|npm|docker|linkedin|youtube|reddit|stripe|paypal|vercel|netlify|react|vue|angular|svelte|vite|nextjs|next|tailwind|powered|sponsor|sponsors|social)$/
const UI = /^(spinner|loading|loader|arrow|chevron|caret|close|menu|search|check|plus|minus|shield|placeholder|avatar|user|empty|error|warning|info|edit|delete|trash|add|remove|settings|home|back|left|right|up|down)$/
const wordsOf = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

const pngWidth = (f: string) => {
  try {
    const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(24); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd)
    return b.toString('latin1', 12, 16) === 'IHDR' ? b.readUInt32BE(16) : 0
  } catch { return 0 }
}

// base: how much the name and place say it is the project's icon (25 or more counts); rank: base
// less its depth, which orders those that count, so a shallow logo beats a deep favicon.
function score(dir: string, file: string, many: boolean): { base: number; rank: number } {
  const rel = path.relative(dir, file).split(path.sep).join('/').toLowerCase()
  const name = path.basename(rel).replace(/\.[^.]+$/, '')
  let s = NAMED.find(([re]) => re.test(name))?.[1] ?? 0
  s = Math.max(s, PLACE.find(([re]) => re.test(rel))?.[1] ?? 0)
  if (!s) return { base: 0, rank: 0 }
  const words = wordsOf(path.basename(file).replace(/\.[^.]+$/, ''))
  if (words.some((w) => BRANDS.test(w)) || (!/logo/.test(name) && words.some((w) => UI.test(w)))) s -= 60
  if (many && !PLACE.some(([re]) => re.test(rel))) s -= 40
  if (NEAR.test(rel)) s += 5
  // A build's copy counts only when the source has none.
  if (/(^|\/)(dist|out)\//.test(rel)) s -= 15
  if (name.includes(path.basename(dir).toLowerCase())) s += 5
  const depth = rel.split('/').length - 1
  // A launcher icon's place (mipmap-*, AppIcon.appiconset) is deep by nature.
  const placed = PLACE.some(([re]) => re.test(rel))
  let rank = -(placed ? 4 : 10) * depth
  const ext = path.extname(rel)
  s += ext === '.svg' ? 4 : ext === '.png' ? 3 : ext === '.webp' ? 2 : ext === '.ico' ? 0 : -5
  if (ext === '.png') { const w = pngWidth(file); s += w && w < 32 ? -20 : w >= 128 ? 5 : 0 }
  let size = 0
  try { size = fs.statSync(file).size } catch { /* gone */ }
  if (size < 100) return { base: 0, rank: 0 }
  return { base: s, rank: s + rank }
}

// The image a file names, from the folder the file is in, if it is inside dir.
function within(dir: string, from: string, href: string, root = from): string | null {
  if (!href || /^[a-z]+:|^\/\//i.test(href)) return null
  const clean = decodeURIComponent(href.replace(/[?#].*$/, ''))
  if (!IMAGE.test(clean)) return null
  // An absolute href is from the site's root: the file's folder, or a public/ or static/ folder next to it.
  const bases = clean.startsWith('/') ? [root, path.join(root, 'public'), path.join(root, 'static'), path.dirname(root), path.join(path.dirname(root), 'public')] : [from]
  for (const b of bases) {
    const f = path.resolve(b, clean.replace(/^\//, ''))
    if ((f + path.sep).startsWith(dir + path.sep) && isFile(f)) return f
  }
  return null
}

// What the project points to as its icon, best first.
function pointed(dir: string, files: string[]): string[] {
  const out: { f: string; rank: number }[] = []
  for (const file of files) {
    const base = path.basename(file).toLowerCase()
    const from = path.dirname(file)
    let text = ''
    try { text = fs.readFileSync(file, 'utf8').slice(0, 200_000) } catch { continue }
    if (base === 'manifest.json' || base.endsWith('.webmanifest')) {
      let m: any
      try { m = JSON.parse(text) } catch { continue }
      // A web app's icons: the largest that is not only maskable (its edges are cut off); a Chrome
      // extension's: an object of size to file.
      const list: { src: string; size: number; maskable: boolean }[] = Array.isArray(m?.icons)
        ? m.icons.filter((i: any) => typeof i?.src === 'string').map((i: any) => ({ src: i.src, size: Math.max(0, ...String(i.sizes ?? '').split(/\s+/).map((x: string) => Number(x.split('x')[0]) || 0)), maskable: /^\s*maskable\s*$/.test(String(i.purpose ?? '')) }))
        : m?.icons && typeof m.icons === 'object' ? Object.entries(m.icons).filter(([, v]) => typeof v === 'string').map(([k, v]) => ({ src: v as string, size: Number(k) || 0, maskable: false })) : []
      list.sort((a, b) => +a.maskable - +b.maskable || b.size - a.size)
      for (const i of list) { const f = within(dir, from, i.src); if (f) { out.push({ f, rank: 0 }); break } }
    } else if (base.endsWith('.html')) {
      for (const tag of text.slice(0, 20000).match(/<link\b[^>]*>/gi) ?? []) {
        if (!/rel=["'][^"']*\bicon\b/i.test(tag)) continue
        const f = within(dir, from, /href=["']([^"']+)/i.exec(tag)?.[1] ?? '')
        if (f) { out.push({ f, rank: 1 }); break }
      }
    } else if (base === 'package.json') {
      try {
        const pkg = JSON.parse(text)
        for (const rel of [pkg.icon, pkg.build?.icon]) { const f = typeof rel === 'string' ? within(dir, from, rel.replace(/^\//, '')) : null; if (f) { out.push({ f, rank: 2 }); break } }
      } catch { /* not JSON */ }
    } else if (/^readme/.test(base)) {
      // An image near the top whose file or alt text says it is a logo or an icon.
      const head = text.slice(0, 3000)
      for (const m of head.matchAll(/<img\b[^>]*>|!\[([^\]]*)\]\(([^)\s]+)/gi)) {
        const src = m[2] ?? /src=["']([^"']+)/i.exec(m[0])?.[1] ?? ''
        const alt = m[1] ?? /alt=["']([^"']*)/i.exec(m[0])?.[1] ?? ''
        if (!/logo|icon|mascot/i.test(src + ' ' + alt)) continue
        const f = within(dir, from, src.replace(/^\//, ''))
        if (f) { out.push({ f, rank: 3 }); break }
      }
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map((x) => x.f)
}

// quick: for a long list of folders (the folder picker), a shorter walk: 3 levels, 400 entries.
function findIn(dir: string, from?: string, quick = false): string | null {
  // A folder in no repository (a home folder) is looked at only near its top.
  const deep = quick ? 3 : 6
  const images: { file: string; many: boolean }[] = []
  const pointers: string[] = []
  let left = quick ? 400 : 5000
  const walk = (d: string, depth: number) => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    left -= entries.length
    const imgs = entries.filter((e) => e.isFile() && IMAGE.test(e.name))
    const many = imgs.length > 15
    for (const e of imgs) images.push({ file: path.join(d, e.name), many })
    for (const e of entries) {
      if (!e.isFile()) continue
      const n = e.name.toLowerCase()
      if (((n === 'manifest.json' || n.endsWith('.webmanifest') || n.endsWith('.html')) && depth <= 2) || (depth === 0 && (n === 'package.json' || /^readme(\.(md|markdown|rst|txt))?$/.test(n)))) pointers.push(path.join(d, e.name))
    }
    if (depth >= deep) return
    for (const e of entries) {
      if (left <= 0) return
      if (!e.isDirectory() || SKIP.has(e.name) || /-output$/.test(e.name) || (e.name.startsWith('.') && e.name !== '.github')) continue
      const sub = path.join(d, e.name)
      if (!readable(sub)) continue
      // Above the session's folder: not the folder already looked in, nor a sibling package.
      // A repository inside this one is another project, and so are a monorepo's packages.
      if (fs.existsSync(path.join(sub, '.git')) || (depth === 0 && PACKAGES.has(e.name))) continue
      if (from && (sub === from || PROJECT.some((p) => fs.existsSync(path.join(sub, p))))) continue
      walk(sub, depth + 1)
    }
  }
  walk(dir, 0)
  const hit = pointed(dir, pointers).find((f) => !isDefault(f))
  if (hit) return hit
  const ranked = images.map(({ file, many }) => ({ file, ...score(dir, file, many) })).filter((x) => x.base >= 25).sort((a, b) => b.rank - a.rank)
  return ranked.find((x) => !isDefault(x.file))?.file ?? null
}

// Kept a minute, so the sidebar's asks don't walk the disk each time, and a logo added later shows soon.
const KEEP = 60_000
const found = new Map<string, { v: any; at: number }>()
function kept<T>(key: string, get: () => T): T {
  const hit = found.get(key)
  if (hit && Date.now() - hit.at < KEEP) return hit.v
  const v = get()
  found.set(key, { v, at: Date.now() })
  return v
}
// The folder picker's shorter walk gives the sidebar's answer when that is known, so the two agree.
function foundIn(dir: string, from?: string, quick = false): string | null {
  const key = (q: boolean) => `found\n${dir}\n${from ?? ''}\n${q ? 'q' : ''}`
  const full = found.get(key(false))
  if (quick && full && Date.now() - full.at < KEEP) return full.v
  return kept(key(quick), () => findIn(dir, from, quick))
}
const projectAt = (dir: string) => kept(`project\n${dir}`, () => isProject(dir))
const projectsAt = (dir: string) => kept(`projects\n${dir}`, () => projectsIn(dir))
// Whose emoji a folder wears: its repository's (a project), or its own (a folder of projects). A
// repository of dotfiles in the home folder is not the repository of the projects under it.
export function emojiKey(cwd: string): string {
  if (!projectAt(cwd)) return cwd
  const r = rootOf(cwd)
  return isHome(r) ? cwd : r
}

// What a folder's sessions wear: an image (url), an emoji, or nothing (the critter).
export type ProjectIcon = { url: string } | { emoji: string } | null
type Got = { set: string } | { file: string } | { emoji: string } | null

// The nearest folder from cwd up to the repository's root with an icon set by hand or one of its
// own, so the packages of a monorepo can each have theirs; above the root, only one set by hand.
// Else the emoji Claude picked for the repository (projectEmoji), or none yet.
function resolve(icons: Record<string, string> | undefined, emoji: Record<string, string> | undefined, cwd: string, quick = false): Got {
  // In a folder macOS guards (server/guarded.ts), until Codinger may read there: only an icon set by hand.
  if (!readable(cwd)) return icons?.[cwd] && icons[cwd] !== 'none' ? { set: icons[cwd] } : null
  const project = projectAt(cwd)
  const root = emojiKey(cwd)
  // Not a project (the home folder, a folder of projects): no walk through it.
  let inside = project
  let prev = cwd
  for (let d = cwd; ; d = path.dirname(d)) {
    if (icons?.[d]) return icons[d] === 'none' ? null : { set: icons[d] }
    if (inside) { const f = foundIn(d, d === cwd ? undefined : prev, quick); if (f) return { file: f } }
    // A folder with just one project in it wears that project's icon or emoji, if it has one.
    if (d === cwd && !project) { const kids = projectsAt(cwd); if (kids.length === 1) { const g = resolve(icons, emoji, kids[0], quick); if (g) return g } }
    prev = d
    if (d === root) inside = false
    if (path.dirname(d) === d) break
  }
  return emoji?.[root] ? { emoji: emoji[root] } : null
}

export const iconFile = (icons: Record<string, string> | undefined, cwd: string, quick = false) => { const g = resolve(icons, undefined, cwd, quick); return g && 'file' in g ? g.file : null }

// What the sidebar shows for a folder. With nothing at all, Claude picks an emoji for the
// repository once (learn saves it in Settings.projectEmoji), and the critter shows until then.
// With no learn (the folder picker, quick), only what is known already: no new emoji is asked for.
export function iconOf(icons: Record<string, string> | undefined, emoji: Record<string, string> | undefined, cwd: string, learn?: (root: string, emoji: string) => void, quick = false): ProjectIcon {
  const g = resolve(icons, emoji, cwd, quick)
  if (!g) {
    if (learn && !icons?.[cwd] && readable(cwd)) void pickEmoji(emojiKey(cwd), learn)
    return null
  }
  if ('emoji' in g) return g
  if ('set' in g) return g.set.startsWith('/api/') ? { url: g.set } : { emoji: g.set }
  let v = 0
  try { v = Math.round(fs.statSync(g.file).mtimeMs) } catch { /* gone */ }
  // The url names the file, so a better icon found later is a new url, not the browser's old copy.
  return { url: `/api/project-icon?cwd=${encodeURIComponent(cwd)}${quick ? '&quick=1' : ''}&v=${v}-${crypto.createHash('md5').update(g.file).digest('hex').slice(0, 8)}` }
}

// Once for each repository while the server runs, even if Claude gives no emoji.
const asked = new Set<string>()
async function pickEmoji(root: string, learn: (root: string, emoji: string) => void) {
  if (asked.has(root) || !fs.existsSync(root)) return
  asked.add(root)
  const read = (f: string, n: number) => { try { return fs.readFileSync(path.join(root, f), 'utf8').slice(0, n) } catch { return '' } }
  let pkg = ''
  try { const j = JSON.parse(read('package.json', 20000)); pkg = [j.name, j.description, ...(j.keywords ?? [])].filter(Boolean).join(' · ') } catch { /* none */ }
  const readme = ['README.md', 'README', 'readme.md', 'README.txt'].map((f) => read(f, 1500)).find(Boolean) ?? ''
  // A folder of projects: what is in it says more than its name.
  let kids = ''
  if (!projectAt(root)) { try { kids = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).slice(0, 40).join(', ') } catch { /* unreadable */ } }
  const answer = await describe([
    `Folder: ${path.basename(root)}${isHome(root) ? ' (a home folder)' : ''}`,
    kids && `A folder of projects and other folders: ${kids}`,
    pkg && `package.json: ${pkg}`,
    readme && `README (start):\n${readme}`,
  ].filter(Boolean).join('\n\n'), 'Pick one emoji to be the icon of this software project in a list of projects. Reply with the emoji only.')
  const e = firstEmoji(answer ?? '')
  if (e) learn(root, e)
}

// The first emoji in a text, as one grapheme (flags, skin tones and joined emoji stay whole).
export function firstEmoji(text: string): string | null {
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segment)) return segment
  }
  return null
}

export const iconType = (file: string) => ({ svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' })[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream'
