// Saving files out of the app. Desktop: a native Save dialog plus a file write (the dialog adds the chosen path to the
// file-system scope). Browser: an <a download>. All export code goes through here.
import { isDesktop } from '../shared/desktop'

export interface FileKind {
  name: string
  extensions: string[]
}

const kindOf = (fileName: string): FileKind => {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? ''
  return { name: ext ? ext.toUpperCase() + ' file' : 'File', extensions: ext ? [ext] : ['*'] }
}

/**
 * Save `data` as `fileName`. Desktop: asks where (or writes to `existingPath` without asking) and returns the path, or
 * null if cancelled. Browser: downloads and returns `{ path: undefined }`.
 */
export async function saveFile(data: Blob | Uint8Array, fileName: string, existingPath?: string): Promise<{ path?: string; name: string } | null> {
  if (!isDesktop()) {
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart])
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: fileName }).click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return { name: fileName }
  }
  let path = existingPath
  if (!path) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const picked = await save({ defaultPath: fileName, filters: [kindOf(fileName)] })
    if (!picked) return null
    path = picked
  }
  const { writeFile } = await import('@tauri-apps/plugin-fs')
  await writeFile(path, data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data)
  return { path, name: path.split(/[\/]/).pop() ?? fileName }
}
