import { isTauri } from '@tauri-apps/api/core'

/** True inside the Tauri desktop app (Windows/macOS); false in the browser build and in tests. The only place that asks. */
export const isDesktop = (): boolean => {
  try {
    return isTauri()
  } catch {
    return false
  }
}
