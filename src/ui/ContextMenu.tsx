import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  keys?: string
  disabled?: boolean
  run?: () => void
  /** Submenu: opens to the side on hover. */
  children?: (MenuItem | 'sep')[]
}

/** Right-click menu at a screen position. Closes on Esc, a click elsewhere, or after an item runs. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: (MenuItem | 'sep')[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Keep the menu on screen.
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect()
    setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) })
  }, [x, y])

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', esc)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  // Submenus open on hover but close with a short delay, so a diagonal move toward the submenu (which can cross the next
  // row or leave the menu) doesn't drop it. Switching to another submenu also waits a moment.
  const [openSub, setOpenSub] = useState<string | null>(null)
  const timer = useRef(0)
  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(fn, ms)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // Keep the open submenu on screen: if it would run off the bottom, slide it up by the overflow.
  useLayoutEffect(() => {
    const sub = ref.current?.querySelector<HTMLElement>('.ctx-sub.open > .ctx-list')
    if (!sub) return
    sub.style.top = ''
    const over = sub.getBoundingClientRect().bottom - (window.innerHeight - 4)
    if (over > 0) sub.style.top = `${(parseFloat(getComputedStyle(sub).top) || 0) - over}px`
  }, [openSub])

  const flip = pos.x > window.innerWidth - 480 // submenus open to the left near the right edge
  const render = (list: (MenuItem | 'sep')[], nested = false) =>
    list.map((it, i) =>
      it === 'sep' ? (
        <hr key={i} />
      ) : it.children ? (
        <div
          key={it.label}
          className={'ctx-sub' + (flip ? ' flip' : '') + (openSub === it.label ? ' open' : '')}
          onMouseEnter={() => {
            if (it.disabled) return later(() => setOpenSub(null), 150)
            if (openSub === null || openSub === it.label) {
              window.clearTimeout(timer.current)
              setOpenSub(it.label)
            } else later(() => setOpenSub(it.label), 250)
          }}
        >
          <button disabled={it.disabled} role="menuitem" aria-haspopup="menu"><span>{it.label}</span><kbd>›</kbd></button>
          {!it.disabled && <div className="menu-list ctx-list" role="menu" onMouseEnter={() => window.clearTimeout(timer.current)}>{render(it.children, true)}</div>}
        </div>
      ) : (
        <button key={it.label} role="menuitem" disabled={it.disabled} onMouseEnter={() => !nested && openSub && later(() => setOpenSub(null), 250)} onClick={() => { onClose(); it.run?.() }}>
          <span>{it.label}</span>
          {it.keys && <kbd>{it.keys}</kbd>}
        </button>
      ),
    )

  return (
    <div ref={ref} className="menu-list ctx" role="menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {render(items)}
    </div>
  )
}
