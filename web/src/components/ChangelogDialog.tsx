// What's new: the commits of origin/main (server/update.ts changelog), newest first, by day.
// A push to main is a release, and each commit message says what changed for the user. The
// ones this checkout does not have yet come first; an issue this desk filed stands out.

import { useEffect, useState } from 'react'
import { useEscape } from '../escape.ts'
import type { Change } from '../../../shared/update.ts'
import { api, currentMachine } from '../store.ts'
import { XIcon } from './Icons.tsx'

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })

function Entry({ c }: { c: Change }) {
  const here = c.issues.some((i) => i.here)
  return (
    <li className={here ? 'asked-here' : undefined} data-pid={`change-${c.hash}`}>
      <span>{c.subject}</span>
      {c.issues.map((i) => (
        <a key={i.n} className={`change-issue${i.here ? ' here' : ''}`} href={i.url} target="_blank" rel="noreferrer" title={i.title}>
          {i.here ? `Asked for from this desk: ${i.title}` : `#${i.n}`}
        </a>
      ))}
    </li>
  )
}

export function ChangelogDialog({ onClose }: { onClose(): void }) {
  useEscape(onClose)
  const [changes, setChanges] = useState<Change[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { void api<Change[]>('/api/changelog', 'GET', undefined, currentMachine()).then(setChanges, (e) => setErr(e instanceof Error ? e.message : String(e))) }, [])
  const pending = changes?.filter((c) => !c.installed) ?? []
  const days = new Map<string, Change[]>()
  for (const c of changes?.filter((c) => c.installed) ?? []) days.set(day(c.at), [...days.get(day(c.at)) ?? [], c])
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal changelog-modal" data-pid="changelog-dialog">
        <div className="files-head">
          <h2>What's new in workwith</h2>
          <button className="icon-btn" title="Close" onClick={onClose}><XIcon size={14} /></button>
        </div>
        <div className="changelog-body">
          {err && <div className="notice error">{err}</div>}
          {!changes && !err && <p className="muted">Loading…</p>}
          {changes?.length === 0 && <p className="muted">This desk runs workwith from outside a git checkout, so it has no history to show.</p>}
          {pending.length > 0 && <section className="changelog-pending">
            <h3>Not installed yet</h3>
            <ul>{pending.map((c) => <Entry key={c.hash} c={c} />)}</ul>
          </section>}
          {[...days].map(([d, cs]) => <section key={d}>
            <h3>{d}</h3>
            <ul>{cs.map((c) => <Entry key={c.hash} c={c} />)}</ul>
          </section>)}
        </div>
      </div>
    </div>
  )
}
