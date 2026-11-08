// npm test. The note of time that passed (shared/gap.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapNote, gapText, lastSaid } from '../shared/gap.ts'
import type { Event } from '../shared/types.ts'

const H = 3_600_000

test('gapText says nothing under an hour, then hours, days, weeks and months', () => {
  assert.equal(gapText(59 * 60_000), null)
  assert.equal(gapText(H), '1 hour later')
  assert.equal(gapText(3.2 * H), '3 hours later')
  assert.equal(gapText(26 * H), '1 day later')
  assert.equal(gapText(20 * 24 * H), '3 weeks later')
  assert.equal(gapText(90 * 24 * H), '3 months later')
})

test('gapNote gives the gap with the date and time now', () => {
  assert.equal(gapNote(10 * 60_000), null)
  assert.match(gapNote(3 * H, new Date(2026, 10, 7, 14, 5))!, /^— 3 hours later \(Sat 7 Nov 2026, 14:05\) —$/)
})

test('lastSaid skips notices and tool results', () => {
  const ev = [
    { seq: 1, ts: 100, t: 'user', parts: [] },
    { seq: 2, ts: 200, t: 'result', durationMs: 1, isError: false },
    { seq: 3, ts: 900, t: 'notice', text: 'x', level: 'info' },
  ] as Event[]
  assert.equal(lastSaid(ev), 200)
  assert.equal(lastSaid(ev, 1), 100)
  assert.equal(lastSaid([]), null)
})
