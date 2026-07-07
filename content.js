(() => {
  const EXTENSION_NAME = "YTM Now Playing";
  const STORAGE_KEY = "latestYtmTrack";
  const PAGE_SOURCE = "YTM_NOW_PLAYING_EXTENSION";
  const PAGE_REQUEST_SOURCE = "YTM_NOW_PLAYING_PAGE";
  const isYoutubeMusic = location.hostname === "music.youtube.com";

  const clean = (value) =>
    (value || "")
      .replace(/\s+/g, " ")
      .replace(/\u200b/g, "")
      .trim();

  const postTrackToPage = (track) => {
    window.postMessage(
      {
        source: PAGE_SOURCE,
        type: "YTM_NOW_PLAYING_TRACK",
        track: track || null
      },
      "*"
    );
  };

  const readLatestTrack = async () => {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || null;
  };

  const startPageBridge = () => {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.source !== PAGE_REQUEST_SOURCE) return;
      if (event.data?.type !== "YTM_NOW_PLAYING_GET_LATEST") return;

      readLatestTrack()
        .then(postTrackToPage)
        .catch(() => postTrackToPage(null));
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) return;
      postTrackToPage(changes[STORAGE_KEY].newValue || null);
    });

    readLatestTrack()
      .then(postTrackToPage)
      .catch(() => {});
  };

  const firstText = (root, selectors) => {
    for (const selector of selectors) {
      const el = root?.querySelector?.(selector);
      const text = clean(el?.textContent);
      if (text) return text;
      const title = clean(el?.getAttribute?.("title"));
      if (title) return title;
      const aria = clean(el?.getAttribute?.("aria-label"));
      if (aria) return aria;
    }
    return "";
  };

  const firstAttr = (root, selectors, attr) => {
    for (const selector of selectors) {
      const el = root?.querySelector?.(selector);
      const value = clean(el?.getAttribute?.(attr));
      if (value) return value;
    }
    return "";
  };

  const parseDocumentTitle = () => {
    // Usually looks like: "Song Name - YouTube Music"
    const raw = clean(document.title);
    const suffix = " - YouTube Music";
    if (raw.endsWith(suffix)) return clean(raw.slice(0, -suffix.length));
    return "";
  };

  const getMediaSessionTrack = () => {
    try {
      const metadata = navigator.mediaSession?.metadata;
      if (!metadata) return null;

      const artwork =
        Array.isArray(metadata.artwork) && metadata.artwork.length
          ? metadata.artwork[metadata.artwork.length - 1]?.src || ""
          : "";

      const title = clean(metadata.title);
      const artist = clean(metadata.artist);
      const album = clean(metadata.album);

      if (!title && !artist && !album) return null;

      return {
        source: "mediaSession",
        title,
        artist,
        album,
        artwork
      };
    } catch {
      return null;
    }
  };

  // The underlying <video>/<audio> element keeps ticking every second (that part
  // is reliable), but on gapless/mix playback it can keep counting from where the
  // previous track left off instead of resetting to 0 for the new track. Anchor
  // each track to the raw currentTime observed when it was first seen, and report
  // progress relative to that anchor.
  let trackAnchor = null; // { key, baseTime }

  const getPlaybackProgress = (trackKey) => {
    const media = document.querySelector("video, audio");
    const mediaCurrentTime = Number(media?.currentTime);
    const mediaDuration = Number(media?.duration);

    if (Number.isFinite(mediaCurrentTime)) {
      if (!trackAnchor || trackAnchor.key !== trackKey || mediaCurrentTime < trackAnchor.baseTime) {
        trackAnchor = { key: trackKey, baseTime: mediaCurrentTime };
      }

      const relativeCurrentTime = Math.max(0, mediaCurrentTime - trackAnchor.baseTime);
      const duration = Number.isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : 0;
      return {
        currentTime: relativeCurrentTime,
        duration
      };
    }

    const slider = document.querySelector(
      "#progress-bar, tp-yt-paper-slider#progress-bar, ytmusic-player-bar tp-yt-paper-slider"
    );
    const valueNow = Number(slider?.getAttribute?.("aria-valuenow"));
    const valueMax = Number(slider?.getAttribute?.("aria-valuemax"));
    if (Number.isFinite(valueMax) && valueMax > 0) {
      return {
        currentTime: Number.isFinite(valueNow) ? valueNow : 0,
        duration: valueMax
      };
    }

    return {
      currentTime: null,
      duration: null
    };
  };

  const getDomTrack = () => {
    const player =
      document.querySelector("ytmusic-player-bar") ||
      document.querySelector("tp-yt-paper-toast") ||
      document;

    const title =
      firstText(player, [
        "yt-formatted-string.title",
        ".title.ytmusic-player-bar",
        ".content-info-wrapper .title",
        "#song-title",
        ".song-title",
        "[title]"
      ]) || parseDocumentTitle();

    const byline = firstText(player, [
      "yt-formatted-string.byline",
      ".byline.ytmusic-player-bar",
      ".content-info-wrapper .byline",
      ".subtitle",
      "#byline"
    ]);

    const artistLinks = [...player.querySelectorAll(
      "yt-formatted-string.byline a, .byline a, .subtitle a"
    )]
      .map((a) => clean(a.textContent))
      .filter(Boolean);

    const artist =
      artistLinks[0] ||
      clean(byline.split(/[•·]/)[0]) ||
      byline;

    const album =
      artistLinks.length > 1
        ? artistLinks[1]
        : clean(byline.split(/[•·]/)[1]) || "";

    const artwork =
      firstAttr(player, [
        "img.image.ytmusic-player-bar",
        "yt-img-shadow img",
        "img"
      ], "src");

    const playPauseButton = player.querySelector(
      "tp-yt-paper-icon-button.play-pause-button, #play-pause-button, .play-pause-button"
    );
    const aria = clean(playPauseButton?.getAttribute?.("aria-label"));
    // In YouTube-style media controls, the button often describes the action,
    // so aria "Pause" means currently playing, and "Play" means currently paused.
    const isPlaying =
      aria ? /pause/i.test(aria) : undefined;

    if (!title && !artist && !album) return null;

    return {
      source: "dom",
      title,
      artist,
      album,
      artwork,
      isPlaying
    };
  };

  const getCurrentTrack = () => {
    const dom = getDomTrack();
    const media = getMediaSessionTrack();

    // DOM is usually more reliable in content scripts; Media Session is useful fallback.
    const title = dom?.title || media?.title || "";
    const artist = dom?.artist || media?.artist || "";
    const album = dom?.album || media?.album || "";
    const artwork = dom?.artwork || media?.artwork || "";
    const progress = getPlaybackProgress(`${title}::${artist}::${album}`);

    if (!title && !artist && !album) return null;

    return {
      title,
      artist,
      album,
      artwork,
      currentTime: progress.currentTime,
      duration: progress.duration,
      isPlaying: dom?.isPlaying,
      source: dom?.source || media?.source || "unknown",
      url: location.href,
      documentTitle: document.title,
      updatedAt: new Date().toISOString()
    };
  };

  let lastKey = "";

  const sendTrack = (reason = "poll") => {
    const track = getCurrentTrack();
    if (!track) return;

    const key = JSON.stringify({
      title: track.title,
      artist: track.artist,
      album: track.album,
      isPlaying: track.isPlaying,
      currentTime: Number.isFinite(track.currentTime) ? Math.floor(track.currentTime) : null,
      duration: Number.isFinite(track.duration) ? Math.floor(track.duration) : null
    });

    if (key === lastKey && reason !== "manual") return;
    lastKey = key;

    chrome.runtime.sendMessage({
      type: "YTM_NOW_PLAYING_UPDATE",
      track
    }).catch(() => {
      // This can happen while the extension is reloading. Safe to ignore.
    });

    console.debug(`[${EXTENSION_NAME}]`, track);
  };

  const start = () => {
    sendTrack("initial");

    const root = document.querySelector("ytmusic-player-bar") || document.body || document.documentElement;

    const observer = new MutationObserver(() => {
      sendTrack("mutation");
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label", "src"]
    });

    setInterval(() => sendTrack("interval"), 1000);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "YTM_NOW_PLAYING_FORCE_READ") {
        const track = getCurrentTrack();
        sendResponse({ ok: true, track });
        sendTrack("manual");
        return true;
      }
      return false;
    });
  };

  startPageBridge();

  if (isYoutubeMusic) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }
})();
