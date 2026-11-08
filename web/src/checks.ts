// Task lists in Claude's text (- [ ] step): each box is "<msg>:t<n>", the n-th box of its
// block of text. A box shows the last state you sent, or your draft (store.ts setCheck), or
// what Claude wrote. Ticks go with your next message, like Done items, not as a turn each.

import { useEffect } from 'react'
import type { Event } from '../../shared/types.ts'
import { draftsOf, setCheck, state } from './store.ts'

// The state of each box as last sent, from the messages of a session.
const sentOf = new WeakMap<Event[], Map<string, boolean>>()
export function sentChecks(events: Event[]): Map<string, boolean> {
  let m = sentOf.get(events)
  if (m) return m
  m = new Map()
  for (const e of events) if (e.t === 'user') for (const p of e.parts) if (p.kind === 'check') for (const i of p.items) m.set(i.key, i.checked)
  sentOf.set(events, m)
  return m
}

// The text of a list item, without the lists inside it.
function labelOf(li: HTMLElement): string {
  const c = li.cloneNode(true) as HTMLElement
  for (const l of c.querySelectorAll('ul, ol')) l.remove()
  return (c.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
}

const boxesIn = (el: HTMLElement) => [...el.querySelectorAll<HTMLInputElement>('.md-block li > input[type=checkbox], .md-block li > p:first-child > input[type=checkbox]')]

// Makes the boxes in one block of Claude's text work, and shows "3/5" on each task list.
// Runs after each render: a tick changes the store, which renders the message again.
export function useTaskLists(root: React.RefObject<HTMLDivElement | null>, sid: string, msg: string, live: boolean) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const boxes = boxesIn(el)
    if (!boxes.length) return
    const sent = sentChecks(state.events[sid] ?? [])
    const drafts = new Map(draftsOf(sid).flatMap((d) => d.kind === 'check' ? [[d.key, d.checked] as const] : []))
    const lists = new Set<HTMLElement>()
    boxes.forEach((b, i) => {
      const key = `${msg}:t${i + 1}`
      // As Claude wrote it: the attribute, which a tick does not change.
      const was = sent.get(key) ?? b.hasAttribute('checked')
      b.dataset.key = key
      b.dataset.was = was ? '1' : ''
      b.checked = drafts.get(key) ?? was
      b.disabled = live || !!state.share
      const li = b.closest('li')!
      li.classList.add('task-item')
      li.classList.toggle('task-done', b.checked)
      li.classList.toggle('task-changed', drafts.has(key))
      lists.add(li.parentElement!)
    })
    for (const l of lists) {
      const own = [...l.children].flatMap((li) => { const b = li.querySelector<HTMLInputElement>(':scope > input[type=checkbox], :scope > p:first-child > input[type=checkbox]'); return b ? [b] : [] })
      const done = own.filter((b) => b.checked).length
      l.classList.add('task-list')
      l.classList.toggle('task-all', done === own.length)
      l.dataset.progress = `${done}/${own.length}`
    }
  })
  useEffect(() => {
    const el = root.current
    if (!el || live) return
    const change = (e: globalThis.Event) => {
      const b = e.target as HTMLInputElement
      if (b.type !== 'checkbox' || !b.dataset.key) return
      setCheck(sid, b.dataset.key, labelOf(b.closest('li')!), b.checked, b.dataset.was === '1')
    }
    el.addEventListener('change', change)
    return () => el.removeEventListener('change', change)
  }, [root, sid, live])
}
