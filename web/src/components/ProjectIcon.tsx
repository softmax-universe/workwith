// A session's face in the sidebar: its project's icon (server/projecticons.ts), an image or an emoji.
// An accent arc turns around the icon while the session works (styles.css: proj-ring),
// and wears the critter's badge when the session waits on you, finished unseen, or failed; a starred
// one glows. With no icon (none yet, or 'none' set by hand) it is the critter.

import { useEffect, useRef, useState } from 'react'
import type { SessionMeta } from '../../../shared/types.ts'
import { api, changed, machineOf, media, state, useStore } from '../store.ts'
import { fatigue, uploadImage } from '../util.ts'
import { badgeOf, Mascot } from './Mascot.tsx'
import { FolderIcon } from './Icons.tsx'

// Each folder's icon URL (null: none), by machine, folder and quick; asked of the server in batches.
// quick: the folder picker's rows (a shorter walk on the server, and never a new emoji).
type Icon = { url: string } | { emoji: string } | null
const known = new Map<string, Icon>()
// When each was last asked: found icons are asked again after two minutes, so a project that gets
// a logo (or a better one) wears it without a reload; the old one shows until the answer comes.
const askedAt = new Map<string, number>()
const AGAIN = 120_000
let wanted = new Set<string>()
let timer: ReturnType<typeof setTimeout> | undefined
// The icons set by hand that the answers in known came from, by machine.
const setFor = new Map<string, string>()

function ask(machine: string, cwd: string, quick: boolean) {
  const key = JSON.stringify([machine, cwd, quick])
  askedAt.set(key, Date.now())
  wanted.add(key)
  timer ??= setTimeout(() => {
    const asks = [...wanted].map((k) => JSON.parse(k) as [string, string, boolean])
    wanted = new Set()
    timer = undefined
    const by = new Map<string, string[]>()
    for (const [m, c, q] of asks) { const k = JSON.stringify([m, q]); by.set(k, [...(by.get(k) ?? []), c]) }
    for (const [k, all] of by) {
      const [m, q] = JSON.parse(k) as [string, boolean]
      // 40 folders an ask, so its address stays short.
      for (let i = 0; i < all.length; i += 40) {
        const cwds = all.slice(i, i + 40)
        void api<Record<string, Icon>>(`/api/project-icons?${q ? 'quick=1&' : ''}${cwds.map((c) => `cwd=${encodeURIComponent(c)}`).join('&')}`, 'GET', undefined, m)
          .then((r) => { for (const c of cwds) known.set(JSON.stringify([m, c, q]), r[c] ?? null); changed() })
          .catch(() => { for (const c of cwds) known.set(JSON.stringify([m, c, q]), null) })
      }
    }
  }, 30)
}

// on: false until the icon is wanted (a row scrolled into view), so nothing is asked before.
export function useProjectIcon(cwd: string, machine: string, quick = false, on = true): Icon {
  const st = useStore()
  // Icons set by hand, or emoji Claude picked, changed: ask again for every folder.
  const ms = st.machines[machine]?.settings
  const set = JSON.stringify([ms?.projectIcons ?? {}, ms?.projectEmoji ?? {}])
  if (set !== setFor.get(machine)) {
    setFor.set(machine, set)
    for (const k of known.keys()) if ((JSON.parse(k) as string[])[0] === machine) known.delete(k)
  }
  const key = JSON.stringify([machine, cwd, quick])
  const url = known.get(key)
  const stale = url !== undefined && Date.now() - (askedAt.get(key) ?? 0) > AGAIN
  useEffect(() => { if (on && cwd && (url === undefined || stale)) ask(machine, cwd, quick) }, [key, url, on, stale])
  return url && 'url' in url ? { url: media(url.url, machine) } : url ?? null
}

// A folder's icon in the folder picker: its project's icon or emoji when one is known, else the
// folder glyph. Asked for only once its row is in view.
export function DirIcon({ path, machine, size = 14 }: { path: string; machine: string; size?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() } })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  const icon = useProjectIcon(path, machine, true, seen)
  const [broken, setBroken] = useState(false)
  return (
    <span ref={ref} className="dir-icon" style={{ width: size, height: size }}>
      {icon && 'url' in icon && !broken ? <img src={icon.url} alt="" draggable={false} onError={() => setBroken(true)} />
        : icon && 'emoji' in icon ? <span style={{ fontSize: size * 0.9 }}>{icon.emoji}</span>
        : <FolderIcon size={size - 1} />}
    </span>
  )
}

type Props = { s: SessionMeta; size: number; title?: string }

export function SessionFace({ s, size, title }: Props) {
  const machine = machineOf(s.id)
  const icon = useProjectIcon(s.cwd, machine)
  const [broken, setBroken] = useState<string | null>(null)
  if (!icon || ('url' in icon && broken === icon.url)) {
    return <Mascot status={s.status} look={s.look} fatigue={fatigue(s.context.used, s.context.window)} size={size} title={title} child={!!s.parentId} review={!!s.pendingReviews} done={!!s.taskDone} starred={s.starred} />
  }
  const badge = badgeOf(s.status, !!s.pendingReviews, !!s.taskDone)
  return (
    <span className={`proj-face st-${s.status}${s.starred ? ' starred' : ''}`} style={{ width: size, height: size * 20 / 18 }} title={title} role="img" aria-label={title ?? s.status}>
      {'url' in icon
        ? <img className="proj-icon" src={icon.url} alt="" draggable={false} onError={() => setBroken(icon.url)} />
        : <span className="proj-icon proj-emoji" style={{ fontSize: size * 0.72 }}>{icon.emoji}</span>}
      {badge && <span className="proj-badge" style={{ background: badge.bg, color: badge.fg }}>{badge.ch}</span>}
    </span>
  )
}

// What a right click on a session offers for its project's icon.
export function iconItems(s: SessionMeta): { label: string; run(): unknown }[] {
  const machine = machineOf(s.id)
  const icons = state.machines[machine]?.settings?.projectIcons ?? {}
  // Set here, it holds for this folder and those under it (server/projecticons.ts).
  const put = (icon: string | null) => api('/api/project-icons', 'PUT', { cwd: s.cwd, icon }, machine)
  const choose = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (f) await put((await uploadImage(f, machine)).url)
    }
    input.click()
  }
  return [
    { label: 'Choose project icon…', run: choose },
    { label: 'Choose project emoji…', run: () => { const e = prompt('An emoji for this folder:'); if (e?.trim()) void put(e.trim()) } },
    ...(icons[s.cwd] !== 'none' ? [{ label: 'Show the critter, not an icon', run: () => put('none') }] : []),
    ...(icons[s.cwd] ? [{ label: "Use the repository's icon", run: () => put(null) }] : []),
  ]
}

