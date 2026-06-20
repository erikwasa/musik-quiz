const categoriesByName = window.quizCategories || {};

const songs = Object.entries(categoriesByName).flatMap(([categoryName, categorySongs]) =>
  categorySongs.map(song => ({
    ...song,
    category: categoryName
  }))
);

    const categoryScreen = document.getElementById("categoryScreen");
    const gameScreen = document.getElementById("gameScreen");
    const categoryList = document.getElementById("categoryList");
    const categoryPill = document.getElementById("categoryPill");
    const qrCodeElement = document.getElementById("qrCode");
    const openSpotifyButton = document.getElementById("openSpotifyButton");
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

    let selectedCategory = null;
    let categorySongs = [];
    let shuffledSongs = [];
    let currentSong = null;
    let currentIndex = 0;

    function getCategories() {
      const categories = [...new Set(songs.map(song => song.category))].sort();
      return ["All songs", ...categories];
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

      const categories = getCategories();

      categories.forEach(category => {
        const count = category === "All songs"
          ? songs.length
          : songs.filter(song => song.category === category).length;

        const button = document.createElement("button");

        button.className = "secondary";
        button.textContent = `${category} (${count})`;
        button.addEventListener("click", () => startCategory(category));

        categoryList.appendChild(button);
      });
    }

    function startCategory(category) {
      selectedCategory = category;
      categorySongs = category === "All songs"
        ? songs
        : songs.filter(song => song.category === category);

      shuffledSongs = shuffle(categorySongs);
      currentIndex = 0;

      showScreen("game");
      showCurrentSong();
    }

    function showCurrentSong() {
      if (shuffledSongs.length === 0) {
        qrCodeElement.innerHTML = "";
        categoryPill.textContent = selectedCategory;
        songCounter.textContent = "No songs";
        remainingCounter.textContent = "0 left";
        openSpotifyButton.href = "#";
        answerBox.classList.remove("visible");
        answerYear.textContent = "";
        answerTitle.textContent = "";
        answerArtist.textContent = "";
        answerSummerHitYear.textContent = "";
        return;
      }

      currentSong = shuffledSongs[currentIndex];

      categoryPill.textContent = selectedCategory;
      songCounter.textContent = `Song ${currentIndex + 1} of ${shuffledSongs.length}`;
      remainingCounter.textContent = `${shuffledSongs.length - currentIndex - 1} left`;

      openSpotifyButton.href = currentSong.spotifyUrl;

      answerBox.classList.remove("visible");
      answerYear.textContent = currentSong.year;
      answerTitle.textContent = currentSong.title;
      answerArtist.textContent = currentSong.artist;
      answerSummerHitYear.textContent = currentSong.summerHitYear
        ? `Summer hit year: ${currentSong.summerHitYear}`
        : "";

      renderQrCode(currentSong.spotifyUrl);
    }

    function renderQrCode(url) {
      qrCodeElement.innerHTML = "";

      new QRCode(qrCodeElement, {
        text: url,
        width: 300,
        height: 300,
        correctLevel: QRCode.CorrectLevel.H
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
        shuffledSongs = shuffle(categorySongs);
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

      showScreen("categories");
    }

    revealButton.addEventListener("click", revealAnswer);
    nextButton.addEventListener("click", nextSong);
    backButton.addEventListener("click", backToCategories);

    renderCategories();
