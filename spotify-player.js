let spotifyPlayer = null;
let spotifyDeviceId = null;

function getSpotifyTrackUri(spotifyUrl) {
  if (!spotifyUrl) return null;

  const match = spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
  if (!match) return null;

  return `spotify:track:${match[1]}`;
}

function loadSpotifySdk() {
  return new Promise((resolve) => {
    if (window.Spotify) {
      resolve();
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = resolve;

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    document.body.appendChild(script);
  });
}

async function initSpotifyPlayer() {
  const token = getSpotifyToken();

  if (!token) {
    await spotifyLogin();
    return false;
  }

  await loadSpotifySdk();

  spotifyPlayer = new Spotify.Player({
    name: "Musik Quiz Player",
    getOAuthToken: cb => cb(token),
    volume: 0.8
  });

  spotifyPlayer.addListener("ready", ({ device_id }) => {
    spotifyDeviceId = device_id;
    console.log("Spotify ready", device_id);
  });

  spotifyPlayer.addListener("initialization_error", ({ message }) => alert(message));
  spotifyPlayer.addListener("authentication_error", ({ message }) => {
    localStorage.removeItem("spotify_access_token");
    alert("Spotify login expired. Please log in again.");
  });
  spotifyPlayer.addListener("account_error", ({ message }) => {
    alert("Spotify Premium is required for in-app playback.");
  });
  spotifyPlayer.addListener("playback_error", ({ message }) => console.error(message));

  await spotifyPlayer.connect();
  return true;
}

async function playSpotifyTrackAfterCountdown(spotifyUrl) {
  const token = getSpotifyToken();

  if (!token) {
    await spotifyLogin();
    return;
  }

  if (!spotifyPlayer || !spotifyDeviceId) {
    await initSpotifyPlayer();
  }

  const trackUri = getSpotifyTrackUri(spotifyUrl);

  if (!trackUri) {
    alert("No valid Spotify track URL found for this question.");
    return;
  }

  const countdown = document.getElementById("spotifyCountdown");

  for (let i = 3; i > 0; i--) {
    if (countdown) countdown.textContent = `Playing in ${i}...`;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (countdown) countdown.textContent = "Playing";

  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      uris: [trackUri],
      position_ms: 0
    })
  });
}

async function pauseSpotifyTrack() {
  const token = getSpotifyToken();
  if (!token) return;

  await fetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}