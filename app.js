const categoriesByName = window.quizCategories || {};

const songs = Object.entries(categoriesByName).flatMap(
  ([categoryName, categorySongs]) =>
    categorySongs.map(song => ({
      ...song,
      category: categoryName,
    }))
);

const PLAY_MODE_STORAGE_KEY = "musikQuizPlayMode";

const playModeInputs = document.querySelectorAll('input[name="playMode"]');
const qrModeBlock = document.getElementById("qrModeBlock");
const sameDeviceModeBlock = document.getElementById("sameDeviceModeBlock");
const spotifyLinkModeBlock = document.getElementById("spotifyLinkModeBlock");

function getPlayMode() {
  return localStorage.getItem(PLAY_MODE_STORAGE_KEY) || "qr";
}

function savePlayMode(mode) {
  localStorage.setItem(PLAY_MODE_STORAGE_KEY, mode);
}

function applyPlayMode() {
  const mode = getPlayMode();

  if (qrModeBlock) qrModeBlock.hidden = mode !== "qr";
  if (sameDeviceModeBlock) sameDeviceModeBlock.hidden = mode !== "same-device";
  if (spotifyLinkModeBlock) spotifyLinkModeBlock.hidden = mode !== "spotify-link";

  playModeInputs.forEach(input => {
    input.checked = input.value === mode;
  });
}

playModeInputs.forEach(input => {
  input.addEventListener("change", () => {
    savePlayMode(input.value);
    applyPlayMode();
  });
});

const ALL_SONGS_LABEL = "Alla låtar";
const PLAYED_STORAGE_KEY = "musikQuizPlayedSongs";
const HIDE_PLAYED_STORAGE_KEY = "musikQuizHidePlayed";

const categoryScreen = document.getElementById("categoryScreen");
const gameScreen = document.getElementById("gameScreen");
const categoryList = document.getElementById("categoryList");
const categoryPill = document.getElementById("categoryPill");
const qrCodeElement = document.getElementById("qrCode");
const openSpotifyButton = document.getElementById("openSpotifyButton");
const spotifyLoginButton = document.getElementById("spotifyLoginButton");
const playInAppButton = document.getElementById("playInAppButton");
const pauseInAppButton = document.getElementById("pauseInAppButton");
const revealButton = document.getElementById("revealButton");
const nextButton = document.getElementById("nextButton");
const backButton = document.getElementById("backButton");
const answerBox = document.getElementById("answerBox");
const answerYear = document.getElementById("answerYear");
const answerTitle = document.getElementById("answerTitle");
const answerArtist = document.getElementById("answerArtist");
const answerSummerHitYear = document.getElementById("answerSummerHitYear");
const songCounter = document.getElementById("songCounter");
const remainingCounter = document.getElementById("remainingCounter");
const songChangedStatus = document.getElementById("songChangedStatus");
const spotifyCountdown = document.getElementById("spotifyCountdown");
const hidePlayedCheckbox = document.getElementById("hidePlayedCheckbox");
const resetPlayedButton = document.getElementById("resetPlayedButton");

let selectedCategory = null;
let categorySongs = [];
let shuffledSongs = [];
let currentSong = null;
let currentIndex = 0;
let playedSongIds = loadPlayedSongIds();

hidePlayedCheckbox.checked = loadHidePlayedPreference();

function getSongId(song) {
  return song.spotifyUrl || `${song.category}|${song.artist}|${song.title}|${song.year}`;
}

function loadPlayedSongIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(PLAYED_STORAGE_KEY)) || []);
  } catch {
    return new Set();
  }
}

function savePlayedSongIds() {
  localStorage.setItem(PLAYED_STORAGE_KEY, JSON.stringify([...playedSongIds]));
}

function loadHidePlayedPreference() {
  const savedValue = localStorage.getItem(HIDE_PLAYED_STORAGE_KEY);
  return savedValue === null ? true : savedValue === "true";
}

function saveHidePlayedPreference() {
  localStorage.setItem(HIDE_PLAYED_STORAGE_KEY, String(hidePlayedCheckbox.checked));
}

function markSongAsPlayed(song) {
  playedSongIds.add(getSongId(song));
  savePlayedSongIds();
}

function isSongPlayed(song) {
  return playedSongIds.has(getSongId(song));
}

function getCategories() {
  const categories = Object.keys(categoriesByName).sort();
  return [ALL_SONGS_LABEL, ...categories];
}

function getSongsForCategory(category) {
  return category === ALL_SONGS_LABEL
    ? songs
    : songs.filter(song => song.category === category);
}

function getPlayableSongs(category) {
  const allCategorySongs = getSongsForCategory(category);

  if (!hidePlayedCheckbox.checked) {
    return allCategorySongs;
  }

  return allCategorySongs.filter(song => !isSongPlayed(song));
}

function shuffle(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[randomIndex]] = [copy[randomIndex], copy[i]];
  }

  return copy;
}

function showScreen(screenName) {
  categoryScreen.classList.toggle("active", screenName === "categories");
  gameScreen.classList.toggle("active", screenName === "game");
}

function renderCategories() {
  categoryList.innerHTML = "";

  getCategories().forEach(category => {
    const categorySongs = getSongsForCategory(category);
    const playedCount = categorySongs.filter(isSongPlayed).length;
    const totalCount = categorySongs.length;
    const availableCount = hidePlayedCheckbox.checked
      ? totalCount - playedCount
      : totalCount;

    const button = document.createElement("button");
    button.className = "secondary category-button";
    button.disabled = availableCount === 0;

    const title = document.createElement("span");
    title.className = "category-title";
    title.textContent = category;

    const meta = document.createElement("span");
    meta.className = "category-meta";
    meta.textContent = `${totalCount} låtar · ${playedCount} spelade`;

    if (hidePlayedCheckbox.checked) {
      meta.textContent += ` · ${availableCount} kvar`;
    }

    button.appendChild(title);
    button.appendChild(meta);
    button.addEventListener("click", () => startCategory(category));

    categoryList.appendChild(button);
  });
}

function startCategory(category) {
  selectedCategory = category;
  categorySongs = getPlayableSongs(category);
  shuffledSongs = shuffle(categorySongs);
  currentIndex = 0;

  showScreen("game");
  showCurrentSong();
}

function showCurrentSong() {
  if (shuffledSongs.length === 0) {
    qrCodeElement.innerHTML = "";
    categoryPill.textContent = selectedCategory;
    songCounter.textContent = "Inga låtar kvar";
    remainingCounter.textContent = "0 kvar";
    songChangedStatus.textContent = `Ny låt vald: ${currentIndex + 1}`;
    spotifyCountdown.textContent = "";
    openSpotifyButton.href = "#";
    answerBox.classList.remove("visible");
    answerYear.textContent = "";
    answerTitle.textContent = "";
    answerArtist.textContent = "";
    answerSummerHitYear.textContent = "";

    return;
  }

  currentSong = shuffledSongs[currentIndex];

  markSongAsPlayed(currentSong);

  categoryPill.textContent = selectedCategory;
  songCounter.textContent = `Låt ${currentIndex + 1} av ${shuffledSongs.length}`;
  remainingCounter.textContent = `${shuffledSongs.length - currentIndex - 1} kvar`;
  openSpotifyButton.href = currentSong.spotifyUrl;

  applyPlayMode();

  answerBox.classList.remove("visible");
  answerYear.textContent = currentSong.year;
  answerTitle.textContent = currentSong.title;
  answerArtist.textContent = currentSong.artist;
  answerSummerHitYear.textContent = currentSong.summerHitYear
    ? `Sommarhit-år: ${currentSong.summerHitYear}`
    : "";

  renderQrCode(currentSong.spotifyUrl);
}

function renderQrCode(url) {
  qrCodeElement.innerHTML = "";

  new QRCode(qrCodeElement, {
    text: url,
    width: 300,
    height: 300,
    correctLevel: QRCode.CorrectLevel.H,
  });
}

function revealAnswer() {
  answerBox.classList.add("visible");
}

function nextSong() {
  if (shuffledSongs.length === 0) {
    return;
  }

  currentIndex += 1;

  if (currentIndex >= shuffledSongs.length) {
    shuffledSongs = shuffle(getPlayableSongs(selectedCategory));
    currentIndex = 0;
  }

  showCurrentSong();
}

function backToCategories() {
  selectedCategory = null;
  categorySongs = [];
  shuffledSongs = [];
  currentSong = null;
  currentIndex = 0;

  renderCategories();
  showScreen("categories");
}

function resetPlayedSongs() {
  const shouldReset = confirm("Vill du nollställa alla spelade låtar?");

  if (!shouldReset) {
    return;
  }

  playedSongIds = new Set();
  savePlayedSongIds();
  renderCategories();
}

revealButton.addEventListener("click", revealAnswer);
nextButton.addEventListener("click", nextSong);
backButton.addEventListener("click", backToCategories);

hidePlayedCheckbox.addEventListener("change", () => {
  saveHidePlayedPreference();
  renderCategories();
});

resetPlayedButton.addEventListener("click", resetPlayedSongs);

handleSpotifyRedirect();

spotifyLoginButton?.addEventListener("click", async () => {
  await spotifyLogin();
});

playInAppButton?.addEventListener("click", async () => {
  if (!currentSong) return;

  await playSpotifyTrackAfterCountdown(currentSong.spotifyUrl);
});

pauseInAppButton?.addEventListener("click", async () => {
  await pauseSpotifyTrack();
});

applyPlayMode();
renderCategories();