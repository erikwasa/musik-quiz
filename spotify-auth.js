const SPOTIFY_CLIENT_ID = "5d5f422f994a4ad4b45a7dba379526c5";
const SPOTIFY_REDIRECT_URI = "https://erikwasa.github.io/musik-quiz/";
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state"
];

const SPOTIFY_ACCESS_TOKEN_KEY = "spotify_access_token";
const SPOTIFY_REFRESH_TOKEN_KEY = "spotify_refresh_token";
const SPOTIFY_TOKEN_EXPIRES_AT_KEY = "spotify_token_expires_at";
const SPOTIFY_CODE_VERIFIER_KEY = "spotify_code_verifier";
const SPOTIFY_AUTH_STATE_KEY = "spotify_auth_state";
const SPOTIFY_STATUS_AFTER_REDIRECT_KEY = "spotify_status_after_redirect";

let spotifyTokenRefreshPromise = null;

function setSpotifyStatus(message, type = "info") {
  const statusElement = document.getElementById("spotifyStatus");

  if (!statusElement) {
    return;
  }

  statusElement.hidden = false;
  statusElement.textContent = message;
  statusElement.dataset.type = type;
}

function clearSpotifyStatus() {
  const statusElement = document.getElementById("spotifyStatus");

  if (!statusElement) {
    return;
  }

  statusElement.hidden = true;
  statusElement.textContent = "";
  delete statusElement.dataset.type;
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest("SHA-256", data);
}

function base64urlencode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(length) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

function saveSpotifyTokenResponse(data) {
  if (!data.access_token) {
    return null;
  }

  const expiresInSeconds = Number(data.expires_in || 3600);

  localStorage.setItem(SPOTIFY_ACCESS_TOKEN_KEY, data.access_token);

  // 60 sekunders marginal så vi inte försöker spela med en token som strax går ut.
  localStorage.setItem(
    SPOTIFY_TOKEN_EXPIRES_AT_KEY,
    String(Date.now() + Math.max(expiresInSeconds - 60, 60) * 1000)
  );

  // Spotify returnerar inte alltid en ny refresh_token vid refresh.
  // Om den saknas ska vi behålla den gamla.
  if (data.refresh_token) {
    localStorage.setItem(SPOTIFY_REFRESH_TOKEN_KEY, data.refresh_token);
  }

  return data.access_token;
}

function clearSpotifySession() {
  localStorage.removeItem(SPOTIFY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(SPOTIFY_REFRESH_TOKEN_KEY);
  localStorage.removeItem(SPOTIFY_TOKEN_EXPIRES_AT_KEY);
  localStorage.removeItem(SPOTIFY_CODE_VERIFIER_KEY);
  localStorage.removeItem(SPOTIFY_AUTH_STATE_KEY);
}

function getSpotifyToken() {
  const token = localStorage.getItem(SPOTIFY_ACCESS_TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(SPOTIFY_TOKEN_EXPIRES_AT_KEY) || "0");

  if (token && Date.now() < expiresAt) {
    return token;
  }

  localStorage.removeItem(SPOTIFY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(SPOTIFY_TOKEN_EXPIRES_AT_KEY);

  return null;
}

function getSpotifyRefreshToken() {
  return localStorage.getItem(SPOTIFY_REFRESH_TOKEN_KEY);
}

function hasSpotifySession() {
  return Boolean(getSpotifyToken() || getSpotifyRefreshToken());
}

async function spotifyLogin() {
  setSpotifyStatus("Skickar dig till Spotify för inloggning...", "warning");

  const verifier = randomString(64);
  const state = randomString(24);

  localStorage.setItem(SPOTIFY_CODE_VERIFIER_KEY, verifier);
  localStorage.setItem(SPOTIFY_AUTH_STATE_KEY, state);

  const challenge = base64urlencode(await sha256(verifier));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function handleSpotifyRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");
  const returnedState = params.get("state");

  if (error) {
    setSpotifyStatus(`Spotify-inloggningen avbröts eller misslyckades: ${error}`, "error");
    window.history.replaceState({}, document.title, SPOTIFY_REDIRECT_URI);
    return false;
  }

  if (!code) {
    const savedStatus = sessionStorage.getItem(SPOTIFY_STATUS_AFTER_REDIRECT_KEY);

    if (savedStatus) {
      setSpotifyStatus(savedStatus, "success");
      sessionStorage.removeItem(SPOTIFY_STATUS_AFTER_REDIRECT_KEY);
      return true;
    }

    if (getSpotifyToken()) {
      setSpotifyStatus("Spotify är inloggat.", "success");
      return true;
    }

    if (getSpotifyRefreshToken()) {
      setSpotifyStatus("Spotify-session finns sparad. Spelaren kan förnya inloggningen vid behov.", "success");
      return true;
    }

    return false;
  }

  const expectedState = localStorage.getItem(SPOTIFY_AUTH_STATE_KEY);

  if (expectedState && returnedState !== expectedState) {
    setSpotifyStatus("Spotify-inloggningen avbröts av säkerhetsskäl. Prova igen.", "error");
    window.history.replaceState({}, document.title, SPOTIFY_REDIRECT_URI);
    return false;
  }

  const verifier = localStorage.getItem(SPOTIFY_CODE_VERIFIER_KEY);

  if (!verifier) {
    setSpotifyStatus("Spotify-inloggningen kunde inte slutföras. Prova att logga in igen.", "error");
    window.history.replaceState({}, document.title, SPOTIFY_REDIRECT_URI);
    return false;
  }

  setSpotifyStatus("Slutför Spotify-inloggning...", "warning");

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_verifier: verifier
  });

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      const message = data.error_description || data.error || "Okänt Spotify-fel";
      setSpotifyStatus(`Spotify-inloggningen misslyckades: ${message}`, "error");
      window.history.replaceState({}, document.title, SPOTIFY_REDIRECT_URI);
      return false;
    }

    saveSpotifyTokenResponse(data);

    localStorage.removeItem(SPOTIFY_CODE_VERIFIER_KEY);
    localStorage.removeItem(SPOTIFY_AUTH_STATE_KEY);

    sessionStorage.setItem(
      SPOTIFY_STATUS_AFTER_REDIRECT_KEY,
      "Spotify är inloggat. Välj kategori och tryck Spela i denna telefon igen."
    );

    window.history.replaceState({}, document.title, SPOTIFY_REDIRECT_URI);
    setSpotifyStatus("Spotify är inloggat. Välj kategori och tryck Spela i denna telefon igen.", "success");
    return true;
  } catch (error) {
    setSpotifyStatus(`Spotify-inloggningen misslyckades: ${error.message}`, "error");
    window.history.replaceState({}, document.title, SPOTIFY_REDIRECT_URI);
    return false;
  }
}

async function refreshSpotifyToken() {
  if (spotifyTokenRefreshPromise) {
    return spotifyTokenRefreshPromise;
  }

  const refreshToken = getSpotifyRefreshToken();

  if (!refreshToken) {
    return null;
  }

  spotifyTokenRefreshPromise = (async () => {
    setSpotifyStatus("Förnyar Spotify-inloggningen...", "warning");

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID
    });

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.error === "invalid_grant") {
        clearSpotifySession();
        setSpotifyStatus("Spotify-sessionen har gått ut. Logga in igen.", "warning");
        return null;
      }

      const message = data.error_description || data.error || "Okänt Spotify-fel";
      throw new Error(`Kunde inte förnya Spotify-inloggningen: ${message}`);
    }

    const newAccessToken = saveSpotifyTokenResponse(data);
    setSpotifyStatus("Spotify-inloggningen är förnyad.", "success");

    return newAccessToken;
  })();

  try {
    return await spotifyTokenRefreshPromise;
  } finally {
    spotifyTokenRefreshPromise = null;
  }
}

async function getValidSpotifyToken(options = {}) {
  const { loginIfMissing = false } = options;

  const token = getSpotifyToken();

  if (token) {
    return token;
  }

  const refreshToken = getSpotifyRefreshToken();

  if (refreshToken) {
    try {
      return await refreshSpotifyToken();
    } catch (error) {
      setSpotifyStatus(error.message, "error");
      return null;
    }
  }

  if (loginIfMissing) {
    await spotifyLogin();
  }

  return null;
}

function logoutSpotify() {
  clearSpotifySession();
  setSpotifyStatus("Du är utloggad från Spotify.", "warning");
}