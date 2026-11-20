// npm test. The improvement loop's pure parts (server/loop.ts): triage answers, owners, diff size.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// loop.ts reads the data folder (server/store.ts) when it loads: a temporary one.
process.env.CODINGER_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-test-'))
const { byOwner, diffLines, parseKind } = await import('./loop.ts')

test('parseKind takes the JSON from the answer, and says complex when unsure', () => {
  assert.deepEqual(parseKind('{"kind": "tiny", "why": "a typo"}'), { kind: 'tiny', why: 'a typo' })
  assert.equal(parseKind('Sure: {"kind":"straightforward","why":"x"} done').kind, 'straightforward')
  assert.equal(parseKind('{"kind": "huge"}').kind, 'complex')
  assert.equal(parseKind('no json').kind, 'complex')
  assert.equal(parseKind(null).kind, 'complex')
})

const meta = (m: object) => `Text\n\n<!-- workwith-loop ${JSON.stringify(m)} -->\n`
const owners = ['alex@example.com', 'alexgh']

test('byOwner trusts the desk login over the GitHub author, and a go label over both', () => {
  // Filed from a desk: the GitHub author is the desk's gh user, so only the login counts.
  assert.equal(byOwner({ body: meta({ by: 'alex@example.com' }), author: { login: 'alexgh' }, labels: [] }, owners), true)
  assert.equal(byOwner({ body: meta({ by: 'sam@example.com' }), author: { login: 'alexgh' }, labels: [] }, owners), false)
  assert.equal(byOwner({ body: meta({ by: null, via: 'agent' }), author: { login: 'alexgh' }, labels: [] }, owners), false)
  // Filed on GitHub itself.
  assert.equal(byOwner({ body: 'Text', author: { login: 'AlexGH' }, labels: [] }, owners), true)
  assert.equal(byOwner({ body: 'Text', author: { login: 'sam' }, labels: [] }, owners), false)
  assert.equal(byOwner({ body: 'Text', author: { login: 'sam' }, labels: [{ name: 'go' }] }, owners), true)
})

test('diffLines adds the added and removed lines, and skips binary files', () => {
  assert.equal(diffLines('3\t1\ta.ts\n10\t0\tb.ts\n-\t-\timg.png\n'), 14)
  assert.equal(diffLines(''), 0)
})
