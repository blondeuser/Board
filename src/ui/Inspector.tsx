import type { BoardApp } from '../app/useBoardApp'
import { COLOR_FAMILIES } from '../categorize/color'
import { NOTE_TINTS, type Placement } from '../shared/types'
import { TYPE_LABELS, typeName } from '../categorize/style/labels'
import { readableOn } from '../shared/contrast'
import { TrashIcon } from './icons'

interface Props {
  app: BoardApp
  /** Images the panel edits (tags are shared by every board an image is on). */
  assetIds: string[]
  /** Selected note cards (board view only). */
  notes?: Placement[]
  count: number
  onRemove: () => void
  removeTitle: string
  /** Library view: show which boards the image is on and offer "add to board". */
  library?: boolean
}

/** Floating tag panel for the current selection. Edits apply to every selected image. */
export function Inspector({ app, assetIds, notes = [], count, onRemove, removeTitle, library }: Props) {
  if (!count) return null
  const assets = assetIds.map((id) => app.assets[id]).filter(Boolean)
  const has = (kind: 'colors' | 'categoryIds', v: string) => assets.length > 0 && assets.every((a) => a[kind].includes(v))
  const hasType = (v: string) => assets.length > 0 && assets.every((a) => a.types?.includes(v))
  const typesOn = [...new Set(assets.flatMap((a) => a.types ?? []))]
  const detecting = assets.some((a) => a.types === undefined)
  const palette = assets.length === 1 ? assets[0].palette : []
  const boardNames = library
    ? app.boards.filter((b) => app.allPlacements.some((p) => p.boardId === b.id && assetIds.includes(p.assetId))).map((b) => b.name)
    : []

  return (
    <div className="inspector" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <header>
        <strong>{count === 1 ? (notes.length ? 'Note' : 'Image') : `${count} ${notes.length ? 'cards' : 'images'}`}</strong>
        <button className="icon" title={removeTitle} onClick={onRemove}>
          <TrashIcon />
        </button>
      </header>

      {palette.length > 0 && (
        <div className="palette" title="Extracted palette">
          {palette.map((c) => <i key={c.hex} style={{ background: c.hex, flexGrow: c.share }} title={c.hex} />)}
        </div>
      )}

      {library && (
        <>
          <h3>Boards</h3>
          <p className="boards-line">{boardNames.length ? boardNames.join(', ') : <span className="muted">Not on any board</span>}</p>
          <select
            className="add-type wide"
            value=""
            aria-label="Add to board"
            onChange={(e) => e.target.value && app.addToBoard(assetIds, e.target.value)}
          >
            <option value="">+ Add to board</option>
            {app.boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </>
      )}

      {notes.length > 0 && (
        <>
          <h3>Note colour</h3>
          <div className="tints">
            {NOTE_TINTS.map((t) => (
              <button key={t} className={'swatch' + (notes.every((n) => n.tint === t) ? ' on' : '')} style={{ background: t }} title="Tint" onClick={() => app.setTint(notes.map((n) => n.id), t)} />
            ))}
          </div>
        </>
      )}

      {assets.length > 0 && (
        <>
          <h3>Colour</h3>
          <div className="swatches">
            {COLOR_FAMILIES.map((c) => (
              <button
                key={c.name}
                className={'swatch' + (has('colors', c.name) ? ' on' : '')}
                style={{ background: c.hex }}
                title={c.name}
                aria-pressed={has('colors', c.name)}
                onClick={() => app.toggleTag(assetIds, 'colors', c.name)}
              />
            ))}
          </div>

          <h3>Type</h3>
          <div className="chips">
            {typesOn.map((t) => (
              <button key={t} className="chip plain on" title="Remove" onClick={() => app.toggleTag(assetIds, 'types', t)}>
                {typeName(t)}{hasType(t) ? '' : ' *'} ×
              </button>
            ))}
            {detecting && <span className="muted">Detecting…</span>}
            <select
              className="add-type"
              value=""
              aria-label="Add type"
              onChange={(e) => e.target.value && app.toggleTag(assetIds, 'types', e.target.value)}
            >
              <option value="">+ Type</option>
              {TYPE_LABELS.filter((t) => !hasType(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <h3>Categories</h3>
          <div className="chips">
            {app.categories.map((c) => (
              <button
                key={c.id}
                className={'chip' + (has('categoryIds', c.id) ? ' on' : '')}
                style={{ '--c': c.color, '--on-chip': readableOn(c.color) } as React.CSSProperties}
                aria-pressed={has('categoryIds', c.id)}
                onClick={() => app.toggleTag(assetIds, 'categoryIds', c.id)}
              >
                {c.name}
              </button>
            ))}
            {!app.categories.length && <span className="muted">Add categories in the sidebar</span>}
          </div>
        </>
      )}
    </div>
  )
}
