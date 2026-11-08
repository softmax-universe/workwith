// File an issue for the improvement loop (server/loop.ts): a bug, a rough edge, an idea.
// The loop builds tiny ones and ships them to main by itself, and prototypes the rest.

import { useState } from 'react'
import { useEscape } from '../escape.ts'
import { api } from '../store.ts'
import { XIcon } from './Icons.tsx'

export function ReportDialog({ onClose }: { onClose(): void }) {
  useEscape(onClose)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const file = async () => {
    setBusy(true); setErr(null)
    try { setUrl((await api<{ url: string }>('/api/issues', 'POST', { title, body })).url) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal report-modal" data-pid="report-dialog">
        <div className="files-head">
          <h2>Report an issue or idea</h2>
          <button className="icon-btn" title="Close" onClick={onClose}><XIcon size={14} /></button>
        </div>
        {url ? <>
          <p>Filed: <a href={url} target="_blank" rel="noreferrer">{url.replace(/^https:\/\/github\.com\//, '')}</a>. The loop picks it up within a minute.</p>
          <div className="modal-actions"><button className="primary" onClick={onClose}>Close</button></div>
        </> : <>
          <p className="muted">A bug, a rough edge or an idea for this app. Small, clear ones get built and shipped by themselves; larger ones get a prototype. Keep personal data out.</p>
          <input autoFocus placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} data-pid="report-title" />
          <textarea rows={7} placeholder="What is wrong or wanted, where, and how to see it" value={body} onChange={(e) => setBody(e.target.value)} data-pid="report-body"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && title.trim()) void file() }} />
          {err && <div className="notice error">{err}</div>}
          <div className="modal-actions">
            <button onClick={onClose}>Cancel</button>
            <button className="primary" disabled={!title.trim() || busy} onClick={() => void file()} data-pid="report-file">{busy ? 'Filing…' : 'File issue'}</button>
          </div>
        </>}
      </div>
    </div>
  )
}
