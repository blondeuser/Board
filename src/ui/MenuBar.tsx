import { useEffect, useRef, useState } from 'react'
import type { BoardApp } from '../app/useBoardApp'
import { SidebarIcon } from './icons'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'
const shift = isMac ? '⇧' : 'Shift+'

interface Item {
  label: string
  keys?: string
  disabled?: boolean
  run: () => void
}

/** A macOS-style menu bar: click a title to open it, hover to move between open menus, Esc or a click elsewhere closes. */
export function MenuBar({ app, sidebarOpen, onToggleSidebar, onLitImport }: { app: BoardApp; sidebarOpen: boolean; onToggleSidebar: () => void; onLitImport: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const bar = useRef<HTMLElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const onBoard = app.screen === 'board'
  const picked = onBoard
    ? [...new Set(app.boardPlacements.filter((p) => app.selection.includes(p.id) && p.assetId).map((p) => p.assetId))]
    : app.librarySelection

  const menus: { title: string; items: (Item | 'sep')[] }[] = [
    {
      title: 'File',
      items: [
        { label: 'New Board', run: app.addBoard },
        { label: 'Open…', run: () => fileInput.current?.click() },
        'sep',
        { label: 'Import from LIT Awards…', run: onLitImport },
        'sep',
        { label: 'Save', keys: `${mod}S`, disabled: !onBoard, run: () => void app.saveBoard() },
        { label: 'Save As…', keys: `${shift}${mod}S`, disabled: !onBoard, run: () => void app.saveBoardAs() },
        'sep',
        { label: 'Export Selected as JPEG…', disabled: !picked.length, run: () => void app.exportJpeg(picked) },
      ],
    },
    {
      title: 'View',
      items: [{ label: sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar', keys: `${mod}\\`, run: onToggleSidebar }],
    },
  ]

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <nav className="menubar" ref={bar} aria-label="Menu bar">
      <button className="icon sidebar-toggle" title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} aria-pressed={sidebarOpen} onClick={onToggleSidebar}><SidebarIcon /></button>
      <strong className="app-name">Board</strong>
      {menus.map((m) => (
        <div key={m.title} className="menu">
          <button
            className={'menu-title' + (open === m.title ? ' open' : '')}
            aria-haspopup="menu"
            aria-expanded={open === m.title}
            onClick={() => setOpen(open === m.title ? null : m.title)}
            onPointerEnter={() => open && setOpen(m.title)}
          >
            {m.title}
          </button>
          {open === m.title && (
            <div className="menu-list" role="menu">
              {m.items.map((it, i) =>
                it === 'sep' ? (
                  <hr key={i} />
                ) : (
                  <button
                    key={it.label}
                    role="menuitem"
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null)
                      it.run()
                    }}
                  >
                    <span>{it.label}</span>
                    {it.keys && <kbd>{it.keys}</kbd>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <input
        ref={fileInput}
        type="file"
        accept=".bo"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void app.importBo(f)
        }}
      />
    </nav>
  )
}
