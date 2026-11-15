import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource/instrument-serif/latin-400-italic.css'
import './styles.css'
import { PinterestHandle } from '../ui/PinterestHandle'
import { BoStatusBar } from '../ui/BoStatusBar'
import { Settings } from '../ui/Settings'
import { LibraryMissing } from '../ui/LibraryMissing'

// Pinterest spike (docs/PINTEREST.md step 0): log what a drop carries, dev builds only.
if (import.meta.env.DEV) {
  window.addEventListener('drop', (e) => {
    const dt = e.dataTransfer
    if (!dt) return
    console.log('[drop]', JSON.stringify({ types: [...dt.types], files: dt.files.length, uri: dt.getData('text/uri-list'), plain: dt.getData('text/plain'), html: dt.getData('text/html') }))
  }, true)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PinterestHandle />
    <BoStatusBar />
    <Settings />
    <LibraryMissing />
  </StrictMode>,
)
