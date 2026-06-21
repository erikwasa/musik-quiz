let spotifyPlayer = null;
let spotifyDeviceId = null;
let spotifyReadyPromise = null;

function getSpotifyTrackUri(spotifyUrl) {
  if (!spotifyUrl) return null;

  const match = spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
  if (!match) return null;

  return `spotify:track:${match[1]}`;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    })
  ]);
}

function loadSpotifySdk() {
  return new Promise((resolve, reject) => {
    if (window.Spotify) {
      resolve();
      return;
    }

    const existingScript = document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]');

    window.onSpotifyWebPlaybackSDKReady = () => {
      resolve();
    };

    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.onerror = () => {
      reject(new Error("Spotify SDK kunde inte laddas. Prova annan webbläsare eller stäng av innehållsblockerare."));
    };

    document.body.appendChild(script);
  });
}

function getSpotifyApiErrorMessage(status, data) {
  const spotifyMessage = data?.error?.message || data?.error_description || data?.error;

  if (status === 401) {
    return "Spotify-inloggningen har gått ut. Logga in igen.";
  }

  if (status === 403) {
    return "Spotify nekade uppspelning. Kontrollera att kontot har Spotify Premium och att enheten kan styras.";
  }

  if (status === 404) {
    return "Spotify hittar ingen aktiv spelare. Öppna Spotify-appen en gång och prova igen.";
  }

  if (status === 429) {
    return "Spotify säger att appen gör för många anrop just nu. Vänta lite och prova igen.";
  }

  return spotifyMessage || `Spotify-fel ${status}`;
}

async function spotifyApi(path, options = {}) {
  const token = getSpotifyToken();

  if (!token) {
    throw new Error("Du är inte inloggad i Spotify.");
  }

  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(getSpotifyApiErrorMessage(response.status, data));
  }

  return data;
}

async function initSpotifyPlayer() {
  const token = getSpotifyToken();

  if (!token) {
    setSpotifyStatus("Du behöver logga in i Spotify först.", "warning");
    await spotifyLogin();
    return false;
  }

  if (spotifyPlayer && spotifyDeviceId) {
    return true;
  }

  setSpotifyStatus("Startar Spotify-spelaren...", "warning");

  try {
    await withTimeout(
      loadSpotifySdk(),
      10000,
      "Spotify SDK laddades inte. Prova Chrome, Safari, Edge eller Firefox utan innehållsblockerare."
    );

    spotifyReadyPromise = new Promise((resolve, reject) => {
      spotifyPlayer = new Spotify.Player({
        name: "Musik Quiz Player",
        getOAuthToken: cb => cb(getSpotifyToken()),
        volume: 0.8
      });

      spotifyPlayer.addListener("ready", ({ device_id }) => {
        spotifyDeviceId = device_id;
        setSpotifyStatus("Spotify-spelaren är redo.", "success");
        resolve(true);
      });

      spotifyPlayer.addListener("not_ready", ({ device_id }) => {
        if (spotifyDeviceId === device_id) {
          spotifyDeviceId = null;
        }

        setSpotifyStatus("Spotify-spelaren tappade anslutningen. Prova igen.", "warning");
      });

      spotifyPlayer.addListener("initialization_error", ({ message }) => {
        reject(new Error(`Spotify kunde inte startas: ${message}`));
      });

      spotifyPlayer.addListener("authentication_error", ({ message }) => {
        localStorage.removeItem("spotify_access_token");
        localStorage.removeItem("spotify_token_expires_at");
        reject(new Error(`Spotify-inloggningen har gått ut: ${message}`));
      });

      spotifyPlayer.addListener("account_error", ({ message }) => {
        reject(new Error(`Spotify-kontot kan inte spela här. Kräver Spotify Premium. ${message}`));
      });

      spotifyPlayer.addListener("playback_error", ({ message }) => {
        setSpotifyStatus(`Spotify kunde inte spela låten: ${message}`, "error");
      });

      spotifyPlayer.addListener("autoplay_failed", () => {
        setSpotifyStatus("Spotify blockerade automatisk uppspelning. Tryck på Spela i denna telefon igen.", "warning");
      });
    });

    const connected = await spotifyPlayer.connect();

    if (!connected) {
      throw new Error("Spotify-spelaren kunde inte ansluta.");
    }

    await withTimeout(
      spotifyReadyPromise,
      15000,
      "Spotify-spelaren blev inte redo. Prova att öppna Spotify-appen en gång och försök igen."
    );

    return Boolean(spotifyDeviceId);
  } catch (error) {
    setSpotifyStatus(error.message, "error");
    return false;
  }
}

async function playSpotifyTrackAfterCountdown(spotifyUrl) {
  const token = getSpotifyToken();

  if (!token) {
    setSpotifyStatus("Du är inte inloggad i Spotify. Du skickas till Spotify-inloggningen nu.", "warning");
    await spotifyLogin();
    return;
  }

  const trackUri = getSpotifyTrackUri(spotifyUrl);

  if (!trackUri) {
    setSpotifyStatus("Låten saknar en giltig Spotify-länk.", "error");
    return;
  }

  const countdown = document.getElementById("spotifyCountdown");

  try {
    const isReady = await initSpotifyPlayer();

    if (!isReady || !spotifyDeviceId) {
      setSpotifyStatus("Spotify-spelaren är inte redo än. Prova att trycka igen.", "warning");
      return;
    }

    if (spotifyPlayer?.activateElement) {
      await spotifyPlayer.activateElement();
    }

    setSpotifyStatus("Ansluter uppspelning till denna telefon...", "warning");

    await spotifyApi("/me/player", {
      method: "PUT",
      body: JSON.stringify({
        device_ids: [spotifyDeviceId],
        play: false
      })
    });

    await wait(600);

    for (let i = 3; i > 0; i--) {
      if (countdown) countdown.textContent = `Spelar om ${i}...`;
      setSpotifyStatus(`Spotify är redo. Spelar om ${i}...`, "warning");
      await wait(1000);
    }

    if (countdown) countdown.textContent = "Spelar";

    await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`, {
      method: "PUT",
      body: JSON.stringify({
        uris: [trackUri],
        position_ms: 0
      })
    });

    setSpotifyStatus("Spelar i denna telefon.", "success");
  } catch (error) {
    if (countdown) countdown.textContent = "";
    setSpotifyStatus(error.message, "error");
  }
}

async function pauseSpotifyTrack() {
  try {
    const token = getSpotifyToken();

    if (!token) {
      setSpotifyStatus("Du är inte inloggad i Spotify.", "warning");
      return;
    }

    await spotifyApi("/me/player/pause", {
      method: "PUT"
    });

    setSpotifyStatus("Spotify är pausat.", "success");
  } catch (error) {
    setSpotifyStatus(error.message, "error");
  }
}