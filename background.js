const STORAGE_KEY = "latestYtmTrack";
const TRACKS_BY_TAB_KEY = "ytmTracksByTab";

const shortBadgeText = (track) => {
  if (!track?.title) return "";
  const compact = track.title
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return compact.slice(0, 4) || "YTM";
};

const getTracksByTab = async () => {
  const data = await chrome.storage.local.get(TRACKS_BY_TAB_KEY);
  return data[TRACKS_BY_TAB_KEY] && typeof data[TRACKS_BY_TAB_KEY] === "object"
    ? data[TRACKS_BY_TAB_KEY]
    : {};
};

const latestFromTracksByTab = (tracksByTab) => {
  return Object.values(tracksByTab)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))[0] || null;
};

const publishTrack = async (track) => {
  await chrome.storage.local.set({ [STORAGE_KEY]: track || null });

  const badge = shortBadgeText(track);
  await chrome.action.setBadgeText({ text: badge });
  await chrome.action.setTitle({
    title: track?.title
      ? `${track.title}${track.artist ? " — " + track.artist : ""}`
      : "YTM Now Playing"
  });
};

const saveTrack = async (track, tabId) => {
  if (Number.isInteger(tabId)) {
    const tracksByTab = await getTracksByTab();
    tracksByTab[String(tabId)] = { ...track, tabId };
    await chrome.storage.local.set({ [TRACKS_BY_TAB_KEY]: tracksByTab });
  }

  await publishTrack(Number.isInteger(tabId) ? { ...track, tabId } : track);
};

const clearTabTrack = async (tabId) => {
  const tracksByTab = await getTracksByTab();
  if (!tracksByTab[String(tabId)]) return;

  delete tracksByTab[String(tabId)];
  const nextTrack = latestFromTracksByTab(tracksByTab);
  await chrome.storage.local.set({ [TRACKS_BY_TAB_KEY]: tracksByTab });
  await publishTrack(nextTrack);
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.action.setBadgeText({ text: "" });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabTrack(tabId).catch(console.error);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "YTM_NOW_PLAYING_UPDATE") {
    saveTrack(message.track, sender.tab?.id)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "YTM_NOW_PLAYING_GET_LATEST") {
    chrome.storage.local
      .get(STORAGE_KEY)
      .then((data) => sendResponse({ ok: true, track: data[STORAGE_KEY] || null }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});
