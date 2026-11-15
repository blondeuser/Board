import { useEffect, useRef, useState } from 'react'
import { PinterestIcon } from './icons'
import { isDesktop } from '../shared/desktop'

const call = (cmd: string, args?: Record<string, unknown>) => import('@tauri-apps/api/core').then(({ invoke }) => invoke(cmd, args))

/** Drag handle + close button on the right edge of the main webview, shown while the Pinterest panel is open. */
export function PinterestHandle() {
  const [open, setOpen] = useState(false)
  const width = useRef(480) // panel width in logical px; matches PANEL_W in lib.rs
  const total = useRef<number | null>(null) // main + panel width at drag start

  useEffect(() => {
    if (!isDesktop()) return
    let off: (() => void) | undefined
    let gone = false
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<boolean>('pinterest-open', (e) => setOpen(e.payload)).then((u) => (gone ? u() : (off = u))),
    )
    return () => { gone = true; off?.() }
  }, [])

  if (!open) return null
  return (
    <>
      <div
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 10000, touchAction: 'none' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); total.current = window.innerWidth + width.current }}
        onPointerMove={(e) => {
          if (total.current === null) return
          width.current = Math.round(total.current - e.clientX)
          void call('set_pinterest_width', { w: width.current })
        }}
        onPointerUp={() => { total.current = null }}
      />
      <button
        title="Close Pinterest"
        aria-label="Close Pinterest"
        style={{ position: 'fixed', top: 8, right: 14, zIndex: 10001, width: 28, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: 16, lineHeight: '28px' }}
        onClick={() => void call('toggle_pinterest')}
      >×</button>
    </>
  )
}

/** Toolbar button that shows or hides the Pinterest panel (desktop only). */
export function PinterestButton() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!isDesktop()) return
    let off: (() => void) | undefined
    let gone = false
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<boolean>('pinterest-open', (e) => setOpen(e.payload)).then((u) => (gone ? u() : (off = u))),
    )
    return () => { gone = true; off?.() }
  }, [])
  if (!isDesktop()) return null
  return <button className={'icon' + (open ? ' on' : '')} title={open ? 'Hide Pinterest' : 'Pinterest'} aria-pressed={open} onClick={() => void call('toggle_pinterest')}><PinterestIcon /></button>
}
