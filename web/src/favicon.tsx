// The tab's icon is the critter of the session that was active last, in its
// look and pose, bobbing while it works. A red number counts the sessions that
// wait on you (questions or permission). With no sessions it
// is a critter in the accent colour. An agent's desk with a face uses the face instead.

import { useEffect } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SessionMeta } from '../../shared/types.ts'
import type { Appearance } from '../../shared/appearance.ts'
import { Mascot } from './components/Mascot.tsx'
import { accentBody } from './appearance.ts'
import { fatigue } from './util.ts'

// Only what an agent asks of you: a finished turn does not need you.
export const NEEDS_YOU = ['permission', 'asking']

function icon(props: React.ComponentProps<typeof Mascot>, count: number, up: boolean): string {
  let svg = renderToStaticMarkup(<Mascot {...props} size={32} />)
    .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    .replace(/viewBox="[^"]*"/, 'viewBox="0 -5 18 18"')
    .replace(/height="[^"]*"/, 'height="32"')
  if (up) svg = svg.replace('class="m-body"', 'class="m-body" transform="translate(0 -1)"')
  if (count) {
    // A rounded box in the top right corner, wider for two digits.
    const n = String(Math.min(count, 99))
    const [w, size, base] = n.length > 1 ? [12.6, 8, 3.2] : [9.6, 9, 3.5]
    svg = svg.replace(/<\/svg>$/, `<rect x="${18 - w}" y="-5" width="${w}" height="10.6" rx="2.6" fill="#e5534b" shape-rendering="auto"/>`
      + `<text x="${18 - w / 2}" y="${base}" font-size="${size}" font-weight="500" text-anchor="middle" fill="#fff" font-family="system-ui, sans-serif">${n}</text></svg>`)
  }
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}

// An agent's desk keeps its face as the tab icon (server/agent.ts), with the same red count,
// rocking ±10° while the last active session works.
const faces = new Map<string, Promise<HTMLImageElement>>()
function face(src: string): Promise<HTMLImageElement> {
  let p = faces.get(src)
  if (!p) {
    p = new Promise((ok, fail) => { const img = new Image(); img.onload = () => ok(img); img.onerror = fail; img.src = src })
    faces.set(src, p)
  }
  return p
}

function faceIcon(img: HTMLImageElement, count: number, deg: number): string {
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.save()
  g.translate(S / 2, S / 2)
  g.rotate(deg * Math.PI / 180)
  // A little smaller than the tile, so its corners stay in while it rocks.
  const d = deg ? S * 0.86 : S
  g.drawImage(img, -d / 2, -d / 2, d, d)
  g.restore()
  if (count) {
    const n = String(Math.min(count, 99))
    const w = n.length > 1 ? 44 : 34, h = 36
    g.fillStyle = '#e5534b'
    g.beginPath(); g.roundRect(S - w, 0, w, h, 9); g.fill()
    g.fillStyle = '#fff'
    g.font = `500 ${n.length > 1 ? 28 : 32}px system-ui, sans-serif`
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(n, S - w / 2, h / 2 + 2)
  }
  return c.toDataURL('image/png')
}

const ROCK = [0, 5, 9, 10, 9, 5, 0, -5, -9, -10, -9, -5]

function setIcons(href: string) {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel=icon]')) {
    link.removeAttribute('type')
    link.href = href
  }
}

export function useFavicon(sessions: SessionMeta[], appearance: Appearance | undefined, avatar?: string) {
  const live = sessions.filter((s) => !s.archived)
  const last = live.filter((s) => s.started).sort((a, b) => b.lastActivity - a.lastActivity)[0]
  // Workers only: the lead is hidden, so its status would count something you cannot see.
  const count = live.filter((s) => s.kind === 'worker' && NEEDS_YOU.includes(s.status)).length
  // The count stands in for the critter's own badge ('idle' has none).
  const props: React.ComponentProps<typeof Mascot> = last
    ? { status: last.status, look: last.look, fatigue: fatigue(last.context.used, last.context.window), alert: 'idle' }
    : { status: 'idle', fatigue: 0, body: accentBody(appearance) }
  const moving = last?.status === 'working' && !appearance?.calm
  const key = JSON.stringify(avatar ? [avatar, count, moving] : [props, count, moving])
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined
    let gone = false
    if (avatar) {
      face(avatar).then((img) => {
        if (gone) return
        const frames = moving ? ROCK.map((deg) => faceIcon(img, count, deg)) : [faceIcon(img, count, 0)]
        let f = 0
        setIcons(frames[0])
        if (frames.length > 1) t = setInterval(() => { f = (f + 1) % frames.length; setIcons(frames[f]) }, 100)
      }).catch(() => {})
      return () => { gone = true; clearInterval(t) }
    }
    const frames = [icon(props, count, false), icon(props, count, true)]
    let f = 0
    setIcons(frames[0])
    if (!moving) return
    t = setInterval(() => { f ^= 1; setIcons(frames[f]) }, 450)
    return () => clearInterval(t)
  }, [key])
}
