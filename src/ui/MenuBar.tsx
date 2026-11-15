import { isDesktop } from '../shared/desktop'
import { openExternal } from '../shared/external'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BoardApp } from '../app/useBoardApp'
import { ALL_TYPE_LABELS } from '../categorize/style/labels'
import { COLOR_FAMILIES, familyShades } from '../categorize/color'
import { APP_VERSION, BUILD_DATE } from '../shared/version'
import { PenTest } from './PenTest'
import { CloseIcon, SidebarIcon } from './icons'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'
const shift = isMac ? '⇧' : 'Shift+'

interface Item {
  label: string
  keys?: string
  disabled?: boolean
  run: () => void
  /** Filter menus: shows a tick when on, and the menu stays open so several can be picked. */
  checked?: boolean
  keepOpen?: boolean
  /** Colour dot before the label (categories). */
  dot?: string
  /** Small × at the right of the row (delete a category). */
  remove?: () => void
}

/** A macOS-style menu bar: click a title to open it, hover to move between open menus, Esc or a click elsewhere closes. */
export type ViewKind = 'free' | 'cards' | 'library'

export function MenuBar({ app, sidebarOpen, onToggleSidebar, onLitImport, view, onShowView, showTags, onToggleTags }: { app: BoardApp; sidebarOpen: boolean; onToggleSidebar: () => void; onLitImport: () => void; view: ViewKind; onShowView: (v: ViewKind) => void; showTags: boolean; onToggleTags: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const [about, setAbout] = useState(false)
  const [penTest, setPenTest] = useState(false)
  const bar = useRef<HTMLElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const onBoard = app.screen === 'board'
  const picked = onBoard
    ? [...new Set(app.boardPlacements.filter((p) => app.selection.includes(p.id) && p.assetId).map((p) => p.assetId))]
    : app.librarySelection

  const { filter, categories } = app
  const used = new Set(Object.values(app.assets).flatMap((a) => a.types ?? []))
  const typeItems: (Item | 'sep')[] = ALL_TYPE_LABELS.filter((t) => used.has(t.id)).map((t) => ({
    label: t.name, checked: filter.types.includes(t.id), keepOpen: true, run: () => app.toggleFilter('types', t.id),
  }))
  // Swatches show the library's real colour for each family (falls back to the family's base colour when nothing is in it).
  const shades = useMemo(() => familyShades(Object.values(app.assets).map((a) => a.palette)), [app.assets])
  const hasFilter = filter.colors.length + filter.categories.length + filter.types.length > 0
  const colourItems: (Item | 'sep')[] = [
    ...COLOR_FAMILIES.map((c): Item => ({ label: c.name[0].toUpperCase() + c.name.slice(1), dot: shades.get(c.name) ?? c.hex, checked: filter.colors.includes(c.name), keepOpen: true, run: () => app.toggleFilter('colors', c.name) })),
    'sep',
    { label: 'Clear All Filters', disabled: !hasFilter, run: app.clearFilter },
  ]
  const categoryItems: (Item | 'sep')[] = categories.map((c) => ({
    label: c.name, dot: c.color, checked: filter.categories.includes(c.id), keepOpen: true, run: () => app.toggleFilter('categories', c.id),
    remove: () => { if (confirm(`Delete tag "${c.name}"? Images keep everything else.`)) app.removeCategory(c.id) },
  }))
  if (categoryItems.length) categoryItems.push('sep')
  categoryItems.push({ label: 'New Tag…', run: () => { const name = prompt('Tag name'); if (name?.trim()) app.addCategory(name.trim()) } })

  const menus: { title: string; badge?: number; items: (Item | 'sep')[] }[] = [
    {
      title: 'File',
      items: [
        { label: 'New Board', run: app.addBoard },
        { label: 'Open…', run: () => (isDesktop() ? void app.openBo() : fileInput.current?.click()) },
        'sep',
        { label: 'Import from LIT Awards…', run: onLitImport },
        ...(isDesktop() ? [{ label: 'Pinterest Panel', run: () => void import('@tauri-apps/api/core').then(({ invoke }) => invoke('toggle_pinterest')) }] : []),
        'sep',
        { label: 'Save', keys: `${mod}S`, disabled: !onBoard, run: () => void app.saveBoard() },
        { label: 'Save As…', keys: `${shift}${mod}S`, disabled: !onBoard, run: () => void app.saveBoardAs() },
        'sep',
        { label: 'Export Selected as JPEG…', disabled: !picked.length, run: () => void app.exportJpeg(picked) },
        'sep',
        {
          label: 'Clear Everything…',
          run: () => {
            if (confirm('Delete ALL boards, images, notes and tags from this browser? This cannot be undone. Boards saved as .bo files are not affected.')) void app.clearAll()
          },
        },
      ],
    },
    {
      title: 'View',
      items: [
        { label: 'Freeform View', checked: view === 'free', run: () => onShowView('free') },
        { label: 'Card View', checked: view === 'cards', run: () => onShowView('cards') },
        { label: 'Library View', checked: view === 'library', run: () => onShowView('library') },
        'sep',
        { label: 'Tag Borders', checked: showTags, run: onToggleTags },
        { label: sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar', keys: `${mod}\\`, run: onToggleSidebar },
      ],
    },
    {
      title: 'Board',
      items: [
        ...app.boards.map((b): Item => ({ label: b.name || 'Untitled', checked: onBoard && b.id === app.activeId, run: () => app.selectBoard(b.id) })),
        'sep',
        { label: 'New Board', run: app.addBoard },
      ],
    },
    { title: 'Type', badge: filter.types.length, items: typeItems.length ? typeItems : [{ label: 'No types detected yet', disabled: true, run: () => {} }] },
    { title: 'Colour', badge: filter.colors.length, items: colourItems },
    { title: 'Tags', badge: filter.categories.length, items: categoryItems },
    { title: 'Help', items: [{ label: 'Pen test…', run: () => setPenTest(true) }, 'sep', { label: 'About REMind', run: () => setAbout(true) }] },
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
      <strong className="app-name"><i>ReM:</i>ind</strong>
      {menus.map((m) => (
        <div key={m.title} className="menu">
          <button
            className={'menu-title' + (open === m.title ? ' open' : '')}
            aria-haspopup="menu"
            aria-expanded={open === m.title}
            onClick={() => setOpen(open === m.title ? null : m.title)}
            onPointerEnter={() => open && setOpen(m.title)}
          >
            {m.title}{m.badge ? ` · ${m.badge}` : ''}
          </button>
          {open === m.title && (
            <div className="menu-list" role="menu">
              {m.items.map((it, i) =>
                it === 'sep' ? (
                  <hr key={i} />
                ) : (
                  <div key={it.label} className="menu-row">
                    <button
                      role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                      aria-checked={it.checked}
                      disabled={it.disabled}
                      onClick={() => {
                        if (!it.keepOpen) setOpen(null)
                        it.run()
                      }}
                    >
                      <span className="menu-label">
                        {it.checked !== undefined && <i className="tick">{it.checked ? '✓' : ''}</i>}
                        {it.dot && <i className="dot" style={{ background: it.dot }} />}
                        {it.label}
                      </span>
                      {it.keys && <kbd>{it.keys}</kbd>}
                    </button>
                    {it.remove && <button className="menu-x" title={`Delete ${it.label}`} onClick={it.remove}><CloseIcon /></button>}
                  </div>
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
      {penTest && <PenTest onClose={() => setPenTest(false)} />}
      {about && (
        <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setAbout(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
            <header>
              <strong id="about-title">About REMind</strong>
              <button className="icon" title="Close" onClick={() => setAbout(false)}><CloseIcon /></button>
            </header>
            <p>Version {APP_VERSION}</p>
            <p className="muted small">Built {BUILD_DATE}. Your images stay on this computer.</p>
            <p className="small">Created by REMSTUDIO © 2026</p>
            <p className="small about-links">
              <a href="https://rem-design.co" onClick={(e) => { e.preventDefault(); void openExternal('https://rem-design.co') }}>rem-design.co</a>
              {' · '}
              <a href="https://www.instagram.com/rem_thecreator" onClick={(e) => { e.preventDefault(); void openExternal('https://www.instagram.com/rem_thecreator') }}>Instagram @rem_thecreator</a>
            </p>
          </div>
        </div>
      )}
    </nav>
  )
}
