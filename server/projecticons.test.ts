// The icon found for a folder (server/projecticons.ts), for the common kinds of project.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const top = fs.mkdtempSync(path.join(os.tmpdir(), 'projecticons-'))
// The emoji call loads the server's store, which must not take a live desk's data folder.
process.env.CODINGER_HOME = path.join(top, '.data')
const { iconFile } = await import('./projecticons.ts')
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
