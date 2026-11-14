// Opens a URL outside the game.
//
// Native (Tauri) builds hand it to the system browser through the opener
// plugin — navigating the game's own WebView would replace the game with the
// page, with no way back. Web builds open a new tab. (Not the shell plugin:
// its JS `open()` runs the desktop `open` crate and is a no-op on Android.)
//
// The plugin import sits behind the build-time `VITE_APP_NATIVE` literal, so
// web bundles never contain it (tests/platforms/bundlePurity.test.ts).
export const openExternal = async (url: string): Promise<void> => {
  if (import.meta.env.VITE_APP_NATIVE === 'true') {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return
  }
  window.open(url, '_blank', 'noopener')
}
