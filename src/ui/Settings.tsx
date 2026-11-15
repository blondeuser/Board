import { useCallback, useEffect, useState } from 'react'
import { isDesktop } from '../shared/desktop'
import { CloseIcon } from './icons'

const gb = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : Math.max(1, Math.round(n / 1e6)) + ' MB')
const pickFolder = async () => {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const p = await open({ directory: true, multiple: false })
  return typeof p === 'string' ? p : null
}
const msg = (e: unknown) => (typeof e === 'string' && e ? e : 'Something went wrong.')
const api = () => import('../backend/api')

/** Edit > Settings… (Ctrl/Cmd+,): the Storage tab (docs/STORAGE.md). Opens on the `open-settings` window event. */
export function Settings() {
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<import('../backend/api').StorageInfo | null>(null)
  const [busy, setBusy] = useState<null | { text: string; done?: number; total?: number; cancel?: boolean }>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (isDesktop()) setInfo(await (await api()).storageInfo())
  }, [])

  useEffect(() => {
    const show = () => { setOpen(true); setError(''); void refresh() }
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); show() }
      if (e.key === 'Escape') setOpen((o) => (busy ? o : false))
    }
    window.addEventListener('open-settings', show)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('open-settings', show); window.removeEventListener('keydown', key) }
  }, [refresh, busy])

  useEffect(() => {
    if (!isDesktop()) return
    let off: (() => void) | undefined
    let gone = false
    void api().then((a) =>
      a.onStorageProgress((p) => setBusy((b) => b && { ...b, done: p.done, total: p.total, text: p.phase === 'verify' ? 'Checking the copy…' : b.text })).then((u) => (gone ? u() : (off = u))),
    )
    return () => { gone = true; off?.() }
  }, [])

  if (!open) return null
  const run = async (text: string, job: () => Promise<unknown>, cancel = false) => {
    setBusy({ text, cancel }); setError('')
    try { await job(); await refresh() } catch (e) { setError(msg(e)) } finally { setBusy(null) }
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
      <div className="modal settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <strong id="settings-title">Settings · Storage</strong>
          <button className="icon" title="Close" disabled={!!busy} onClick={() => setOpen(false)}><CloseIcon /></button>
        </header>

        {!isDesktop() && <p className="muted pad">Storage settings are in the desktop app only.</p>}

        {isDesktop() && (
          <>
            <div className="field">
              <span>Library</span>
              <p className="path">{info?.library ?? '…'}</p>
              <p className="muted small">{info ? `${gb(info.libraryBytes)} · ${info.images.toLocaleString()} images` : '…'}</p>
              <div className="actions">
                <button className="btn" disabled={!!busy} onClick={async () => { const p = await pickFolder(); if (p) void run('Copying the library…', async () => (await api()).moveLibrary(p), true) }}>Change…</button>
              </div>
              {info?.previous && (
                <p className="muted small">
                  Old library still at {info.previous[0]} ({gb(info.previous[1])}){' '}
                  <button className="link" disabled={!!busy} onClick={() => { if (confirm(`Delete the old library at ${info.previous![0]} (${gb(info.previous![1])})? This cannot be undone.`)) void run('Deleting the old library…', async () => (await api()).deleteOldLibrary()) }}>Delete old library</button>
                </p>
              )}
            </div>

            <div className="field">
              <span>Cache (thumbnails, rebuildable)</span>
              <p className="path">{info?.cache ?? '…'}</p>
              <p className="muted small">{info ? gb(info.thumbsBytes) : '…'}</p>
              <div className="actions">
                <button className="btn" disabled={!!busy} onClick={async () => { const p = await pickFolder(); if (p) void run('Moving the cache…', async () => (await api()).setCacheDir(p)) }}>Change…</button>
                <button className="btn" disabled={!!busy} onClick={() => void run('Moving the cache…', async () => (await api()).setCacheDir(null))}>Reset to default</button>
                <button className="btn" disabled={!!busy} onClick={() => { if (confirm('Delete all thumbnails and make them again from the originals?')) void run('Rebuilding thumbnails…', async () => (await api()).clearCache()) }}>Clear cache</button>
              </div>
            </div>
          </>
        )}

        {busy && (
          <div className="pad" role="status">
            <p>{busy.text}{busy.total ? ` ${busy.done} of ${busy.total}` : ''}</p>
            <div className="bo-track"><i className={busy.total ? '' : 'indeterminate'} style={busy.total ? { width: Math.round(((busy.done ?? 0) / busy.total) * 100) + '%' } : undefined} /></div>
            {busy.cancel && <div className="actions"><button className="btn" onClick={() => void api().then((a) => a.cancelMove())}>Cancel</button></div>}
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
