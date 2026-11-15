import { useEffect, useState } from 'react'
import { isDesktop } from '../shared/desktop'

type Api = typeof import('../backend/api')

/** Start-up dialog when the library the settings point to is gone (unplugged drive, renamed folder). Never creates an empty library there. */
export function LibraryMissing() {
  const [missing, setMissing] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isDesktop()) void import('../backend/api').then((a) => a.storageInfo()).then((i) => setMissing(i.missing)).catch(() => {})
  }, [])

  if (!missing) return null
  const act = (job: (a: Api) => Promise<unknown>) => () =>
    void import('../backend/api').then(job).catch((e) => setError(typeof e === 'string' ? e : 'Something went wrong.'))
  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="missing-title">
        <header><strong id="missing-title">Library not found</strong></header>
        <p>REMind cannot find your library at <span className="path">{missing}</span>. Is the drive plugged in?</p>
        <div className="actions">
          <button className="btn" onClick={() => location.reload()}>Retry</button>
          <button className="btn" onClick={act(async (a) => {
            const { open } = await import('@tauri-apps/plugin-dialog')
            const p = await open({ directory: true, multiple: false })
            if (typeof p === 'string') await a.locateLibrary(p)
          })}>Locate…</button>
          <button className="btn primary" onClick={act((a) => a.useDefaultLibrary())}>Use default library</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
