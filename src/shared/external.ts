import { isDesktop } from './desktop'

/** Open a web address outside the app: the system browser on desktop (the webview can't), a new tab in the browser build. */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return
  if (isDesktop()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank', 'noopener')
  }
}
