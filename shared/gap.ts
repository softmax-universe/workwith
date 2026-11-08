// Time that passed in a conversation. A message after a long quiet carries a note of it: the
// transcript shows "3 hours later" above it (web Transcript.tsx), and Claude gets the same note
// with the date and time, at the top of the message (server/session.ts send), since it otherwise
// knows only the date the session started on.

import type { Event } from './types.ts'

export const GAP_MS = 60 * 60_000   // an hour

// The events a gap is measured from: what someone said, and the end of a turn.
const said = (e: Event) => e.t === 'user' || e.t === 'assistant' || e.t === 'result'

// When the conversation last moved, before the event at index i (all of them by default).
export function lastSaid(events: Event[], i = events.length): number | null {
  for (let j = i - 1; j >= 0; j--) if (said(events[j])) return events[j].ts
  return null
}

// "3 hours later", "2 days later", "3 weeks later"; null for a gap under GAP_MS.
export function gapText(ms: number): string | null {
  if (!(ms >= GAP_MS)) return null
  const n = (x: number, unit: string) => `${x} ${unit}${x === 1 ? '' : 's'} later`
  const h = Math.round(ms / 3_600_000)
  if (h < 24) return n(h, 'hour')
  const d = Math.round(ms / 86_400_000)
  return d < 14 ? n(d, 'day') : d < 60 ? n(Math.round(d / 7), 'week') : n(Math.round(d / 30), 'month')
}

// What Claude reads at the top of a message after a gap: "— 3 hours later (Sat 7 Nov 2026, 14:05) —".
export function gapNote(ms: number, now = new Date()): string | null {
  const t = gapText(ms)
  if (!t) return null
  const when = now.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/,(?= \d+ \w+ \d{4})/, '').replace(' at ', ', ')
  return `— ${t} (${when}) —`
}
