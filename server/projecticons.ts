// A project's icon for the sidebar (web/src/components/ProjectIcon.tsx). From the session's folder up
// to its repository's root, the nearest folder with an icon set by hand (Settings.projectIcons: an
// image or an emoji) or an app icon or favicon of its own; else an emoji Claude picked for the
// repository from its name and README (Settings.projectEmoji); else the critter, until it has one.

import fs from 'node:fs'
import path from 'node:path'
import { describe } from './describe.ts'

// Where projects keep their icon, most telling first: a favicon, a web app's public files, a
// framework's app folder, an Electron or mobile app's icon, then a logo. No folder named after a
// package (web/, site/): in a monorepo that is a sibling's icon, which it finds for itself.
const PLACES = ['', 'public/', 'static/', 'app/', 'src/app/', 'src/', 'assets/', 'resources/', 'build/', 'images/', 'img/']
const NAMES = ['favicon.svg', 'favicon.png', 'favicon.ico', 'icon.svg', 'icon.png', 'apple-touch-icon.png', 'app-icon.png', 'logo.svg', 'logo.png']
// A page's own <link rel="icon">, for a favicon with another name.
const PAGES = ['index.html', 'public/index.html', 'src/index.html']
const IMAGE = /\.(svg|png|ico|jpe?g|webp|gif)$/i

// The repository's root: the nearest folder up with .git, or the folder itself.
function rootOf(dir: string): string {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d
    if (path.dirname(d) === d) return dir
  }
}

const isFile = (f: string) => { try { return fs.statSync(f).isFile() } catch { return false } }

function linkedIcon(dir: string): string | null {
  for (const page of PAGES) {
    let html: string
    try { html = fs.readFileSync(path.join(dir, page), 'utf8').slice(0, 20000) } catch { continue }
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
      if (!/rel=["'][^"']*\bicon\b/i.test(tag)) continue
      const href = /href=["']([^"'?#]+)/i.exec(tag)?.[1]
      if (!href || /^[a-z]+:/i.test(href) || !IMAGE.test(href)) continue
      // An absolute href is from the site's root: the page's folder, or its public/ folder.
      const rel = href.replace(/^\.?\//, '')
      for (const base of href.startsWith('/') ? [path.dirname(path.join(dir, page)), path.join(dir, 'public')] : [path.dirname(path.join(dir, page))]) {
        const f = path.join(base, rel)
        if (f.startsWith(dir + path.sep) && isFile(f)) return f
      }
    }
  }
  return null
}

// package.json's "icon", or electron-builder's build.icon.
function packageIcon(dir: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    for (const rel of [pkg.icon, pkg.build?.icon]) {
      if (typeof rel !== 'string' || !IMAGE.test(rel)) continue
      const f = path.resolve(dir, rel)
      if (f.startsWith(dir + path.sep) && isFile(f)) return f
    }
  } catch { /* none */ }
  return null
}

// A logo the repository names after itself (workwith-logo.png), in its root or assets/.
function namedLogo(dir: string): string | null {
  for (const sub of ['', 'assets/', 'public/']) {
    let names: string[]
    try { names = fs.readdirSync(path.join(dir, sub)) } catch { continue }
    const hit = names.filter((n) => IMAGE.test(n) && /(^|[-_.])(logo|icon)([-_.]|$)/i.test(n) && !/\d{2,}/.test(n)).sort()[0]
      ?? names.filter((n) => IMAGE.test(n) && /(^|[-_.])(logo|icon)([-_.]|$)/i.test(n)).sort()[0]
    if (hit) return path.join(dir, sub, hit)
  }
  return null
}

function findIn(dir: string): string | null {
  for (const place of PLACES) for (const name of NAMES) {
    const f = path.join(dir, place, name)
    if (isFile(f)) return f
  }
  return linkedIcon(dir) ?? packageIcon(dir) ?? namedLogo(dir)
}

// Kept a minute, so the sidebar's asks don't search the disk each time.
const found = new Map<string, { file: string | null; at: number }>()
function foundIn(dir: string): string | null {
  const hit = found.get(dir)
  if (hit && Date.now() - hit.at < 60_000) return hit.file
  const file = findIn(dir)
  found.set(dir, { file, at: Date.now() })
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
  for (let d = cwd; ; d = path.dirname(d)) {
    if (icons?.[d]) return icons[d] === 'none' ? null : { set: icons[d] }
    if (inside) { const f = foundIn(d); if (f) return { file: f } }
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
  const answer = await describe([
    `Folder: ${path.basename(root)}`,
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
