// The icon found for a folder (server/projecticons.ts), for the common kinds of project.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const top = fs.mkdtempSync(path.join(os.tmpdir(), 'projecticons-'))
// The emoji call loads the server's store, which must not take a live desk's data folder.
process.env.CODINGER_HOME = path.join(top, '.data')
const { iconFile, iconOf } = await import('./projecticons.ts')
// A PNG of the given width (its header only, and enough bytes to count as an image).
const png = (w: number) => {
  const b = Buffer.alloc(200)
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(b)
  b.writeUInt32BE(w, 16); b.writeUInt32BE(w, 20)
  return b
}
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#36c"/></svg>'.padEnd(120, ' ')

// A repository with these files (a string is the text; a number, a PNG that wide).
function repo(name: string, files: Record<string, string | number>): string {
  const dir = path.join(top, name)
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  for (const [f, v] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
    fs.writeFileSync(path.join(dir, f), typeof v === 'number' ? png(v) : v)
  }
  return dir
}
const found = (dir: string, cwd = dir) => { const f = iconFile(undefined, cwd); return f && path.relative(dir, f).split(path.sep).join('/') }

test('a web app: the icon its manifest names, the largest that is not only maskable', () => {
  const d = repo('pwa', {
    'public/manifest.webmanifest': JSON.stringify({ icons: [{ src: '/icons/icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' }, { src: '/icons/pwa-192.png', sizes: '192x192' }, { src: '/icons/pwa-512.png', sizes: '512x512' }] }),
    'public/icons/icon-maskable-512.png': 512, 'public/icons/pwa-192.png': 192, 'public/icons/pwa-512.png': 512,
    'src/assets/github.svg': svg,
  })
  assert.equal(found(d), 'public/icons/pwa-512.png')
})

test("a build's icon, when the source has none; the source's first", () => {
  assert.equal(found(repo('built', { 'web/dist/icon-192.png': 192 })), 'web/dist/icon-192.png')
  assert.equal(found(repo('built2', { 'web/dist/icon-192.png': 192, 'web/src/icon.svg': svg })), 'web/src/icon.svg')
})

test('a maskable icon by name, when nothing points to an icon', () => {
  const d = repo('maskable', { 'static/img/maskable-icon-512.png': 512, 'static/img/arrow.svg': svg })
  assert.equal(found(d), 'static/img/maskable-icon-512.png')
})

test("a page's <link rel=icon>", () => {
  const d = repo('vite', { 'index.html': '<link rel="icon" type="image/svg+xml" href="/brand-mark.svg">', 'public/brand-mark.svg': svg, 'public/vite.svg': svg })
  assert.equal(found(d), 'public/brand-mark.svg')
})

test('Next.js: app/icon.png', () => {
  const d = repo('next', { 'src/app/icon.png': 256, 'public/next.svg': svg, 'public/vercel.svg': svg })
  assert.equal(found(d), 'src/app/icon.png')
})

test('Android: the launcher icon of the densest screens', () => {
  const d = repo('android', { 'app/src/main/res/mipmap-hdpi/ic_launcher.png': 72, 'app/src/main/res/mipmap-xxxhdpi/ic_launcher.png': 192, 'app/src/main/res/drawable/ic_menu_close.png': 48 })
  assert.equal(found(d), 'app/src/main/res/mipmap-xxxhdpi/ic_launcher.png')
})

test('iOS: an image of AppIcon.appiconset', () => {
  const d = repo('ios', { 'MyApp/Assets.xcassets/AppIcon.appiconset/1024.png': 1024, 'MyApp/Assets.xcassets/Back.imageset/back.png': 64 })
  assert.equal(found(d), 'MyApp/Assets.xcassets/AppIcon.appiconset/1024.png')
})

test('Tauri: src-tauri/icons, though src-tauri is a Rust project of its own', () => {
  const d = repo('tauri', { 'src-tauri/Cargo.toml': '[package]', 'src-tauri/icons/128x128.png': 128, 'src/assets/react.svg': svg })
  assert.equal(found(d), 'src-tauri/icons/128x128.png')
})

test("a VS Code extension: package.json's icon", () => {
  const d = repo('vscode', { 'package.json': JSON.stringify({ name: 'ext', icon: 'media/marketplace.png' }), 'media/marketplace.png': 128 })
  assert.equal(found(d), 'media/marketplace.png')
})

test('a library: the logo at the top of its README', () => {
  const d = repo('lib', { 'README.md': '<p align="center"><img src="docs/art/wordmark.svg" alt="Lib logo"></p>\n\n# Lib', 'docs/art/wordmark.svg': svg, 'docs/art/diagram.png': 800 })
  assert.equal(found(d), 'docs/art/wordmark.svg')
})

test('a logo or a mascot by name; images of other brands and of the UI do not count', () => {
  assert.equal(found(repo('mascot', { 'images/MyMascot.png': 256, 'images/twitter-logo.png': 256 })), 'images/MyMascot.png')
  assert.equal(found(repo('plus', { 'theme/img/acme_plus_logo_black.svg': svg, 'theme/img/close-icon.svg': svg })), 'theme/img/acme_plus_logo_black.svg')
  assert.equal(found(repo('ui', { 'src/icons/github-icon.svg': svg, 'src/icons/search-icon.svg': svg, 'src/img/arrow.png': 64 })), null)
})

test('a monorepo: each package its own icon, and not a sibling package\'s', () => {
  const d = repo('mono', {
    'apps/web/package.json': '{}', 'apps/web/public/favicon.svg': svg,
    'apps/api/package.json': '{}', 'apps/api/src/index.ts': '',
    'apps/admin/src/index.ts': '',
  })
  assert.equal(found(d, path.join(d, 'apps/web')), 'apps/web/public/favicon.svg')
  assert.equal(found(d, path.join(d, 'apps/api')), null)
  assert.equal(found(d, path.join(d, 'apps/admin')), null)
  // A logo at the root is for every package that has none.
  const e = repo('mono-logo', { 'logo.svg': svg, 'apps/web/package.json': '{}', 'apps/web/public/favicon.svg': svg, 'apps/tools/src/index.ts': '' })
  assert.equal(found(e, path.join(e, 'apps/tools/src')), 'logo.svg')
  assert.equal(found(e, path.join(e, 'apps/web')), 'apps/web/public/favicon.svg')
})

test('the folder picker (quick): a shorter walk, an emoji only if one is known, and never a new one', () => {
  const d = repo('quick', { 'public/favicon.svg': svg, 'deep/a/b/c/d/logo.svg': svg })
  const e = repo('quick-empty', { 'README.md': '# Quick' })
  assert.match((iconOf(undefined, undefined, d, undefined, true) as { url: string }).url, /quick=1/)
  assert.deepEqual(iconOf(undefined, { [e]: '🍞' }, e, undefined, true), { emoji: '🍞' })
  // No learn: nothing to save an emoji to, so none is asked for.
  assert.equal(iconOf(undefined, undefined, e, undefined, true), null)
  const f = repo('quick-deep', { 'a/b/c/d/logo.svg': svg })
  assert.equal(iconFile(undefined, f, true), null)
  assert.equal(found(f), 'a/b/c/d/logo.svg')
})

// Folders of plain files, in no repository (a folder of projects, a home folder).
function folder(name: string, files: Record<string, string | number>): string {
  const dir = path.join(top, name)
  for (const [f, v] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
    fs.writeFileSync(path.join(dir, f), typeof v === 'number' ? png(v) : v)
  }
  return dir
}

test("a folder of projects is not walked: no project's icon, though one is a Chrome extension", () => {
  const d = folder('code', {
    'surfer/.git/HEAD': '', 'surfer/manifest.json': JSON.stringify({ icons: { 128: 'icons/icon128.png' } }), 'surfer/icons/icon128.png': 128,
    'globe/.git/HEAD': '', 'globe/dist/manifest.webmanifest': JSON.stringify({ icons: [{ src: 'icon-512.png', sizes: '512x512' }] }), 'globe/dist/icon-512.png': 512,
    'logo.png': 256,
  })
  assert.equal(found(d), null)
  assert.equal(iconFile(undefined, d, true), null)
  assert.deepEqual(iconOf(undefined, { [d]: '🗂️' }, d), { emoji: '🗂️' })
  // Each project still has its own.
  assert.equal(found(path.join(d, 'surfer')), 'icons/icon128.png')
})

test('a folder with just one project in it wears that project\'s icon', () => {
  const d = folder('wrapper', { 'notes/todo.txt': 'x', 'app/.git/HEAD': '', 'app/public/favicon.svg': svg })
  assert.equal(found(d), 'app/public/favicon.svg')
  // Two levels down counts too, and a second project makes it a folder of projects.
  const e = folder('wrapper2', { 'work/app/package.json': '{}', 'work/app/logo.svg': svg })
  assert.equal(found(e), 'work/app/logo.svg')
  fs.mkdirSync(path.join(e, 'other/.git'), { recursive: true })
  assert.equal(iconFile(undefined, path.join(e, 'work'), false), path.join(e, 'work/app/logo.svg'))
})

test("a project does not take a repository's icon from inside it, nor a monorepo package's", () => {
  assert.equal(found(repo('host', { 'vendor-ish/sub/.git/HEAD': '', 'vendor-ish/sub/favicon.ico': 'x'.repeat(200) })), null)
  assert.equal(found(repo('mono-root', { 'packages/web/games/cards/public/favicon.png': 128, 'package.json': '{}' })), null)
})

test('a shallow logo beats a deep favicon; a deep icon still counts when it is the only one (cubi)', () => {
  assert.equal(found(repo('depth', { 'assets/logo.png': 256, 'src/ui/pages/admin/static/favicon.png': 128 })), 'assets/logo.png')
  assert.equal(found(repo('cubi', { 'cmd/admind-devserver/static/icon-512.png': 512, 'cmd/admind-devserver/main.go': '' })), 'cmd/admind-devserver/static/icon-512.png')
})

test("archives, experiments, raw art and a scaffold's untouched favicon do not count", () => {
  assert.equal(found(repo('archived', { '_archive/old-ext/icon128.png': 128, 'experiments/launcher/icon-512.png': 512, 'art/raw/x/logo.png': 256, 'art/gen-output/logo2.png': 256 })), null)
  const next = fs.readFileSync(path.join(import.meta.dirname, 'fixtures-next-favicon.ico'))
  const d = repo('next-default', { 'app/page.tsx': '' })
  fs.writeFileSync(path.join(d, 'app/favicon.ico'), next)
  assert.equal(found(d), null)
  const e = repo('next-mine', { 'app/page.tsx': '' })
  fs.writeFileSync(path.join(e, 'app/favicon.ico'), Buffer.concat([next, Buffer.from('mine')]))
  assert.equal(found(e), 'app/favicon.ico')
})

test('a logo added later is worn once the minute it is kept for has passed, under a new url', async (t) => {
  const d = repo('later', { 'README.md': '# Later' })
  assert.equal(found(d), null)
  fs.writeFileSync(path.join(d, 'logo.svg'), svg)
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 61_000 })
  assert.equal(found(d), 'logo.svg')
  t.mock.timers.reset()
})
