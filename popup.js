const $ = (id) => document.getElementById(id);

const state = {
  latest: null
};

const formatTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const showTrack = (track) => {
  state.latest = track || null;

  $("debug").textContent = "";

  if (!track) {
    $("empty").classList.remove("hidden");
    $("track").classList.add("hidden");
    return;
  }

  $("empty").classList.add("hidden");
  $("track").classList.remove("hidden");

  $("title").textContent = track.title || "Unknown title";
  $("artist").textContent = track.artist || "Unknown artist";
  $("album").textContent = track.album ? `Album: ${track.album}` : "";

  const playing =
    track.isPlaying === true
      ? "Playing"
      : track.isPlaying === false
        ? "Paused"
        : "Playback state unknown";

  $("status").textContent = `${playing} · Updated ${formatTime(track.updatedAt)}`;

  if (track.artwork) {
    $("artwork").src = track.artwork;
    $("artwork").classList.remove("hidden");
  } else {
    $("artwork").classList.add("hidden");
  }
};

const getLatest = () => {
  chrome.runtime.sendMessage({ type: "YTM_NOW_PLAYING_GET_LATEST" }, (response) => {
    if (chrome.runtime.lastError) {
      $("debug").textContent = chrome.runtime.lastError.message;
      showTrack(null);
      return;
    }

    if (!response?.ok) {
      $("debug").textContent = response?.error || "Could not read latest track.";
      showTrack(null);
      return;
    }

    showTrack(response.track);
  });
};

$("refresh").addEventListener("click", getLatest);

$("copy").addEventListener("click", async () => {
  if (!state.latest) {
    $("debug").textContent = "Nothing to copy yet.";
    return;
  }

  const text = [
    state.latest.title,
    state.latest.artist ? `— ${state.latest.artist}` : ""
  ].filter(Boolean).join(" ");

  await navigator.clipboard.writeText(text);
  $("debug").textContent = "Copied.";
});

getLatest();
