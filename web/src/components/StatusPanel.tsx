import { useEffect, useRef, useState } from 'react'
import { api } from '../store.ts'

// The rest of the agent (server/agentstatus.ts): one line under the agent's name, and the
// whole of what its command says in a dropdown over the sessions. Shown only at an agent's
// desk that has the command (CODINGER_AGENT_STATUS).
type Status = { at: number; summary: string; busy: boolean; warn: string | null; sections: { title: string; rows: [string, string][] }[] }

export function StatusLine() {
  const [s, setS] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let stop = false
    const load = () => api<{ status: Status | null }>('/api/agent-status', 'GET').then((r) => { if (!stop) setS(r.status) }, () => {})
    load()
    const t = setInterval(load, 20_000)
    return () => { stop = true; clearInterval(t) }
  }, [])
  // A click outside or Escape closes the dropdown.
  useEffect(() => {
    if (!open) return
    const click = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', click)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', click); document.removeEventListener('keydown', key) }
  }, [open])
  if (!s) return null
  return (
    <div className="agent-status" ref={box}>
      <button className="agent-status-line" onClick={() => setOpen(!open)} title={s.warn ?? 'What else of the agent is at work'} aria-expanded={open}>
        <span className={`agent-status-dot${s.warn ? ' warn' : s.busy ? ' busy' : ''}`} />
        <span className="agent-status-sum">{s.summary}</span>
        <span className="agent-status-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="agent-status-drop">
          {s.warn && <div className="agent-status-warn">{s.warn}</div>}
          {s.sections.map((sec, i) => (
            <div key={i}>
              {sec.title && <div className="agent-status-h">{sec.title}</div>}
              {sec.rows.map(([k, v], j) => <div key={j} className="agent-status-row"><span>{k}</span>{v && <span className="muted">{v}</span>}</div>)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
