// A page, PDF or artifact in a message can grow: over the chat's scroll area (the message
// box stays in view), or over the whole window. The frame goes into the top layer as a
// popover, so no parent box clips it, and it never moves in the DOM (a move loads it
// again). Markdown renders the same markup as a string (util.ts: mediaHtml), so one
// listener on the document does the work for both.

const svg = (d: string) => `<svg class="icon" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`
const PANE = svg('M2.5 3.5h11v9h-11zM6 3.5v9')
const WINDOW = svg('M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10')
const SHRINK = svg('M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5')

const BAR = `<button type="button" class="frame-btn" data-zoom="pane" title="Fill the chat" aria-label="Fill the chat"><span class="z-on">${PANE}</span><span class="z-off">${SHRINK}</span></button>`
  + `<button type="button" class="frame-btn" data-zoom="window" title="Fill the window" aria-label="Fill the window"><span class="z-on">${WINDOW}</span><span class="z-off">${SHRINK}</span></button>`

// For markdown: the frame's HTML, in a box with the buttons.
export const frameBoxHtml = (frame: string) => `<span class="frame-box"><span class="frame-in">${frame}<span class="frame-bar">${BAR}</span></span></span>`

export function FrameBox({ children }: { children: React.ReactNode }) {
  return <span className="frame-box"><span className="frame-in">{children}<span className="frame-bar" dangerouslySetInnerHTML={{ __html: BAR }} /></span></span>
}

type Mode = 'pane' | 'window'
const open = new Map<HTMLElement, { mode: Mode; stop(): void }>()

function zoomOut(inner: HTMLElement) {
  const z = open.get(inner)
  if (!z) return
  z.stop()
  open.delete(inner)
  if (inner.matches(':popover-open')) inner.hidePopover()
  inner.removeAttribute('popover')
  inner.classList.remove('zoom-pane', 'zoom-window')
  inner.style.top = inner.style.left = inner.style.width = inner.style.height = ''
  inner.parentElement!.style.height = ''
}

function zoomIn(inner: HTMLElement, mode: Mode) {
  const chat = inner.closest<HTMLElement>('.transcript')
  if (mode === 'pane' && !chat) return
  // The box keeps its height in the message while the frame is out of it, so the text does not jump.
  inner.parentElement!.style.height = `${inner.parentElement!.offsetHeight}px`
  inner.setAttribute('popover', 'manual')
  inner.classList.add(`zoom-${mode}`)
  inner.showPopover()
  let stop = () => {}
  if (mode === 'pane') {
    const place = () => {
      // The chat's box less its scroll bar.
      const r = chat!.getBoundingClientRect()
      Object.assign(inner.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${chat!.clientWidth}px`, height: `${r.height}px` })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(chat!)
    addEventListener('resize', place)
    stop = () => { ro.disconnect(); removeEventListener('resize', place) }
  }
  open.set(inner, { mode, stop })
}

document.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest?.<HTMLButtonElement>('.frame-btn[data-zoom]')
  const inner = btn?.closest<HTMLElement>('.frame-in')
  if (!btn || !inner) return
  e.preventDefault()
  const mode = btn.dataset.zoom as Mode
  const was = open.get(inner)?.mode
  zoomOut(inner)
  if (was !== mode) zoomIn(inner, mode)
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') for (const inner of [...open.keys()]) zoomOut(inner)
})
