# YouTube Music Now Playing

Minimal Chrome/Edge Manifest V3 extension that reads the current song from a YouTube Music tab or PWA and shows it in an extension popup.

## What it does

- Watches the YouTube Music player bar for changes on `https://music.youtube.com/*`.
- Injects a small read bridge into ordinary tabs.
- Stores the latest detected track in extension storage.
- Exposes the latest track to ordinary tabs through `window.postMessage`.
- Shows the title, artist, album, artwork, and play/pause state in the popup.
- Also sets a small extension badge based on the current track title.

## Install locally

1. Unzip this folder.
2. Open Chrome or Edge.
3. Go to `chrome://extensions` or `edge://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the unzipped `ytm-now-playing-extension` folder.
7. Open or refresh YouTube Music in the same browser profile.
8. Start playing a song.
9. Click the extension icon.

## PWA note

The YouTube Music PWA is still a Chrome/Edge app window for `music.youtube.com`. The extension can see it if:

- the PWA was installed/opened from the same browser profile;
- the extension is installed in that same profile;
- the PWA page is refreshed/reopened after installing the extension.

If the popup says "No track found yet", close and reopen the PWA or press `Ctrl+R` inside it.

## Page bridge

The extension injects a small bridge into normal web pages so pages can request the current track:

```js
window.postMessage({ source: "YTM_NOW_PLAYING_PAGE", type: "YTM_NOW_PLAYING_GET_LATEST" }, "*");

window.addEventListener("message", (event) => {
  if (event.data?.source !== "YTM_NOW_PLAYING_EXTENSION") return;
  if (event.data?.type !== "YTM_NOW_PLAYING_TRACK") return;
  console.log(event.data.track);
});
```

The track payload includes `title`, `artist`, `album`, `artwork`, `currentTime`, `duration`, `isPlaying`, and `updatedAt`.

## Troubleshooting

YouTube Music changes its HTML occasionally. If the extension stops finding tracks, open the PWA DevTools console and inspect `ytmusic-player-bar`; the selectors in `content.js` may need small adjustments.

The current selectors try:

- `ytmusic-player-bar`
- `yt-formatted-string.title`
- `.title.ytmusic-player-bar`
- `yt-formatted-string.byline`
- `.byline.ytmusic-player-bar`

## Files

- `manifest.json` — extension manifest.
- `content.js` — reads YouTube Music DOM, sends updates, and exposes the page bridge.
- `background.js` — stores latest track and updates badge.
- `popup.html` / `popup.css` / `popup.js` — popup UI.
