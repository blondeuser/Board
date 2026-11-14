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

  const flip = pos.x > window.innerWidth - 480 // submenus open to the left near the right edge
  const render = (list: (MenuItem | 'sep')[]) =>
    list.map((it, i) =>
      it === 'sep' ? (
        <hr key={i} />
      ) : it.children ? (
        <div key={it.label} className={'ctx-sub' + (flip ? ' flip' : '')}>
          <button disabled={it.disabled} role="menuitem" aria-haspopup="menu"><span>{it.label}</span><kbd>›</kbd></button>
          {!it.disabled && <div className="menu-list ctx-list" role="menu">{render(it.children)}</div>}
        </div>
      ) : (
        <button key={it.label} role="menuitem" disabled={it.disabled} onClick={() => { onClose(); it.run?.() }}>
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
