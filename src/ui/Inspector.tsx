import type { BoardApp } from '../app/useBoardApp'
import { COLOR_FAMILIES } from '../categorize/color'
import { openExternal } from '../shared/external'
import { DEFAULT_TEXT_FORMAT, NOTE_GREYS, NOTE_TINTS, TEXT_COLORS, TEXT_FONTS, TEXT_SIZES, type Placement, type TextFormat } from '../shared/types'
import { ALL_TYPE_LABELS, typeName } from '../categorize/style/labels'
import { readableOn } from '../shared/contrast'
import { DownloadIcon, TrashIcon } from './icons'

interface Props {
  app: BoardApp
  /** Images the panel edits (tags are shared by every board an image is on). */
  assetIds: string[]
  /** Selected note cards (board view only). */
  notes?: Placement[]
  /** Selected shapes (board view only); they have a colour but no tags. */
  shapes?: Placement[]
  /** Selected plain text items (board view only). */
  texts?: Placement[]
  count: number
  onRemove: () => void
  removeTitle: string
  /** Library view: show which boards the image is on and offer "add to board". */
  library?: boolean
}

/** Floating tag panel for the current selection. Edits apply to every selected image. */
export function Inspector({ app, assetIds, notes = [], shapes = [], texts = [], count, onRemove, removeTitle, library }: Props) {
  if (!count) return null
  const assets = assetIds.map((id) => app.assets[id]).filter(Boolean)
  const has = (kind: 'colors' | 'categoryIds', v: string) => assets.length > 0 && assets.every((a) => a[kind].includes(v))
  const hasType = (v: string) => assets.length > 0 && assets.every((a) => a.types?.includes(v))
  const typesOn = [...new Set(assets.flatMap((a) => a.types ?? []))]
  const detecting = assets.some((a) => a.types === undefined)
  const tinted = [...notes, ...shapes]
  const fmts = texts.map((t) => t.fmt ?? DEFAULT_TEXT_FORMAT)
  const same = <K extends keyof TextFormat>(k: K, v: TextFormat[K]) => fmts.every((f) => f[k] === v)
  const setFmt = (patch: Partial<TextFormat>) => app.setTextFormat(texts.map((t) => t.id), patch)
  const palette = assets.length === 1 ? assets[0].palette : []
  const source = assets.length === 1 ? assets[0].source : undefined
  const boardNames = library
    ? app.boards.filter((b) => app.allPlacements.some((p) => p.boardId === b.id && assetIds.includes(p.assetId))).map((b) => b.name)
    : []

  return (
    <div className="inspector" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <header>
        <strong>{count === 1 ? (notes.length ? 'Note' : shapes.length ? 'Shape' : texts.length ? 'Text' : 'Image') : `${count} ${notes.length || shapes.length || texts.length ? 'cards' : 'images'}`}</strong>
        <span className="row">
        <button className="icon" title="Export as JPEG" disabled={!assetIds.length} onClick={() => void app.exportJpeg(assetIds)}>
          <DownloadIcon />
        </button>
        <button className="icon" title={removeTitle} onClick={onRemove}>
          <TrashIcon />
        </button>
        </span>
      </header>

      {palette.length > 0 && (
        <div className="palette" title="Extracted palette">
          {palette.map((c) => <i key={c.hex} style={{ background: c.hex, flexGrow: c.share }} title={c.hex} />)}
        </div>
      )}

      {source && (
        <>
          <h3>Source</h3>
          <p className="source-title">
            <a href={source.url} target="_blank" rel="noreferrer" title={`Open on ${source.site}`} onClick={(e) => { e.preventDefault(); void openExternal(source.url) }}>{source.title || source.site}</a>
          </p>
          {source.categories?.length ? <p className="muted source-cats">{source.categories.join(' · ')}</p> : null}
          <dl className="source-details">
            {Object.entries(source.details ?? {}).filter(([k]) => k !== 'Project website').map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
            {source.credit && <div><dt>Photo</dt><dd>{source.credit}</dd></div>}
          </dl>
        </>
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

      {texts.length > 0 && (
        <>
          <h3>Text</h3>
          <div className="chips">
            <select className="add-type" aria-label="Font" value={same('font', fmts[0].font) ? fmts[0].font : ''} onChange={(e) => e.target.value && setFmt({ font: e.target.value })}>
              {!same('font', fmts[0].font) && <option value="">Mixed</option>}
              {Object.entries(TEXT_FONTS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
            </select>
            <select className="add-type" aria-label="Size" value={same('size', fmts[0].size) ? fmts[0].size : ''} onChange={(e) => e.target.value && setFmt({ size: Number(e.target.value) })}>
              {!same('size', fmts[0].size) && <option value="">Mixed</option>}
              {[...new Set([...TEXT_SIZES, fmts[0].size])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="chips">
            <button className={'chip plain' + (same('bold', true) ? ' on' : '')} aria-pressed={same('bold', true)} title="Bold" onClick={() => setFmt({ bold: !same('bold', true) })}><b>B</b></button>
            <button className={'chip plain' + (same('italic', true) ? ' on' : '')} aria-pressed={same('italic', true)} title="Italic" onClick={() => setFmt({ italic: !same('italic', true) })}><i>I</i></button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={'chip plain' + (same('align', a) ? ' on' : '')} aria-pressed={same('align', a)} title={'Align ' + a} onClick={() => setFmt({ align: a })}>{a[0].toUpperCase()}</button>
            ))}
          </div>
          <h3>Text colour</h3>
          <div className="tints">
            {TEXT_COLORS.map((c) => (
              <button key={c} className={'swatch' + (same('color', c) ? ' on' : '')} style={{ background: c === 'auto' ? 'var(--text)' : c }} title={c === 'auto' ? 'Theme text colour' : c} onClick={() => setFmt({ color: c })} />
            ))}
          </div>
        </>
      )}

      {tinted.length > 0 && (
        <>
          <h3>{notes.length ? 'Note colour' : 'Shape colour'}</h3>
          <div className="tints">
            {(notes.length ? NOTE_GREYS : NOTE_TINTS).map((t) => (
              <button key={t} className={'swatch' + (tinted.every((n) => n.tint === t) ? ' on' : '')} style={{ background: t }} title="Tint" onClick={() => app.setTint(tinted.map((n) => n.id), t)} />
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
              {ALL_TYPE_LABELS.filter((t) => !hasType(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <h3>Tags</h3>
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
            {!app.categories.length && <span className="muted">Add tags from the Tags menu</span>}
          </div>
        </>
      )}
    </div>
  )
}
