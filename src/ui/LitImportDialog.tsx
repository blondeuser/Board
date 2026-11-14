import { useEffect, useMemo } from 'react'
import type { LitImport, PerProject } from '../app/useLitImport'
import { CloseIcon } from './icons'

const PER_PROJECT: [PerProject, string][] = [[1, '1'], [3, '3'], [6, '6'], [0, 'All']]
/** Average photos per LIT project (2025 sample), for the size estimate when "All" is picked. */
const AVG_PHOTOS = 11

/** File > Import from LIT Awards…: edition + categories → progress → summary. */
export function LitImportDialog({ lit, onShowLibrary }: { lit: LitImport; onShowLibrary: () => void }) {
  const { phase, index, picked, progress } = lit

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && lit.close()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [lit])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    index?.entries.forEach((e) => e.categories.forEach((c) => m.set(c, (m.get(c) ?? 0) + 1)))
    return m
  }, [index])

  if (!lit.visible) return null
  const onPage = index ? picked.filter((c) => counts.has(c)) : []
  const projects = lit.chosen.length
  const photos = projects * (lit.perProject || AVG_PHOTOS)
  const toggle = (c: string) => lit.setCategories(picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c])
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && phase !== 'running' && lit.close()}>
      <div className="modal lit" role="dialog" aria-modal="true" aria-labelledby="lit-title">
        <header>
          <strong id="lit-title">Import from LIT Awards</strong>
          <button className="icon" title={phase === 'running' ? 'Hide (import keeps running)' : 'Close'} onClick={lit.close}><CloseIcon /></button>
        </header>

        {phase === 'loading' && <p className="muted pad">Loading winners…</p>}

        {phase === 'error' && (
          <div className="pad">
            <p>{lit.error}</p>
            <div className="actions">
              <button className="btn" onClick={lit.close}>Close</button>
              <button className="btn primary" onClick={() => void lit.load(index?.edition)}>Try again</button>
            </div>
          </div>
        )}

        {phase === 'ready' && index && (
          <>
            <label className="field">
              <span>Edition</span>
              <select value={index.edition} onChange={(e) => void lit.load(e.target.value)}>
                {index.editions.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </label>

            <div className="field">
              <span>
                Categories
                <button className="link" onClick={() => lit.setCategories([...new Set([...picked, ...index.categories])])}>All</button>
                <button className="link" onClick={() => lit.setCategories(picked.filter((c) => !counts.has(c)))}>None</button>
              </span>
              <div className="checklist">
                {index.categories.map((c) => (
                  <label key={c} className={picked.includes(c) ? 'on' : ''}>
                    <input type="checkbox" checked={picked.includes(c)} onChange={() => toggle(c)} />
                    <span>{c}</span>
                    <span className="muted">{counts.get(c)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Photos per project</span>
              <div className="segmented" role="radiogroup" aria-label="Photos per project">
                {PER_PROJECT.map(([v, label]) => (
                  <button key={label} role="radio" aria-checked={lit.perProject === v} className={lit.perProject === v ? 'on' : ''} onClick={() => lit.setPerProject(v)}>{label}</button>
                ))}
              </div>
            </div>

            <label className="check">
              <input type="checkbox" checked={lit.makeBoard} onChange={(e) => lit.setMakeBoard(e.target.checked)} />
              Also put them on a new board
            </label>

            <p className="muted small">
              {projects ? `${projects} project${projects === 1 ? '' : 's'}, ${lit.perProject ? '' : 'about '}${photos} photos` : 'Pick at least one category'}
              {' · '}Photographer credits are saved with each photo.
            </p>

            <div className="actions">
              <button className="btn" onClick={lit.close}>Cancel</button>
              <button className="btn primary" disabled={!projects || !onPage.length} onClick={() => void lit.start()}>
                Import {projects || ''} project{projects === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}

        {(phase === 'running' || phase === 'done') && (
          <div className="pad">
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
            <p>
              {phase === 'running' ? <>Project {Math.min(progress.done + 1, progress.total)} of {progress.total}: <strong>{progress.current}</strong></> : `Done: ${progress.done} of ${progress.total} projects`}
            </p>
            <p className="muted small">
              {progress.imported} new · {progress.skipped} already in library{progress.failed ? ` · ${progress.failed} failed` : ''}
            </p>
            <div className="actions">
              {phase === 'running' ? (
                <>
                  <button className="btn" onClick={lit.close}>Hide</button>
                  <button className="btn" onClick={lit.stop}>Stop</button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={() => void lit.load(index?.edition)}>Import more</button>
                  <button className="btn primary" onClick={() => { lit.close(); onShowLibrary() }}>Show in Library</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
