const SPOTIFY_CLIENT_ID = "5d5f422f994a4ad4b45a7dba379526c5";
const SPOTIFY_REDIRECT_URI = "https://erikwasa.github.io/musik-quiz/";
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state"
];

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

  window.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function handleSpotifyRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  if (!code) return;

  const verifier = localStorage.getItem("spotify_code_verifier");

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_verifier: verifier
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await response.json();

  if (data.access_token) {
    localStorage.setItem("spotify_access_token", data.access_token);
    localStorage.setItem("spotify_token_expires_at", String(Date.now() + data.expires_in * 1000));
  }

  window.history.replaceState({}, document.title, SPOTIFY_REDIRECT_URI);
}

function getSpotifyToken() {
  const token = localStorage.getItem("spotify_access_token");
  const expiresAt = Number(localStorage.getItem("spotify_token_expires_at") || "0");

  if (!token || Date.now() > expiresAt) return null;
  return token;
}