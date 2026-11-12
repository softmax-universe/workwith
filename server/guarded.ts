// Folders macOS guards: before a program reads the Desktop, Documents, Downloads, iCloud Drive, a
// cloud drive, another volume or some apps' data in ~/Library (Photos), macOS asks the person at
// the screen, and the read waits for the answer. A sync read on the server's thread then stops the
// whole server, for good on a Mac with no screen. So Codinger reads in one only once a child
// process (ls, with a time limit) has shown that it can: the child waits for the dialog, not the server.
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'

const HOME = os.homedir()
// Guarded whole, or (EACH) each folder in it on its own: ~/Library holds other apps' data (Library/
// Photos), some of which macOS asks about, and ls of one says nothing of the next. The media
// folders are guarded whole: a recent macOS asks before even listing ~/Movies or ~/Music. So is the Trash.
const WHOLE = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Movies', 'Music', '.Trash', 'Library/Mobile Documents', 'Library/CloudStorage'].map((d) => path.join(HOME, d))
// Most specific first: each app's container in Library/Containers is guarded on its own.
const EACH = [...['Library/Containers', 'Library/Group Containers', 'Library'].map((d) => path.join(HOME, d)), '/Volumes']

// The guarded folder p is in (or is), or null.
export function guardOf(p: string): string | null {
  if (process.platform !== 'darwin') return null
  const abs = path.resolve(p)
  const root = WHOLE.find((r) => abs === r || abs.startsWith(r + path.sep))
  if (root) return root
  const top = EACH.find((r) => abs.startsWith(r + path.sep))
  if (!top) return null
  const one = path.join(top, abs.slice(top.length + 1).split(path.sep)[0])
  // /Volumes/Macintosh HD: the link to the startup disk.
  if (top === '/Volumes') { try { if (fs.lstatSync(one).isSymbolicLink()) return null } catch { /* gone: guarded */ } }
  return one
}

// For each guarded folder: true once read, false for ten minutes after a read that failed or
// waited past the limit, a promise while one is being tried.
const known = new Map<string, boolean | Promise<boolean>>()
const tried = new Map<string, number>()

function probe(root: string): Promise<boolean> {
  const had = known.get(root)
  if (had === true || had instanceof Promise) return Promise.resolve(had)
  if (had === false && Date.now() - (tried.get(root) ?? 0) < 600_000) return Promise.resolve(false)
  tried.set(root, Date.now())
  const p = new Promise<boolean>((ok) => {
    execFile('/bin/ls', [root], { timeout: 3000 }, (err) => ok(!err))
  }).then((ok) => { known.set(root, ok); return ok })
  known.set(root, p)
  return p
}

// Whether p can be read now without waiting: not in a guarded folder, or in one already read.
// Else false, and a try starts, so a later ask can say yes.
export function readable(p: string): boolean {
  const root = guardOf(p)
  if (!root) return true
  if (known.get(root) === true) return true
  void probe(root)
  return false
}

// Whether p can be read, trying its guarded folder first if it has not been.
export async function canRead(p: string): Promise<boolean> {
  const root = guardOf(p)
  return !root || probe(root)
}

export const guardedMessage = (p: string) =>
  `macOS hasn't let Codinger read ${guardOf(p) ?? p}. Allow it on the Mac, in System Settings › Privacy & Security › Files & Folders (or Full Disk Access).`
