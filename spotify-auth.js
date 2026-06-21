const SPOTIFY_CLIENT_ID = "5d5f422f994a4ad4b45a7dba379526c5";
const SPOTIFY_REDIRECT_URI = "https://erikwasa.github.io/musik-quiz/";
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state"
];

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

async function spotifyLogin() {
  setSpotifyStatus("Skickar dig till Spotify för inloggning...", "warning");

  const verifier = randomString(64);
  localStorage.setItem("spotify_code_verifier", verifier);

  const challenge = base64urlencode(await sha256(verifier));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
    redirect_uri: SPOTIFY_REDIRECT_URI
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function handleSpotifyRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");

  if (error) {
    setSpotifyStatus(`Spotify-inloggningen avbröts eller misslyckades: ${error}`, "error");
    window.history.replaceState({}, document.title, SPOTIFY_REDIRECT_URI);
    return false;
  }

  if (!code) {
    const savedStatus = sessionStorage.getItem("spotify_status_after_redirect");

    if (savedStatus) {
      setSpotifyStatus(savedStatus, "success");
      sessionStorage.removeItem("spotify_status_after_redirect");
      return true;
    }

    if (getSpotifyToken()) {
      setSpotifyStatus("Spotify är inloggat.", "success");
      return true;
    }

    return false;
  }

  const verifier = localStorage.getItem("spotify_code_verifier");

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

    localStorage.setItem("spotify_access_token", data.access_token);
    localStorage.setItem("spotify_token_expires_at", String(Date.now() + data.expires_in * 1000));
    localStorage.removeItem("spotify_code_verifier");

    sessionStorage.setItem(
      "spotify_status_after_redirect",
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

function getSpotifyToken() {
  const token = localStorage.getItem("spotify_access_token");
  const expiresAt = Number(localStorage.getItem("spotify_token_expires_at") || "0");

  if (!token || Date.now() > expiresAt) {
    localStorage.removeItem("spotify_access_token");
    localStorage.removeItem("spotify_token_expires_at");
    return null;
  }

  return token;
}

function logoutSpotify() {
  localStorage.removeItem("spotify_access_token");
  localStorage.removeItem("spotify_token_expires_at");
  localStorage.removeItem("spotify_code_verifier");
  setSpotifyStatus("Du är utloggad från Spotify.", "warning");
}