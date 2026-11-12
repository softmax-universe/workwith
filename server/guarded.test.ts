// The folders macOS guards (server/guarded.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { guardOf, readable } from './guarded.ts'

const home = os.homedir()
const mac = process.platform === 'darwin'

test('guardOf names the folder macOS guards', { skip: !mac }, () => {
  assert.equal(guardOf(path.join(home, 'Desktop')), path.join(home, 'Desktop'))
  assert.equal(guardOf(path.join(home, 'Documents/notes/a.md')), path.join(home, 'Documents'))
  assert.equal(guardOf(path.join(home, 'Library/Mobile Documents/x')), path.join(home, 'Library/Mobile Documents'))
  assert.equal(guardOf('/Volumes/Backup/x'), '/Volumes/Backup')
  assert.equal(guardOf(path.join(home, 'Library/Photos/Libraries')), path.join(home, 'Library/Photos'))
  assert.equal(guardOf(path.join(home, 'Pictures/Photos Library.photoslibrary')), path.join(home, 'Pictures'))
  assert.equal(guardOf(path.join(home, 'Movies/TV/Media')), path.join(home, 'Movies'))
  assert.equal(guardOf(path.join(home, 'Movies')), path.join(home, 'Movies'))
  assert.equal(guardOf(path.join(home, 'Music')), path.join(home, 'Music'))
  assert.equal(guardOf(path.join(home, '.Trash/x')), path.join(home, '.Trash'))
  assert.equal(guardOf(path.join(home, 'Library/Containers/com.apple.mail/Data')), path.join(home, 'Library/Containers/com.apple.mail'))
  assert.equal(guardOf(path.join(home, 'Library/Group Containers/group.x/y')), path.join(home, 'Library/Group Containers/group.x'))
  assert.equal(guardOf(path.join(home, 'Library')), null)
  assert.equal(guardOf(path.join(home, 'DesktopApps')), null)
  assert.equal(guardOf(path.join(home, 'dev/app')), null)
  assert.equal(guardOf(home), null)
})

test('a folder outside them is readable at once', () => {
  assert.equal(readable(path.join(home, 'dev/app')), true)
})
