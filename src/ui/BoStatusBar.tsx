import { useEffect, useState } from 'react'
import { isDesktop } from '../shared/desktop'

/** Bottom status bar while a .bo is being opened or exported: label + image count + progress bar. */
export function BoStatusBar() {
  const [label, setLabel] = useState<string | null>(null)
  const [p, setP] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    const onBusy = (e: Event) => { setLabel((e as CustomEvent<string | null>).detail); setP(null) }
    window.addEventListener('bo-busy', onBusy)
    let off: (() => void) | undefined
    let gone = false
    if (isDesktop()) void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<{ done: number; total: number }>('bo-progress', (e) => setP(e.payload)).then((u) => (gone ? u() : (off = u))),
    )
    return () => { window.removeEventListener('bo-busy', onBusy); gone = true; off?.() }
  }, [])

  if (!label) return null
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : null
  return (
    <div className="bo-progress" role="status" aria-live="polite">
      <span>{label}{p ? <> <em>{p.done} of {p.total} images</em></> : '…'}</span>
      <div className="bo-track"><i className={pct === null ? 'indeterminate' : ''} style={pct === null ? undefined : { width: pct + '%' }} /></div>
    </div>
  )
}
