import { useState } from 'react'
import type { BoardApp } from '../app/useBoardApp'
import { COLOR_FAMILIES } from '../categorize/color'
import { TYPE_LABELS } from '../categorize/style/labels'
import { CloseIcon, PlusIcon, GridIcon } from './icons'
import { ThemeToggle } from './ThemeToggle'

export function Sidebar({ app }: { app: BoardApp }) {
  const { boards, activeId, categories, filter } = app
  const [editing, setEditing] = useState('')
  const [adding, setAdding] = useState(false)
  const hasFilter = filter.colors.length + filter.categories.length + filter.types.length > 0
  const used = new Set(Object.values(app.assets).flatMap((a) => a.types ?? []))
  const typesInUse = TYPE_LABELS.filter((t) => used.has(t.id))

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
          <button className="icon" title="New board" onClick={app.addBoard}><PlusIcon /></button>
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
                    if (confirm(`Delete "${b.name}" and its images?`)) app.removeBoard(b.id)
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
              style={{ background: c.hex }}
              title={c.name}
              aria-pressed={filter.colors.includes(c.name)}
              onClick={() => app.toggleFilter('colors', c.name)}
            />
          ))}
        </div>
      </section>

      {typesInUse.length > 0 && (
        <section>
          <header>
            <h2>Type</h2>
          </header>
          <div className="chips pad">
            {typesInUse.map((t) => (
              <button key={t.id} className={'chip plain' + (filter.types.includes(t.id) ? ' on' : '')} aria-pressed={filter.types.includes(t.id)} onClick={() => app.toggleFilter('types', t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <header>
          <h2>Categories</h2>
          <button className="icon" title="New category" onClick={() => setAdding(true)}><PlusIcon /></button>
        </header>
        <ul className="list">
          {categories.map((c) => (
            <li key={c.id} className={filter.categories.includes(c.id) ? 'active' : ''} onClick={() => app.toggleFilter('categories', c.id)}>
              <i className="dot" style={{ background: c.color }} />
              <span className="name">{c.name}</span>
              <button
                className="icon small hover"
                title="Delete category"
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Delete category "${c.name}"? Images keep their other tags.`)) app.removeCategory(c.id)
                }}
              >
                <CloseIcon />
              </button>
            </li>
          ))}
          {adding && (
            <li>
              <input
                autoFocus
                placeholder="Category name"
                onBlur={(e) => { app.addCategory(e.target.value); setAdding(false) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = ''; e.currentTarget.blur() } }}
              />
            </li>
          )}
        </ul>
      </section>
      <ThemeToggle />
    </aside>
  )
}
