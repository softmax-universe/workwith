// A project's icon for the sidebar (web/src/components/ProjectIcon.tsx). From the session's folder up
// to its repository's root, the nearest folder with an icon set by hand (Settings.projectIcons: an
// image or an emoji) or an icon of its own (findIn: a favicon, an app icon, a logo); else an emoji Claude picked for the
// repository from its name and README (Settings.projectEmoji); else the critter, until it has one.

import fs from 'node:fs'
import path from 'node:path'
import { oneShot } from './oneshot.ts'

// The repository's root: the nearest folder up with .git, or the folder itself.
function rootOf(dir: string): string {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d
    if (path.dirname(d) === d) return dir
  }
}

const isFile = (f: string) => { try { return fs.statSync(f).isFile() } catch { return false } }

// A folder's own icon, found by a short walk through it (at most 6 levels and 5000 entries), each image
// scored by its name and place. An image that the project points to wins: an icon in a web app
// manifest (manifest.json, *.webmanifest; a Chrome extension's too), a page's <link rel="icon">, the
// "icon" of package.json (a VS Code extension, electron-builder), or a logo at the top of the README.
// Else the best name: favicon, apple-touch-icon, maskable, an Android launcher icon (mipmap-*/
// ic_launcher), an iOS AppIcon.appiconset, Tauri's src-tauri/icons, icon, logo, mascot; in a
// public/, static/, assets/ or res/ folder a little more, deeper a little less. Images of other
// brands and of the UI (github.svg, arrow.svg, a folder of many icons) count less, and none below a
// score of 25 counts. A build's copy (dist/, out/) counts less; folders of dependencies are not walked. When the folder is one
// above the session's, its packages (apps/, packages/..., or a folder with a package.json, Cargo.toml,
// pyproject.toml, go.mod or .git of its own) are not walked either: they are a sibling's icon.
const IMAGE = /\.(svg|png|ico|webp|jpe?g|gif)$/i
const SKIP = new Set(['node_modules', '.git', 'target', 'vendor', '.next', '.nuxt', '.svelte-kit', 'coverage', '__pycache__', 'venv', '.venv', 'env', 'Pods', 'DerivedData', '.gradle', '.idea', '.vscode', 'tmp', 'temp', 'third_party', 'third-party', '__tests__', 'test', 'tests', 'fixtures', 'examples', 'example', 'bower_components', 'site-packages', '.cache', '.turbo', '.expo', 'intermediates', 'generated'])
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

type Found = { file: string; score: number }

const pngWidth = (f: string) => {
  try {
    const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(24); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd)
    return b.toString('latin1', 12, 16) === 'IHDR' ? b.readUInt32BE(16) : 0
  } catch { return 0 }
}

function score(dir: string, file: string, many: boolean): number {
  const rel = path.relative(dir, file).split(path.sep).join('/').toLowerCase()
  const name = path.basename(rel).replace(/\.[^.]+$/, '')
  let s = NAMED.find(([re]) => re.test(name))?.[1] ?? 0
  s = Math.max(s, PLACE.find(([re]) => re.test(rel))?.[1] ?? 0)
  if (!s) return 0
  const words = wordsOf(path.basename(file).replace(/\.[^.]+$/, ''))
  if (words.some((w) => BRANDS.test(w)) || (!/logo/.test(name) && words.some((w) => UI.test(w)))) s -= 60
  if (many && !PLACE.some(([re]) => re.test(rel))) s -= 40
  if (NEAR.test(rel)) s += 5
  // A build's copy counts only when the source has none.
  if (/(^|\/)(dist|out)\//.test(rel)) s -= 15
  if (name.includes(path.basename(dir).toLowerCase())) s += 5
  s -= 4 * (rel.split('/').length - 1)
  const ext = path.extname(rel)
  s += ext === '.svg' ? 4 : ext === '.png' ? 3 : ext === '.webp' ? 2 : ext === '.ico' ? 0 : -5
  if (ext === '.png') { const w = pngWidth(file); s += w && w < 32 ? -20 : w >= 128 ? 5 : 0 }
  let size = 0
  try { size = fs.statSync(file).size } catch { /* gone */ }
  return size < 100 ? 0 : s
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

function findIn(dir: string, from?: string): string | null {
  // A folder in no repository (a home folder) is looked at only near its top.
  const deep = fs.existsSync(path.join(rootOf(dir), '.git')) ? 6 : 2
  const images: { file: string; many: boolean }[] = []
  const pointers: string[] = []
  let left = 5000
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
      if (n === 'manifest.json' || n.endsWith('.webmanifest') || (n.endsWith('.html') && depth <= 3) || (depth === 0 && (n === 'package.json' || /^readme(\.(md|markdown|rst|txt))?$/.test(n)))) pointers.push(path.join(d, e.name))
    }
    if (depth >= deep) return
    for (const e of entries) {
      if (left <= 0) return
      if (!e.isDirectory() || SKIP.has(e.name) || (e.name.startsWith('.') && e.name !== '.github')) continue
      const sub = path.join(d, e.name)
      // Above the session's folder: not the folder already looked in, nor a sibling package.
      if (from && (sub === from || (depth === 0 && PACKAGES.has(e.name)) || PROJECT.some((p) => fs.existsSync(path.join(sub, p))))) continue
      walk(sub, depth + 1)
    }
  }
  walk(dir, 0)
  const hit = pointed(dir, pointers)[0]
  if (hit) return hit
  const best = images.map(({ file, many }) => ({ file, score: score(dir, file, many) }) as Found).sort((a, b) => b.score - a.score)[0]
  return best && best.score >= 25 ? best.file : null
}

// Kept ten minutes, so the sidebar's asks don't walk the disk each time.
const found = new Map<string, { file: string | null; at: number }>()
function foundIn(dir: string, from?: string): string | null {
  const key = `${dir}\n${from ?? ''}`
  const hit = found.get(key)
  if (hit && Date.now() - hit.at < 600_000) return hit.file
  const file = findIn(dir, from)
  found.set(key, { file, at: Date.now() })
  return file
}

// What a folder's sessions wear: an image (url), an emoji, or nothing (the critter).
export type ProjectIcon = { url: string } | { emoji: string } | null
type Got = { set: string } | { file: string } | { emoji: string } | null

// The nearest folder from cwd up to the repository's root with an icon set by hand or one of its
// own, so the packages of a monorepo can each have theirs; above the root, only one set by hand.
// Else the emoji Claude picked for the repository (projectEmoji), or none yet.
function resolve(icons: Record<string, string> | undefined, emoji: Record<string, string> | undefined, cwd: string): Got {
  const root = rootOf(cwd)
  let inside = true
  let prev = cwd
  for (let d = cwd; ; d = path.dirname(d)) {
    if (icons?.[d]) return icons[d] === 'none' ? null : { set: icons[d] }
    if (inside) { const f = foundIn(d, d === cwd ? undefined : prev); if (f) return { file: f } }
    prev = d
    if (d === root) inside = false
    if (path.dirname(d) === d) break
  }
  return emoji?.[root] ? { emoji: emoji[root] } : null
}

export const iconFile = (icons: Record<string, string> | undefined, cwd: string) => { const g = resolve(icons, undefined, cwd); return g && 'file' in g ? g.file : null }

// What the sidebar shows for a folder. With nothing at all, Claude picks an emoji for the
// repository once (learn saves it in Settings.projectEmoji), and the critter shows until then.
export function iconOf(icons: Record<string, string> | undefined, emoji: Record<string, string> | undefined, cwd: string, learn: (root: string, emoji: string) => void): ProjectIcon {
  const g = resolve(icons, emoji, cwd)
  if (!g) {
    if (!icons?.[cwd]) void pickEmoji(rootOf(cwd), learn)
    return null
  }
  if ('emoji' in g) return g
  if ('set' in g) return g.set.startsWith('/api/') ? { url: g.set } : { emoji: g.set }
  let v = 0
  try { v = Math.round(fs.statSync(g.file).mtimeMs) } catch { /* gone */ }
  return { url: `/api/project-icon?cwd=${encodeURIComponent(cwd)}&v=${v}` }
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
  const answer = await oneShot([
    'Pick one emoji to be the icon of this software project in a list of projects. Reply with the emoji only.',
    `Folder: ${path.basename(root)}`,
    pkg && `package.json: ${pkg}`,
    readme && `README (start):\n${readme}`,
  ].filter(Boolean).join('\n\n'))
  const e = firstEmoji(answer)
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
