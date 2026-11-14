import { useMemo, useRef, useState } from 'react'
import type { BoardApp } from '../app/useBoardApp'
import { COLOR_FAMILIES, familyShades } from '../categorize/color'
import { CloseIcon, PlusIcon, GridIcon, DownloadIcon, UploadIcon } from './icons'
import { ThemeToggle } from './ThemeToggle'

export function Sidebar({ app }: { app: BoardApp }) {
  const { boards, activeId, filter } = app
  const [editing, setEditing] = useState('')
  const boFile = useRef<HTMLInputElement>(null)
  const hasFilter = filter.colors.length + filter.categories.length + filter.types.length > 0
  // Swatches show the library's real colour for each family (falls back to the family's base colour when nothing is in it).
  const shades = useMemo(() => familyShades(Object.values(app.assets).map((a) => a.palette)), [app.assets])

  return (
    <aside className="sidebar">
      <section>
        <ul className="list">
          <li className={app.screen === 'library' ? 'active' : ''} onClick={() => app.setScreen('library')}>
            <GridIcon />
            <span className="name">Library</span>
            <span className="muted">{Object.keys(app.assets).length}</span>
          </li>
        </ul>
      </section>

      <section>
        <header>
          <h2>Boards</h2>
          <span className="row">
            <button className="icon" title="Open a .bo file" onClick={() => boFile.current?.click()}><UploadIcon /></button>
            <button className="icon" title="Save this board as a .bo file" disabled={app.screen !== 'board'} onClick={() => void app.saveBoardAs()}><DownloadIcon /></button>
            <button className="icon" title="New board" onClick={app.addBoard}><PlusIcon /></button>
          </span>
          <input
            ref={boFile}
            type="file"
            accept=".bo"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void app.importBo(f)
            }}
          />
        </header>
        <ul className="list">
          {boards.map((b) => (
            <li key={b.id} className={b.id === activeId && app.screen === 'board' ? 'active' : ''} onClick={() => app.selectBoard(b.id)}>
              {editing === b.id ? (
                <input
                  autoFocus
                  defaultValue={b.name}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => { app.renameBoard(b.id, e.target.value); setEditing('') }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing('') }}
                />
              ) : (
                <span className="name" onDoubleClick={() => setEditing(b.id)} title="Double-click to rename">{b.name}</span>
              )}
              {boards.length > 1 && (
                <button
                  className="icon small hover"
                  title="Delete board"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete the board "${b.name}"? Its images stay in the Library.`)) app.removeBoard(b.id)
                  }}
                >
                  <CloseIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <header>
          <h2>Colour</h2>
          {hasFilter && <button className="link" onClick={app.clearFilter}>Clear</button>}
        </header>
        <div className="swatches">
          {COLOR_FAMILIES.map((c) => (
            <button
              key={c.name}
              className={'swatch' + (filter.colors.includes(c.name) ? ' on' : '')}
              style={{ background: shades.get(c.name) ?? c.hex }}
              title={c.name}
              aria-pressed={filter.colors.includes(c.name)}
              onClick={() => app.toggleFilter('colors', c.name)}
            />
          ))}
        </div>
      </section>

      <ThemeToggle />
    </aside>
  )
}
