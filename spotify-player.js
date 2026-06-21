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
      reject(new Error("Spotify SDK kunde inte laddas. Prova vanlig Chrome utan inkognito eller innehållsblockerare."));
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
    return "Spotify nekade uppspelning. Kontrollera att kontot har Spotify Premium och att webbläsaren kan spela skyddat innehåll.";
  }

  if (status === 404) {
    return "Spotify hittar ingen aktiv spelare. Prova att öppna Spotify-appen en gång, gå tillbaka hit och tryck igen.";
  }

  if (status === 429) {
    return "Spotify säger att appen gör för många anrop just nu. Vänta lite och prova igen.";
  }

  return spotifyMessage || `Spotify-fel ${status}`;
}

async function spotifyApi(path, options = {}, retryOnAuth = true) {
  const token = await getValidSpotifyToken();

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

  if (response.status === 401 && retryOnAuth && getSpotifyRefreshToken()) {
    localStorage.removeItem(SPOTIFY_ACCESS_TOKEN_KEY);
    localStorage.removeItem(SPOTIFY_TOKEN_EXPIRES_AT_KEY);

    const refreshedToken = await refreshSpotifyToken();

    if (refreshedToken) {
      return spotifyApi(path, options, false);
    }
  }

  if (!response.ok) {
    throw new Error(getSpotifyApiErrorMessage(response.status, data));
  }

  return data;
}

function resetSpotifyPlayer() {
  try {
    spotifyPlayer?.disconnect();
  } catch {
    // Ignore.
  }

  spotifyPlayer = null;
  spotifyDeviceId = null;
  spotifyReadyPromise = null;
}

async function activateSpotifyPlayer() {
  if (spotifyPlayer?.activateElement) {
    await spotifyPlayer.activateElement();
  }
}

async function initSpotifyPlayer() {
  const token = await getValidSpotifyToken({ loginIfMissing: true });

  if (!token) {
    return false;
  }

  if (spotifyPlayer && spotifyDeviceId) {
    return true;
  }

  if (spotifyPlayer && spotifyReadyPromise) {
    try {
      await withTimeout(
        spotifyReadyPromise,
        15000,
        "Spotify-spelaren blev inte redo. Prova vanlig Chrome utan inkognito."
      );

      return Boolean(spotifyDeviceId);
    } catch {
      resetSpotifyPlayer();
    }
  }

  setSpotifyStatus("Startar Spotify-spelaren...", "warning");

  try {
    await withTimeout(
      loadSpotifySdk(),
      10000,
      "Spotify SDK laddades inte. Prova vanlig Chrome utan inkognito eller innehållsblockerare."
    );

    spotifyReadyPromise = new Promise((resolve, reject) => {
      spotifyPlayer = new Spotify.Player({
        name: "Musik Quiz Player",
        volume: 0.8,

        // Viktigt: hämta alltid färsk token.
        // SDK:n kan anropa detta igen när access token har gått ut.
        getOAuthToken: async cb => {
          const freshToken = await getValidSpotifyToken();

          if (freshToken) {
            cb(freshToken);
          } else {
            cb("");
          }
        }
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

        setSpotifyStatus("Spotify-spelaren tappade anslutningen. Tryck Spela i denna telefon igen.", "warning");
      });

      spotifyPlayer.addListener("initialization_error", ({ message }) => {
        reject(new Error(`Spotify kunde inte startas i den här webbläsaren: ${message}`));
      });

      spotifyPlayer.addListener("authentication_error", ({ message }) => {
        localStorage.removeItem(SPOTIFY_ACCESS_TOKEN_KEY);
        localStorage.removeItem(SPOTIFY_TOKEN_EXPIRES_AT_KEY);
        reject(new Error(`Spotify-inloggningen kunde inte användas: ${message}`));
      });

      spotifyPlayer.addListener("account_error", ({ message }) => {
        reject(new Error(`Spotify-kontot kan inte spela här. Kräver Spotify Premium. ${message}`));
      });

      spotifyPlayer.addListener("playback_error", ({ message }) => {
        setSpotifyStatus(`Spotify kunde inte spela låten: ${message}`, "error");
      });

      spotifyPlayer.addListener("autoplay_failed", () => {
        setSpotifyStatus("Spotify blockerade automatisk uppspelning. Tryck Spela i denna telefon igen.", "warning");
      });
    });

    const connected = await spotifyPlayer.connect();

    if (!connected) {
      throw new Error("Spotify-spelaren kunde inte ansluta.");
    }

    await withTimeout(
      spotifyReadyPromise,
      15000,
      "Spotify-spelaren blev inte redo. Prova vanlig Chrome utan inkognito."
    );

    return Boolean(spotifyDeviceId);
  } catch (error) {
    resetSpotifyPlayer();
    setSpotifyStatus(error.message, "error");
    return false;
  }
}

async function playSpotifyTrackAfterCountdown(spotifyUrl) {
  const token = await getValidSpotifyToken({ loginIfMissing: true });

  if (!token) {
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
      setSpotifyStatus("Spotify-spelaren är inte redo än. Tryck Spela i denna telefon igen.", "warning");
      return;
    }

    await activateSpotifyPlayer();

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
      if (countdown) {
        countdown.textContent = `Spelar om ${i}...`;
      }

      setSpotifyStatus(`Spotify är redo. Spelar om ${i}...`, "warning");
      await wait(1000);
    }

    if (countdown) {
      countdown.textContent = "Spelar";
    }

    await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`, {
      method: "PUT",
      body: JSON.stringify({
        uris: [trackUri],
        position_ms: 0
      })
    });

    setSpotifyStatus("Spelar i denna telefon.", "success");
  } catch (error) {
    if (countdown) {
      countdown.textContent = "";
    }

    setSpotifyStatus(error.message, "error");
  }
}

async function pauseSpotifyTrack() {
  try {
    const token = await getValidSpotifyToken({ loginIfMissing: false });

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