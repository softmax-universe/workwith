// A session's face in the sidebar: its project's icon (server/projecticons.ts), an image or an emoji.
// The icon rocks ±10° while the session works, as the tab icon of an agent's desk does (favicon.tsx),
// and wears the critter's badge when the session waits on you, finished unseen, or failed; a starred
// one glows. With no icon (none yet, or 'none' set by hand) it is the critter.

import { useEffect, useState } from 'react'
import type { SessionMeta } from '../../../shared/types.ts'
import { api, changed, machineOf, media, state, useStore } from '../store.ts'
import { fatigue, uploadImage } from '../util.ts'
import { BADGES, Mascot } from './Mascot.tsx'

// Each folder's icon URL (null: none), by machine and folder; asked of the server in one batch.
type Icon = { url: string } | { emoji: string } | null
const known = new Map<string, Icon>()
let wanted = new Set<string>()
let timer: ReturnType<typeof setTimeout> | undefined
// The icons set by hand that the answers in known came from, by machine.
const setFor = new Map<string, string>()

function ask(machine: string, cwd: string) {
  wanted.add(JSON.stringify([machine, cwd]))
  timer ??= setTimeout(() => {
    const asks = [...wanted].map((k) => JSON.parse(k) as [string, string])
    wanted = new Set()
    timer = undefined
    const by = new Map<string, string[]>()
    for (const [m, c] of asks) by.set(m, [...(by.get(m) ?? []), c])
    for (const [m, cwds] of by) {
      void api<Record<string, Icon>>(`/api/project-icons?${cwds.map((c) => `cwd=${encodeURIComponent(c)}`).join('&')}`, 'GET', undefined, m)
        .then((r) => { for (const c of cwds) known.set(JSON.stringify([m, c]), r[c] ?? null); changed() })
        .catch(() => { for (const c of cwds) known.set(JSON.stringify([m, c]), null) })
    }
  }, 30)
}

export function useProjectIcon(cwd: string, machine: string): Icon {
  const st = useStore()
  // Icons set by hand, or emoji Claude picked, changed: ask again for every folder.
  const ms = st.machines[machine]?.settings
  const set = JSON.stringify([ms?.projectIcons ?? {}, ms?.projectEmoji ?? {}])
  if (set !== setFor.get(machine)) {
    setFor.set(machine, set)
    for (const k of known.keys()) if ((JSON.parse(k) as string[])[0] === machine) known.delete(k)
  }
  const key = JSON.stringify([machine, cwd])
  const url = known.get(key)
  useEffect(() => { if (url === undefined) ask(machine, cwd) }, [key, url])
  return url && 'url' in url ? { url: media(url.url, machine) } : url ?? null
}

type Props = { s: SessionMeta; size: number; title?: string }

export function SessionFace({ s, size, title }: Props) {
  const machine = machineOf(s.id)
  const icon = useProjectIcon(s.cwd, machine)
  const [broken, setBroken] = useState<string | null>(null)
  if (!icon || ('url' in icon && broken === icon.url)) {
    return <Mascot status={s.status} look={s.look} fatigue={fatigue(s.context.used, s.context.window)} size={size} title={title} child={!!s.parentId} review={!!s.pendingReviews} starred={s.starred} />
  }
  const badge = s.status === 'asking' && s.pendingReviews ? { ...BADGES.asking!, bg: '#e08a3c' } : BADGES[s.status]
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

