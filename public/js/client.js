const socket = io();

const CHARACTER_ASSETS = {
  seolhong: "/assets/characters/seolhong.png",
  yeowooyeon: "/assets/characters/yeowooyeon.png",
  choiaeri: "/assets/characters/choiaeri.png",
  nunyo: "/assets/characters/nunyo.png",
  nano: "/assets/characters/nano.png",
  ruchel: "/assets/characters/ruchel.png",
};

const CARD_BACK_ASSET = "/assets/cards/back.png";
const VICTORY_SOUND_ASSET = "/assets/sounds/victory.mp3";
const BELL_SOUND_ASSET = "/assets/sounds/bell.mp3";
const BELL_IMAGE_ASSET = "/assets/bell/bell.png";
const BELL_IMAGE_URL = BELL_IMAGE_ASSET;
const HIDDEN_USERS_KEY = "babyblue-hidden-users";
const BGM_MODE_KEY = "bgmMode";
const LOBBY_GUIDE_COLLAPSED_KEY = "lobbyGuideCollapsed";

const CARD_SLOTS = {
  1: { left: "22%", top: "22%" },
  2: { left: "78%", top: "22%" },
  3: { left: "50%", top: "50%" },
  4: { left: "22%", top: "78%" },
  5: { left: "78%", top: "78%" },
};
const CHARACTER_SIZE_BY_COUNT = {
  1: "60%",
  2: "45%",
  3: "39%",
  4: "35%",
  5: "32%",
};
const CARD_COLORS = {
  seolhong: "#ffe0ea",
  yeowooyeon: "#ece2ff",
  choiaeri: "#efe4d7",
  nunyo: "#fff1b8",
  nano: "#d9faed",
  ruchel: "#dceeff",
};
const CHARACTER_FALLBACK_LABELS = {
  seolhong: "설홍",
  yeowooyeon: "우연",
  choiaeri: "애리",
  nunyo: "눈요",
  nano: "나노",
  ruchel: "루첼",
};
const AI_DIFFICULTY_LABELS = {
  beginner: "초급",
  intermediate: "중급",
  advanced: "고급",
  tutorial: "튜토리얼",
};
const STATUS_ICONS = {
  lobby: "🔵",
  waiting: "🟢",
  full: "🟠",
  playing: "🔴",
};

const screens = {
  nickname: document.querySelector("#nicknameScreen"),
  lobby: document.querySelector("#lobbyScreen"),
  room: document.querySelector("#roomScreen"),
  game: document.querySelector("#gameScreen"),
};

const state = {
  nickname: "",
  lobby: null,
  room: null,
  game: null,
  activeScreen: "nickname",
  passwordRoomId: null,
  gameResult: null,
  onlineUsersExpanded: false,
  mobileGameInfoExpanded: false,
  mobileInfoRoomId: null,
  spectatorOverlayDismissedFor: null,
  latency: { value: null, state: "measuring" },
  assetsReady: false,
  assetsLoading: false,
  assetLoadFailures: [],
  tutorial: {
    active: false,
    stepIndex: 0,
    preparedStep: null,
    waitingFor: null,
    seenCardId: null,
  },
};

window.assetsReady = false;

const $ = (selector) => document.querySelector(selector);

let victoryPlayedForResult = false;
let turnTimerInterval = null;
let bellLogTimer = null;
let bellAnimationTimer = null;
let latencyTimer = null;
let flipAvailabilityTimer = null;
let tutorialAdvanceTimer = null;
let latencyNonce = 0;
let mobileTouchLastAt = 0;
const pendingLatencyPings = new Map();

const TUTORIAL_STEPS = [
  {
    key: "menu",
    label: "1 / 12",
    target: "menu",
    scenario: "intro",
    text: "우측 상단 메뉴에서\nBGM, 효과음, 설정을 변경할 수 있습니다.",
    nextText: "다음",
  },
  {
    key: "score",
    label: "2 / 12",
    target: "score",
    scenario: "intro",
    text: "이 게임은 카드 수로 승부하지 않습니다.\n점수가 0 이하가 되면 탈락합니다.",
    nextText: "다음",
  },
  {
    key: "normalMode",
    label: "3 / 12",
    target: "openCard",
    scenario: "normalMode",
    text: "일반모드는 한 카드에 한 종류의 캐릭터만 등장합니다.\n예시는 설홍 3개 카드입니다.",
    nextText: "다음",
  },
  {
    key: "hardMode",
    label: "4 / 12",
    target: "openCard",
    scenario: "hardMode",
    text: "하드모드는 한 카드에 여러 종류의 캐릭터가 함께 등장합니다.\n설홍, 눈요, 루첼이 한 카드에 같이 보입니다.",
    nextText: "다음",
  },
  {
    key: "deck",
    label: "5 / 12",
    target: "deck",
    scenario: "deck",
    text: () => `카드는 자신의 차례에만 공개할 수 있습니다.\n지금은 내 차례입니다.\n\n${isMobileMode() ? "게임 화면을 터치하세요." : "카드덱을 클릭하세요."}`,
    waitingFor: "flip",
  },
  {
    key: "openCard",
    label: "6 / 12",
    target: "openCard",
    scenario: "openCard",
    text: "공개된 카드는\n모든 플레이어가 함께 보는 카드입니다.",
    nextText: "다음",
  },
  {
    key: "aiTurn",
    label: "7 / 12",
    target: "aiOpenCard",
    scenario: "aiTurn",
    text: "AI 차례에는 AI가 카드를 공개합니다.\n종은 내 차례가 아니어도 조건이 맞으면 칠 수 있습니다.",
    waitingFor: "aiFlip",
  },
  {
    key: "bell",
    label: "8 / 12",
    target: "bell",
    scenario: "correctBell",
    text: () => `전체 공개 카드에서 설홍이 정확히 5개가 되었습니다.\n이제 종을 치세요.\n\n${isMobileMode() ? "게임 화면을 터치해서 종을 칠 수 있습니다." : "종을 클릭하거나 스페이스바를 눌러 종을 칠 수 있습니다."}`,
    waitingFor: "correctBell",
  },
  {
    key: "wrong",
    label: "9 / 12",
    target: "bell",
    scenario: "wrongBell",
    text: "아직 설홍이 4개입니다.\n5개가 아닌데 종을 치면 오답으로 감점됩니다.",
    waitingFor: "wrongBell",
  },
  {
    key: "timeout",
    label: "10 / 12",
    target: "timer",
    text: "제한시간 안에 카드를 공개하지 않으면 감점됩니다.\n지금은 체험을 위해 잠시 기다려보세요.",
    waitingFor: "timeout",
  },
  {
    key: "scoreWin",
    label: "11 / 12",
    target: "score",
    scenario: "scoreWin",
    text: "오답과 시간초과로 점수가 줄어드는 것을 확인했습니다.\n탈락하면 직접 플레이는 할 수 없고 관전할 수 있습니다.\n마지막까지 살아남은 플레이어가 승리합니다.",
    nextText: "실전 체험",
  },
  {
    key: "practice",
    label: "12 / 12",
    target: "board",
    text: "튜토리얼 AI와 짧게 실전 체험을 해보세요.\nAI 공개 카드와 내 공개 카드를 합쳐 정확히 5개인지 확인하세요.",
    practice: true,
  },
];

function showScreen(name) {
  Object.entries(screens).forEach(([screenName, element]) => {
    element.classList.toggle("hidden", screenName !== name);
  });
  state.activeScreen = name;
  const gameHud = $("#gameHud");
  if (gameHud) gameHud.classList.toggle("hidden", name !== "game");
  if (name !== "game") {
    document.body.classList.remove("is-tutorial-game");
    stopTurnTimer();
    clearFlipAvailabilityTimer();
    setText("#turnTimer", "--");
    $("#turnTimer")?.classList.remove("urgent");
  }
  updateMobileMode();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2200);
}

function hasFinalConsonant(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  const code = value.charCodeAt(value.length - 1);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

function showBellLog(name) {
  const log = $("#bellLog");
  if (!log) return;
  const display = name || "\ub204\uad70\uac00";
  const particle = hasFinalConsonant(display) ? "\uc774" : "\uac00";
  log.textContent = `${display}${particle} \uc885\uc744 \ucce4\uc2b5\ub2c8\ub2e4`;
  log.classList.remove("hidden");
  clearTimeout(bellLogTimer);
  bellLogTimer = setTimeout(() => log.classList.add("hidden"), 1000);
}

function setText(selector, text) {
  const element = $(selector);
  if (element) element.textContent = text;
}

function isFormFieldFocused() {
  const tag = document.activeElement?.tagName;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
}

function isMobileMode() {
  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 768;
}

function getSelfPlayer(game = state.game) {
  return game?.players?.find((player) => player.id === game.selfPlayerId) || null;
}

function isSelfAbleToAct(game = state.game) {
  const self = getSelfPlayer(game);
  return Boolean(game && self && !self.spectator && !self.eliminated && game.status === "playing" && !game.bellLocked);
}

function isBellAvailable(game = state.game) {
  if (!isSelfAbleToAct(game)) return false;
  const totals = {};
  for (const player of game.players || []) {
    const counts = player.topCard?.counts || {};
    for (const [characterId, count] of Object.entries(counts)) {
      totals[characterId] = (totals[characterId] || 0) + Number(count || 0);
    }
  }
  return Object.values(totals).some((count) => count === 5);
}

function isFlipAvailable(game = state.game) {
  if (!state.assetsReady) return false;
  if (!isSelfAbleToAct(game)) return false;
  const self = getSelfPlayer(game);
  if (self?.id !== game.currentTurnPlayerId) return false;
  return Date.now() >= Number(game.nextFlipAllowedAt || 0);
}

async function requestFlipCard() {
  await ensureAssetsReady();
  if (!isFlipAvailable()) return;
  socket.emit("flipCard");
}

function clearFlipAvailabilityTimer() {
  if (flipAvailabilityTimer) clearTimeout(flipAvailabilityTimer);
  flipAvailabilityTimer = null;
}

function scheduleFlipAvailabilityRefresh(game = state.game) {
  clearFlipAvailabilityTimer();
  const self = getSelfPlayer(game);
  if (!game || !self || self.spectator || self.eliminated || game.bellLocked) return;
  if (self.id !== game.currentTurnPlayerId) return;
  const remaining = Number(game.nextFlipAllowedAt || 0) - Date.now();
  if (remaining <= 0) return;
  const roomId = game.roomId;
  const turnPlayerId = game.currentTurnPlayerId;
  flipAvailabilityTimer = setTimeout(() => {
    flipAvailabilityTimer = null;
    if (state.game?.roomId !== roomId || state.game?.currentTurnPlayerId !== turnPlayerId) return;
    renderGame(state.game);
  }, remaining + 25);
}

function updateMobileTouchHint(game = state.game) {
  const hint = $("#mobileTouchHint");
  if (!hint) return;
  if (!isMobileMode() || state.activeScreen !== "game" || game?.resultVisible) {
    hint.classList.add("hidden");
    hint.replaceChildren();
    return;
  }
  hint.innerHTML = `
    <span class="mobile-bell-guide">← 종을 터치</span>
    <span class="mobile-open-guide">화면 터치시 카드 오픈 →</span>
  `;
  hint.classList.remove("hidden");
}

function updateMobileGameInfoPanel() {
  const panel = $("#gameInfoPanel");
  const button = $("#gameInfoToggleButton");
  if (!panel || !button) return;
  const mobile = isMobileMode();
  button.classList.toggle("hidden", !mobile || state.activeScreen !== "game");
  if (!mobile) {
    panel.classList.remove("mobile-collapsed");
    button.setAttribute("aria-expanded", "true");
    button.textContent = "게임 정보 ▲";
    return;
  }
  const collapsed = !state.mobileGameInfoExpanded;
  panel.classList.toggle("mobile-collapsed", collapsed);
  button.setAttribute("aria-expanded", String(!collapsed));
  button.textContent = collapsed ? "게임 정보 ▼" : "게임 정보 ▲";
}

function updateMobileMode() {
  document.body.classList.toggle("is-mobile", isMobileMode());
  updateMobileGameInfoPanel();
  updateMobileTouchHint();
}

function formatWinRate(value) {
  return `${Number(value || 0)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function displayName(player) {
  return player?.displayName || player?.nickname || "";
}

function renderName(player) {
  const className = player?.isVaNickname ? "va-name" : "";
  return `${renderRankBadges(player)}<span class="${className}">${escapeHtml(displayName(player))}</span>`;
}

function renderRankBadges(player) {
  const badges = Array.isArray(player?.rankBadges) ? player.rankBadges : [];
  if (!badges.length) return "";
  return `<span class="rank-badges">${badges.map((badge) => escapeHtml(badge.symbol)).join("")}</span>`;
}

function renderHostBadge(player) {
  return player?.isHost && !player?.isAI ? `<span class="host-inline">👑 방장</span>` : "";
}

function modeLabel(mode) {
  return mode === "hard" ? "하드" : "일반";
}

function penaltyLabel(value) {
  return `${Number(value || 1)}배`;
}

function aiDifficultyLabel(value) {
  return AI_DIFFICULTY_LABELS[value] || AI_DIFFICULTY_LABELS.intermediate;
}

// BGM is intentionally resilient: missing files are skipped and the app stays silent.
const BGM_PLAYLISTS = {
  energetic: [
    "/assets/sounds/bgm1.mp3",
    "/assets/sounds/bgm2.mp3",
    "/assets/sounds/bgm3.mp3",
    "/assets/sounds/bgm4.mp3",
  ],
  calm: [
    "/assets/sounds/track1.mp3",
    "/assets/sounds/track2.mp3",
    "/assets/sounds/track3.mp3",
  ],
};
BGM_PLAYLISTS.all = [...BGM_PLAYLISTS.energetic, ...BGM_PLAYLISTS.calm];
const BGM_MODES = new Set(["all", "energetic", "calm"]);
const IMAGE_PRELOAD_URLS = [
  ...Object.values(CHARACTER_ASSETS),
  CARD_BACK_ASSET,
  BELL_IMAGE_URL,
];
const AUDIO_PRELOAD_URLS = [
  ...BGM_PLAYLISTS.all,
  BELL_SOUND_ASSET,
  VICTORY_SOUND_ASSET,
];
const bgm = new Audio();
bgm.preload = "auto";
const preloadedAudio = new Map();
const imageCache = new Map();
const failedImageUrls = new Set();
const imagePreloadPromises = new Map();
let requiredAssetsPromise = null;
let bgmIndex = 0;
let currentBgmMode = "all";
let userGestureSeen = false;
let bgmStarted = false;
let skippedTracks = 0;
let bgmSilent = false;

function clampVolumeStep(value, fallback = 3) {
  if (value === null || value === undefined || value === "") return fallback;
  const volume = Number(value);
  if (!Number.isFinite(volume)) return fallback;
  const normalized = volume > 5 && volume <= 100 ? Math.round(volume / 20) : Math.round(volume);
  if (normalized < 0 || normalized > 5) return fallback;
  return normalized;
}

function getStoredBgmVolume() {
  return clampVolumeStep(localStorage.getItem("bgmVolume"), 3);
}

function getStoredBgmMode() {
  const mode = localStorage.getItem(BGM_MODE_KEY);
  return BGM_MODES.has(mode) ? mode : "all";
}

function getStoredSfxVolume() {
  return clampVolumeStep(localStorage.getItem("sfxVolume"), 3);
}

function getCurrentBgmTracks() {
  return BGM_PLAYLISTS[currentBgmMode] || BGM_PLAYLISTS.all;
}

function applyBgmMode(value, restart = true) {
  currentBgmMode = BGM_MODES.has(value) ? value : "all";
  localStorage.setItem(BGM_MODE_KEY, currentBgmMode);
  const select = $("#bgmModeSelect");
  if (select) select.value = currentBgmMode;

  bgm.pause();
  bgmIndex = 0;
  skippedTracks = 0;
  bgmSilent = false;
  bgmStarted = false;

  if (restart) startBgmWhenAllowed();
}

function applyBgmVolume(value) {
  const volume = clampVolumeStep(value, 3);
  bgm.volume = volume / 5;
  localStorage.setItem("bgmVolume", String(volume));
  $("#bgmVolumeSlider").value = String(volume);
  $("#bgmVolumeValue").textContent = String(volume);
}

function applySfxVolume(value) {
  const volume = clampVolumeStep(value, 3);
  localStorage.setItem("sfxVolume", String(volume));
  $("#sfxVolumeSlider").value = String(volume);
  $("#sfxVolumeValue").textContent = String(volume);
}

function setAssetLoading(visible) {
  state.assetsLoading = visible;
  const overlay = $("#assetLoadingOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !visible);
}

function emitClientAssetsReady() {
  if (!state.assetsReady || !socket.connected) return;
  socket.emit("clientAssetsReady", { failed: state.assetLoadFailures });
}

function preloadImage(url) {
  if (!url) return Promise.resolve({ src: "", ok: false, img: null });
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve({ src: url, ok: true, img: cached });
  if (failedImageUrls.has(url)) return Promise.resolve({ src: url, ok: false, img: null });
  if (imagePreloadPromises.has(url)) return imagePreloadPromises.get(url);

  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  const promise = new Promise((resolve) => {
    img.addEventListener("load", async () => {
      if (typeof img.decode === "function") {
        try {
          await img.decode();
        } catch {
          // The load event is still enough to use the image; fallback stays available if paint fails.
        }
      }
      imageCache.set(url, img);
      resolve({ src: url, ok: true, img });
    }, { once: true });
    img.addEventListener("error", () => {
      failedImageUrls.add(url);
      console.warn(`[assets] 이미지 로드 실패: ${url}`);
      resolve({ src: url, ok: false, img: null });
    }, { once: true });
  });
  imagePreloadPromises.set(url, promise);
  img.src = url;
  return promise;
}

function isImagePreloaded(url) {
  return imageCache.has(url);
}

function createCachedCardImage(url) {
  const cached = imageCache.get(url);
  const image = cached ? cached.cloneNode(false) : document.createElement("img");
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.decoding = "sync";
  image.loading = "eager";
  image.draggable = false;
  image.width = 256;
  image.height = 256;
  if (!image.src) image.src = url;
  return { image, loaded: Boolean(cached) };
}

function preloadCardImages(card) {
  const urls = [...new Set((card?.items || [])
    .map((item) => CHARACTER_ASSETS[item.characterId])
    .filter(Boolean))];
  return Promise.all(urls.map(preloadImage));
}

function preloadRequiredAssets() {
  if (state.assetsReady) return Promise.resolve([]);
  if (requiredAssetsPromise) return requiredAssetsPromise;

  setAssetLoading(true);
  requiredAssetsPromise = Promise.all(IMAGE_PRELOAD_URLS.map(preloadImage))
    .then((results) => {
      const failures = results.filter((result) => !result.ok).map((result) => result.src);
      state.assetsReady = true;
      state.assetLoadFailures = failures;
      window.assetsReady = true;
      if (failures.length) console.warn("[assets] fallback 사용:", failures);
      emitClientAssetsReady();
      if (state.room) renderRoom(state.room);
      if (state.game) renderGame(state.game);
      return results;
    })
    .finally(() => {
      setAssetLoading(false);
    });
  return requiredAssetsPromise;
}

async function ensureAssetsReady() {
  if (state.assetsReady) return true;
  await preloadRequiredAssets();
  return state.assetsReady;
}

function preloadAssets() {
  preloadRequiredAssets();

  for (const url of AUDIO_PRELOAD_URLS) {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = url;
    audio.load();
    preloadedAudio.set(url, audio);
  }
}

function playBgmTrack() {
  if (!userGestureSeen || bgmSilent) return;
  const tracks = getCurrentBgmTracks();
  if (!tracks.length) return;
  bgm.src = tracks[bgmIndex % tracks.length];
  bgm.play().then(() => {
    bgmStarted = true;
    skippedTracks = 0;
  }).catch(() => {
    // Autoplay policy or a missing file can reject here; the error event handles missing files.
  });
}

function startBgmWhenAllowed() {
  if (state.activeScreen === "nickname" || bgmStarted) return;
  playBgmTrack();
}

function playNextBgmTrack() {
  const tracks = getCurrentBgmTracks();
  if (!tracks.length) return;
  bgmIndex = (bgmIndex + 1) % tracks.length;
  playBgmTrack();
}

function playSound(src) {
  const cached = preloadedAudio.get(src);
  const audio = cached ? cached.cloneNode(true) : new Audio(src);
  audio.volume = getStoredSfxVolume() / 5;
  audio.play().catch(() => {
    // Missing files and browser autoplay restrictions should not break gameplay.
  });
}

function playVictorySoundOnce() {
  playSound(VICTORY_SOUND_ASSET);
}

function playBellSound() {
  playSound(BELL_SOUND_ASSET);
}

function playBellAnimation() {
  const button = $("#bellButton");
  if (!button) return;
  button.classList.remove("bell-pop");
  void button.offsetWidth;
  button.classList.add("bell-pop");
  clearTimeout(bellAnimationTimer);
  bellAnimationTimer = setTimeout(() => button.classList.remove("bell-pop"), 500);
}

bgm.addEventListener("ended", playNextBgmTrack);
bgm.addEventListener("error", () => {
  const tracks = getCurrentBgmTracks();
  if (!tracks.length) return;
  skippedTracks += 1;
  if (skippedTracks >= tracks.length) {
    bgmSilent = true;
    return;
  }
  bgmIndex = (bgmIndex + 1) % tracks.length;
  playBgmTrack();
});

document.addEventListener("click", () => {
  userGestureSeen = true;
  startBgmWhenAllowed();
}, { once: false });

function getHiddenUsers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIDDEN_USERS_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveHiddenUsers(hiddenUsers) {
  localStorage.setItem(HIDDEN_USERS_KEY, JSON.stringify([...hiddenUsers]));
}

function isLobbyGuideCollapsed() {
  return localStorage.getItem(LOBBY_GUIDE_COLLAPSED_KEY) === "true";
}

function applyLobbyGuideCollapsed(collapsed) {
  const button = $("#guideToggleButton");
  const body = $("#guideBody");
  if (!button || !body) return;
  body.classList.toggle("hidden", collapsed);
  button.textContent = collapsed ? "게임 설명 ▼" : "게임 설명 ▲";
  button.setAttribute("aria-expanded", String(!collapsed));
  localStorage.setItem(LOBBY_GUIDE_COLLAPSED_KEY, String(collapsed));
}

function toggleLobbyGuide() {
  applyLobbyGuideCollapsed(!isLobbyGuideCollapsed());
}

function hideUser(nickname) {
  const hiddenUsers = getHiddenUsers();
  hiddenUsers.add(nickname);
  saveHiddenUsers(hiddenUsers);
  renderOnlineUsers();
}

function restoreUser(nickname) {
  const hiddenUsers = getHiddenUsers();
  hiddenUsers.delete(nickname);
  saveHiddenUsers(hiddenUsers);
  renderOnlineUsers();
}

function statusMessage(user) {
  if (user.status === "lobby") return "해당 유저는 아직 방에 없습니다";
  if (user.status === "full") return "해당 방은 가득 찼습니다";
  if (user.status === "playing") return "진행 중인 방에는 입장할 수 없습니다";
  return "";
}

function positionContextMenu(x, y) {
  const menu = $("#userContextMenu");
  menu.classList.remove("hidden");
  const rect = menu.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 12, Math.max(12, x));
  const top = Math.min(window.innerHeight - rect.height - 12, Math.max(12, y));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function hideContextMenu() {
  $("#userContextMenu").classList.add("hidden");
}

function showUserContextMenu(user, x, y) {
  const menu = $("#userContextMenu");
  const joinDisabled = user.status !== "waiting";
  menu.innerHTML = `
    <div class="context-title">${renderName(user)}</div>
    <div class="context-status status-${escapeHtml(user.status)}">${STATUS_ICONS[user.status] || "•"} [${escapeHtml(user.statusLabel)}]</div>
    <button class="context-item join-user ${joinDisabled ? "is-disabled" : ""}" type="button" data-disabled="${joinDisabled}">같이하기</button>
    <button class="context-item hide-user" type="button">숨기기</button>
  `;

  menu.querySelector(".join-user").addEventListener("click", () => {
    if (joinDisabled) {
      showToast(statusMessage(user));
      hideContextMenu();
      return;
    }
    hideContextMenu();
    if (user.roomHasPassword) openPasswordModal(user.roomId, "비밀번호방입니다.\n비밀번호를 입력해 주세요.");
    else socket.emit("joinRoom", { roomId: user.roomId });
  });
  menu.querySelector(".hide-user").addEventListener("click", () => {
    hideUser(user.nickname);
    hideContextMenu();
  });
  positionContextMenu(x, y);
}

function showHiddenUsersMenu(x, y) {
  const hiddenUsers = [...getHiddenUsers()];
  if (!hiddenUsers.length) return;
  const menu = $("#userContextMenu");
  menu.innerHTML = `
    <div class="context-title">숨기기 취소</div>
    ${hiddenUsers.map((nickname) => `<button class="context-item restore-user" data-nickname="${escapeHtml(nickname)}" type="button">${escapeHtml(nickname)}</button>`).join("")}
  `;
  menu.querySelectorAll(".restore-user").forEach((button) => {
    button.addEventListener("click", () => {
      restoreUser(button.dataset.nickname);
      hideContextMenu();
    });
  });
  positionContextMenu(x, y);
}

function renderRankList(selector, rows, mode) {
  const list = $(selector);
  if (!rows?.length) {
    list.innerHTML = "<li>아직 기록이 없습니다</li>";
    return;
  }
  list.innerHTML = rows.map((row) => {
    const value = mode === "rate" ? `${formatWinRate(row.winRate)} · ${row.wins}승` : `${row.wins}승`;
    return `<li>${renderName(row)} <strong>${value}</strong></li>`;
  }).join("");
}

function renderLobby() {
  const lobby = state.lobby;
  if (!lobby) return;
  setText("#onlineCount", `${lobby.onlineCount}명 접속`);

  const stats = lobby.myStats || { wins: 0, losses: 0, winRate: 0 };
  $("#myStats").innerHTML = `
    <div class="stat-box"><span>내 승</span><strong>${stats.wins}</strong></div>
    <div class="stat-box"><span>내 패</span><strong>${stats.losses}</strong></div>
    <div class="stat-box"><span>승률</span><strong>${formatWinRate(stats.winRate)}</strong></div>
  `;

  renderRankList("#topWinsList", lobby.topWins || lobby.top3 || [], "wins");
  renderRankList("#topWinRatesList", lobby.topWinRates || [], "rate");

  const roomList = $("#roomList");
  if (!lobby.rooms.length) {
    roomList.innerHTML = `<div class="room-card empty-room-card"><h3>열린 방 없음</h3><p class="hint-text">방 만들기 버튼으로 새 방을 만들어 주세요.</p></div>`;
    renderOnlineUsers();
    return;
  }

  roomList.innerHTML = "";
  for (const room of lobby.rooms) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `room-card ${room.status !== "waiting" ? "in-progress" : ""}`;
    card.disabled = room.status !== "waiting";
    card.innerHTML = `
      <h3>${escapeHtml(room.title)}</h3>
      <div class="room-meta">
        <span class="pill">${room.currentPlayers}/${room.maxPlayers}</span>
        <span class="badge mode-badge">[${modeLabel(room.mode)}]</span>
        <span class="badge penalty-badge">[${penaltyLabel(room.penaltyMultiplier)}]</span>
        <span class="badge ai-difficulty-badge">[AI: ${aiDifficultyLabel(room.aiDifficulty)}]</span>
        ${room.hasPassword ? `<span class="badge">비번</span>` : ""}
        <span class="badge">${room.status === "waiting" ? "대기중" : "진행중"}</span>
      </div>
      <span class="hint-text">${room.status === "waiting" ? "클릭해서 입장" : "진행 중인 방"}</span>
    `;
    card.addEventListener("click", () => {
      if (room.status !== "waiting") return;
      if (room.hasPassword) openPasswordModal(room.id, "비밀번호방입니다.\n비밀번호를 입력해 주세요.");
      else socket.emit("joinRoom", { roomId: room.id });
    });
    roomList.appendChild(card);
  }
  renderOnlineUsers();
}

function renderOnlineUsers() {
  const list = $("#onlineUsersList");
  if (!state.lobby || !list) return;
  updateOnlineUsersPanelState();
  const hiddenUsers = getHiddenUsers();
  const users = (state.lobby.onlineUsers || []).filter((user) => !hiddenUsers.has(user.nickname));
  if (!users.length) {
    list.innerHTML = `<p class="hint-text">표시할 유저가 없습니다.</p>`;
    return;
  }

  list.innerHTML = "";
  for (const user of users) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `online-user status-${user.status}`;
    item.innerHTML = `
      <span class="status-dot" aria-hidden="true">${STATUS_ICONS[user.status] || "•"}</span>
      <span class="online-user-name">${renderName(user)}</span>
      <span class="badge">[${escapeHtml(user.statusLabel)}]</span>
    `;
    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showUserContextMenu(user, event.clientX, event.clientY);
    });
    list.appendChild(item);
  }
}

function updateOnlineUsersPanelState() {
  const panel = $("#onlineUsersPanel");
  const toggle = $("#onlineUsersToggleButton");
  if (!panel || !toggle) return;
  panel.classList.toggle("collapsed", !state.onlineUsersExpanded);
  toggle.textContent = state.onlineUsersExpanded
    ? "\ud604\uc7ac \uc811\uc18d \uc720\uc800 \u25b2"
    : "\ud604\uc7ac \uc811\uc18d \uc720\uc800 \u25bc";
}

function getTutorialStep() {
  return TUTORIAL_STEPS[state.tutorial.stepIndex] || null;
}

function resetTutorialState(active = false) {
  clearTutorialAdvanceTimer();
  state.tutorial = {
    active,
    stepIndex: 0,
    preparedStep: null,
    waitingFor: null,
    seenCardId: null,
  };
}

function clearTutorialAdvanceTimer() {
  if (tutorialAdvanceTimer) clearTimeout(tutorialAdvanceTimer);
  tutorialAdvanceTimer = null;
}

function scheduleTutorialAdvance(delayMs) {
  clearTutorialAdvanceTimer();
  tutorialAdvanceTimer = setTimeout(() => {
    tutorialAdvanceTimer = null;
    advanceTutorialStep();
  }, delayMs);
}

function clearTutorialHighlight() {
  document.querySelectorAll(".tutorial-highlight").forEach((element) => {
    element.classList.remove("tutorial-highlight");
  });
}

function getSelfZone(game = state.game) {
  const selfId = game?.selfPlayerId;
  if (!selfId) return null;
  return document.querySelector(`[data-player-id="${selfId}"]`);
}

function getTutorialAIPlayer(game = state.game) {
  return game?.players?.find((player) => player.isAI) || null;
}

function getTutorialAIZone(game = state.game) {
  const ai = getTutorialAIPlayer(game);
  return ai ? document.querySelector(`[data-player-id="${ai.id}"]`) : null;
}

function getTutorialTarget(step, game = state.game) {
  if (!step) return null;
  const selfZone = getSelfZone(game);
  const aiZone = getTutorialAIZone(game);
  if (step.target === "menu") return $("#settingsButton");
  if (step.target === "score") return selfZone?.querySelector(".score") || null;
  if (step.target === "deck") return selfZone?.querySelector(".deck-card") || null;
  if (step.target === "openCard") return selfZone?.querySelector(".pile-slot") || null;
  if (step.target === "aiOpenCard") return aiZone?.querySelector(".pile-slot") || aiZone?.querySelector(".deck-card") || null;
  if (step.target === "bell") return $("#bellButton");
  if (step.target === "timer") return $("#turnTimer");
  if (step.target === "board") return $("#gameBoard");
  return null;
}

function applyTutorialHighlight(step, game = state.game) {
  clearTutorialHighlight();
  const target = getTutorialTarget(step, game);
  if (target) target.classList.add("tutorial-highlight");
}

function tutorialStepText(step) {
  if (!step) return "";
  return typeof step.text === "function" ? step.text() : step.text;
}

function tutorialControlHint(step) {
  if (!step) return "";
  if (step.key === "practice") {
    return isMobileMode()
      ? "게임 테이블 터치 → 카드 공개\n게임 테이블 터치 → 종 치기"
      : "카드덱 클릭 → 카드 공개\n스페이스바 또는 종 클릭 → 종 치기";
  }
  if (step.waitingFor === "correctBell" || step.waitingFor === "wrongBell") {
    return isMobileMode()
      ? "게임 화면을 터치해서 종을 칠 수 있습니다."
      : "종을 클릭하거나 스페이스바를 눌러 종을 칠 수 있습니다.";
  }
  if (step.waitingFor === "timeout") {
    return "아무것도 누르지 말고 타이머가 끝날 때까지 기다려보세요.";
  }
  return "";
}

function hideTutorialOverlay() {
  clearTutorialAdvanceTimer();
  $("#tutorialOverlay")?.classList.add("hidden");
  clearTutorialHighlight();
}

function prepareTutorialStep(step, game = state.game) {
  if (!step || state.tutorial.preparedStep === step.key) return;
  state.tutorial.preparedStep = step.key;
  state.tutorial.waitingFor = step.waitingFor || null;

  if (step.key === "deck") {
    const self = getSelfPlayer(game);
    state.tutorial.seenCardId = cardIdentity(self?.topCard);
  }
  if (step.key === "aiTurn") {
    const ai = getTutorialAIPlayer(game);
    state.tutorial.seenCardId = cardIdentity(ai?.topCard);
  }
  if (step.scenario) {
    socket.emit("setTutorialScenario", { scenario: step.scenario });
  }
  if (step.key === "practice") {
    socket.emit("startTutorialPractice");
  }
  if (step.key === "timeout") {
    socket.emit("startTutorialTimeout");
  }
}

function renderTutorialOverlay(game = state.game) {
  const overlay = $("#tutorialOverlay");
  if (!overlay) return;
  const step = getTutorialStep();
  if (!state.tutorial.active || !game?.isTutorial || !step || game.resultVisible || state.gameResult?.isTutorial) {
    hideTutorialOverlay();
    return;
  }

  prepareTutorialStep(step, game);
  applyTutorialHighlight(step, game);
  $("#tutorialStepLabel").textContent = step.label;
  $("#tutorialText").textContent = tutorialStepText(step);
  $("#tutorialControlHint").textContent = tutorialControlHint(step);
  const backButton = $("#tutorialBackButton");
  const nextButton = $("#tutorialNextButton");
  const completeButton = $("#tutorialCompleteButton");
  if (backButton) {
    backButton.disabled = state.tutorial.stepIndex <= 0;
    backButton.classList.toggle("hidden", false);
  }
  nextButton.textContent = step.nextText || "다음";
  nextButton.disabled = state.tutorial.stepIndex >= TUTORIAL_STEPS.length - 1;
  nextButton.classList.toggle("hidden", false);
  completeButton.classList.toggle("hidden", false);
  overlay.classList.remove("hidden");
}

async function advanceTutorialStep() {
  if (!state.tutorial.active) return;
  await ensureAssetsReady();
  clearTutorialAdvanceTimer();
  const current = getTutorialStep();
  state.tutorial.stepIndex = Math.min(state.tutorial.stepIndex + 1, TUTORIAL_STEPS.length - 1);
  state.tutorial.preparedStep = null;
  state.tutorial.waitingFor = null;
  if (current?.key === "win") state.tutorial.seenCardId = null;
  renderTutorialOverlay(state.game);
}

async function goBackTutorialStep() {
  if (!state.tutorial.active || state.tutorial.stepIndex <= 0) return;
  await ensureAssetsReady();
  clearTutorialAdvanceTimer();
  state.tutorial.stepIndex = Math.max(0, state.tutorial.stepIndex - 1);
  state.tutorial.preparedStep = null;
  state.tutorial.waitingFor = null;
  state.tutorial.seenCardId = null;
  renderTutorialOverlay(state.game);
}

function syncTutorialWithGame(game) {
  if (!game?.isTutorial) {
    if (state.tutorial.active) resetTutorialState(false);
    hideTutorialOverlay();
    return;
  }
  if (!state.tutorial.active) resetTutorialState(true);

  renderTutorialOverlay(game);
}

function handleTutorialBellResult(payload) {
  if (!state.tutorial.active || !state.game?.isTutorial) return false;
  void payload;
  return false;
}

function renderRoom(room) {
  if (!room) {
    state.room = null;
    state.game = null;
    state.gameResult = null;
    victoryPlayedForResult = false;
    resetTutorialState(false);
    hideTutorialOverlay();
    const overlay = $("#resultOverlay");
    if (overlay) {
      overlay.className = "result-overlay hidden";
      overlay.innerHTML = "";
    }
    showScreen("lobby");
    renderLobby();
    return;
  }

  closeCreateRoomModal();
  state.room = room;
  state.game = null;
  state.gameResult = null;
  victoryPlayedForResult = false;
  showScreen("room");
  setText("#roomTitle", room.title);
  setText("#roomCount", `[${modeLabel(room.mode)}] [${penaltyLabel(room.penaltyMultiplier)}] [AI: ${aiDifficultyLabel(room.aiDifficulty)}] ${room.players.length}/${room.maxPlayers}`);

  const self = room.players.find((player) => player.id === room.selfPlayerId);
  const isHost = self?.id === room.hostId;
  const humanPlayers = room.players.filter((player) => !player.isAI);
  const allHumansReady = humanPlayers.length > 0 && humanPlayers.every((player) => player.ready);
  const aiDifficultySelect = $("#roomAIDifficultySelect");
  if (aiDifficultySelect) {
    aiDifficultySelect.value = room.aiDifficulty || "intermediate";
    aiDifficultySelect.disabled = !isHost || room.status !== "waiting";
  }
  const playerList = $("#roomPlayers");
  playerList.innerHTML = "";

  for (const player of room.players) {
    const item = document.createElement("article");
    item.className = "waiting-player";
    item.innerHTML = `
      <h3>${renderName(player)} ${renderHostBadge(player)}</h3>
      <div class="badge-row">
        ${player.isHost ? `<span class="badge host">방장</span>` : ""}
        ${player.isAI ? `<span class="badge ai">[AI]</span>` : ""}
        ${player.isAI ? `<span class="badge ai-difficulty-badge">AI ${aiDifficultyLabel(room.aiDifficulty)}</span>` : ""}
        ${player.isAI ? "" : `<span class="badge ${player.assetsReady ? "ready" : "not-ready"}">${player.assetsReady ? "[이미지 준비]" : "[이미지 로딩]"}</span>`}
        <span class="badge ${player.ready ? "ready" : "not-ready"}">${player.ready ? "[준비]" : "[미준비]"}</span>
      </div>
    `;
    playerList.appendChild(item);
  }
  for (let index = room.players.length; index < 6; index += 1) {
    const item = document.createElement("article");
    item.className = "waiting-player empty-slot";
    item.innerHTML = `
      <h3>빈 자리</h3>
      <div class="badge-row">
        <span class="badge not-ready">대기</span>
      </div>
    `;
    playerList.appendChild(item);
  }

  $("#readyButton").textContent = self?.ready ? "준비 취소" : "준비";
  $("#readyButton").disabled = !self;
  $("#addAIButton").disabled = !isHost || room.status !== "waiting" || room.players.length >= room.maxPlayers || allHumansReady;
  $("#removeAIButton").disabled = !isHost || !room.players.some((player) => player.isAI);
  $("#startGameButton").disabled = !isHost || !room.canStart || !state.assetsReady;
  $("#roomHint").textContent = state.assetsReady
    ? "게임 시작 조건: 총 2명 이상"
    : "이미지 로딩이 끝나면 게임을 시작할 수 있습니다";
}

function getSeatPosition(index, count) {
  if (isMobileMode()) return getMobileSeatPosition(index, count);
  const layouts = {
    1: [{ left: 50, top: 50 }],
    2: [{ left: 24, top: 50 }, { left: 76, top: 50 }],
    3: [{ left: 50, top: 21 }, { left: 24, top: 79 }, { left: 76, top: 79 }],
    4: [{ left: 28, top: 22 }, { left: 72, top: 22 }, { left: 28, top: 78 }, { left: 72, top: 78 }],
    5: [{ left: 20, top: 21 }, { left: 50, top: 21 }, { left: 80, top: 21 }, { left: 35, top: 79 }, { left: 65, top: 79 }],
    6: [{ left: 18, top: 21 }, { left: 50, top: 21 }, { left: 82, top: 21 }, { left: 18, top: 79 }, { left: 50, top: 79 }, { left: 82, top: 79 }],
  };
  return (layouts[count] || layouts[6])[index] || { left: 50, top: 50 };
}

function getMobileSeatPosition(index, count) {
  const layouts = {
    1: [{ left: 50, top: 74 }],
    2: [{ left: 50, top: 25 }, { left: 50, top: 78 }],
    3: [{ left: 50, top: 23 }, { left: 29, top: 78 }, { left: 71, top: 78 }],
    4: [{ left: 29, top: 24 }, { left: 71, top: 24 }, { left: 29, top: 78 }, { left: 71, top: 78 }],
    5: [{ left: 29, top: 22 }, { left: 71, top: 22 }, { left: 29, top: 74 }, { left: 71, top: 74 }, { left: 50, top: 86 }],
    6: [{ left: 29, top: 21 }, { left: 71, top: 21 }, { left: 29, top: 72 }, { left: 71, top: 72 }, { left: 29, top: 86 }, { left: 71, top: 86 }],
  };
  return (layouts[count] || layouts[6])[index] || { left: 50, top: 82 };
}

function updateResponsiveSizes() {
  const root = document.documentElement;
  const count = state.game?.players?.length || 6;
  const board = $("#gameBoard") || document.querySelector(".game-board");
  const boardRect = board?.getBoundingClientRect();
  const width = Math.max(360, Math.floor(boardRect?.width || window.innerWidth));
  const height = Math.max(420, Math.floor(boardRect?.height || window.innerHeight - 104));
  if (isMobileMode()) {
    const mobileWidth = Math.max(320, width);
    const openWidth = Math.round(Math.min(74, Math.max(58, mobileWidth * 0.18)));
    const deckWidth = Math.round(openWidth * 0.72);
    const deckOffset = deckWidth + Math.max(4, Math.round(openWidth * 0.06));
    const bellSize = Math.round(Math.min(106, Math.max(78, mobileWidth * 0.24)));
    const seatWidth = Math.round(openWidth + deckOffset + 8);
    const cardScale = openWidth / 160;
    const playerScale = Math.min(0.72, Math.max(0.56, cardScale));
    const timerScale = Math.min(0.78, Math.max(0.68, mobileWidth / 430));

    root.style.setProperty("--table-scale", "0.720");
    root.style.setProperty("--card-scale", cardScale.toFixed(3));
    root.style.setProperty("--player-scale", playerScale.toFixed(3));
    root.style.setProperty("--timer-scale", timerScale.toFixed(3));
    root.style.setProperty("--open-card-width", `${openWidth}px`);
    root.style.setProperty("--open-card-height", `${Math.round(openWidth * 4 / 3)}px`);
    root.style.setProperty("--deck-card-width", `${deckWidth}px`);
    root.style.setProperty("--deck-card-height", `${Math.round(deckWidth * 4 / 3)}px`);
    root.style.setProperty("--card-width", `${openWidth}px`);
    root.style.setProperty("--card-height", `${Math.round(openWidth * 4 / 3)}px`);
    root.style.setProperty("--bell-size", `${bellSize}px`);
    root.style.setProperty("--seat-width", `${seatWidth}px`);
    root.style.setProperty("--deck-offset", `${deckOffset}px`);
    return;
  }
  const boardHeight = Math.max(420, height);
  const tableScale = Math.min(1.35, Math.max(0.72, Math.min(width / 1030, height / 620)));
  const targetByCount = count <= 2 ? 300 : count <= 3 ? 220 : count <= 4 ? 160 : count <= 5 ? 140 : 130;
  const widthLimitByCount = count <= 2 ? width / 4.4 : count <= 3 ? width / 5.6 : count <= 4 ? width / 6.4 : width / 8.55;
  const heightLimitByCount = count <= 2 ? boardHeight / 2.25 : count <= 3 ? boardHeight / 2.8 : count <= 4 ? boardHeight / 3.35 : boardHeight / 4.45;
  let openWidth = Math.floor(Math.min(targetByCount * tableScale, widthLimitByCount, heightLimitByCount));

  openWidth = Math.max(count >= 5 ? 112 : 122, openWidth);
  const deckWidth = Math.max(78, Math.round(openWidth * 0.74));
  const deckOffset = deckWidth + Math.max(5, Math.round(openWidth * 0.04));
  const bellBase = count <= 2 ? 178 : count <= 4 ? 138 : 123;
  const bellSize = Math.max(96, Math.min(210, Math.round(bellBase * tableScale)));
  const seatWidth = Math.round(openWidth + deckOffset + 8);
  const cardScale = openWidth / 160;
  const playerScale = Math.min(1.08, Math.max(0.72, cardScale));
  const timerScale = Math.min(1.05, Math.max(0.78, tableScale));

  root.style.setProperty("--table-scale", tableScale.toFixed(3));
  root.style.setProperty("--card-scale", cardScale.toFixed(3));
  root.style.setProperty("--player-scale", playerScale.toFixed(3));
  root.style.setProperty("--timer-scale", timerScale.toFixed(3));
  root.style.setProperty("--open-card-width", `${openWidth}px`);
  root.style.setProperty("--open-card-height", `${Math.round(openWidth * 4 / 3)}px`);
  root.style.setProperty("--deck-card-width", `${deckWidth}px`);
  root.style.setProperty("--deck-card-height", `${Math.round(deckWidth * 4 / 3)}px`);
  root.style.setProperty("--card-width", `${openWidth}px`);
  root.style.setProperty("--card-height", `${Math.round(openWidth * 4 / 3)}px`);
  root.style.setProperty("--bell-size", `${bellSize}px`);
  root.style.setProperty("--seat-width", `${seatWidth}px`);
  root.style.setProperty("--deck-offset", `${deckOffset}px`);
}

function cardIdentity(card) {
  return card?.cardId || card?.id || "";
}

function createPlayerZone(playerId) {
  const zone = document.createElement("article");
  zone.className = "player-zone";
  zone.dataset.playerId = playerId;
  zone.innerHTML = `
    <header class="player-head">
      <div class="player-name"></div>
      <div class="score"></div>
    </header>
    <div class="card-stack">
      <div class="deck-slot"></div>
      <div class="pile-slot"></div>
    </div>
    <div class="score-delta-layer" aria-hidden="true"></div>
    <div class="eliminated-badge">탈락</div>
  `;
  return zone;
}

function applyCardHighlight(cardElement, highlight = []) {
  const highlighted = new Set(highlight);
  for (const piece of cardElement.querySelectorAll(".character-piece")) {
    piece.classList.toggle("highlighted", highlighted.has(piece.dataset.characterId));
  }
}

function syncDeckCard(deckSlot, canFlip, visible) {
  if (!visible) {
    deckSlot.replaceChildren();
    return;
  }

  let deck = deckSlot.querySelector(".deck-card");
  if (!deck) {
    deck = renderDeckCard(false);
    deckSlot.replaceChildren(deck);
  }
  deck.classList.toggle("clickable", canFlip);
  deck.disabled = !canFlip;
  deck.onclick = canFlip ? () => requestFlipCard() : null;
}

function syncPileCard(pileSlot, card, highlight) {
  if (!card) {
    const currentEmpty = pileSlot.querySelector(".empty-card-space");
    if (!currentEmpty || pileSlot.children.length !== 1) {
      pileSlot.replaceChildren(renderEmptyCardSpace());
    }
    return;
  }

  preloadCardImages(card);
  const nextCardId = cardIdentity(card);
  const currentCard = pileSlot.querySelector(".front-card");
  if (!currentCard || currentCard.dataset.cardId !== nextCardId) {
    pileSlot.replaceChildren(renderFrontCard(card, highlight));
    return;
  }
  applyCardHighlight(currentCard, highlight);
}

function renderEmptyCardSpace() {
  const space = document.createElement("div");
  space.className = "empty-card-space";
  space.setAttribute("aria-hidden", "true");
  return space;
}

function renderGame(game) {
  const previousRoomId = state.game?.roomId;
  state.game = game;
  state.room = null;
  if (previousRoomId !== game.roomId) {
    state.mobileInfoRoomId = game.roomId;
    state.mobileGameInfoExpanded = false;
  }
  showScreen("game");
  document.body.classList.toggle("is-tutorial-game", Boolean(game.isTutorial));
  startBgmWhenAllowed();
  updateMobileMode();
  updateResponsiveSizes();

  setText("#gameModeBadge", `[${modeLabel(game.mode)}]`);
  setText("#gamePenaltyBadge", `[${penaltyLabel(game.penaltyMultiplier)}]`);
  setText("#gameTurnLimitBadge", `턴 제한: ${Number(game.turnTime || game.turnDurationMs / 1000 || 6)}초`);

  const wrap = $("#gamePlayers");
  const playerCount = game.players.length;
  wrap.className = `game-players players-${playerCount}`;
  const highlight = game.matchedCharacters || [];
  const existingZones = new Map([...wrap.querySelectorAll(".player-zone")]
    .map((zone) => [zone.dataset.playerId, zone]));
  const seenPlayers = new Set();

  game.players.forEach((player, index) => {
    const seat = getSeatPosition(index, playerCount);
    let zone = existingZones.get(player.id);
    if (!zone) {
      zone = createPlayerZone(player.id);
      wrap.appendChild(zone);
    }
    seenPlayers.add(player.id);
    zone.style.left = `${seat.left}%`;
    zone.style.top = `${seat.top}%`;
    zone.classList.toggle("current-turn", player.id === game.currentTurnPlayerId);
    zone.classList.toggle("eliminated", player.spectator || player.eliminated);

    const isSelf = player.id === game.selfPlayerId;
    const canFlip = isSelf && isFlipAvailable(game);

    const turnChip = player.id === game.currentTurnPlayerId
      ? `<span class="current-turn-chip">${isSelf ? "내 차례" : "차례"}</span>`
      : "";
    zone.querySelector(".player-name").innerHTML = `${renderName(player)} ${renderHostBadge(player)} ${turnChip}`;
    zone.querySelector(".score").textContent = player.score;

    const deckSlot = zone.querySelector(".deck-slot");
    syncDeckCard(deckSlot, canFlip, !player.spectator);

    const pileSlot = zone.querySelector(".pile-slot");
    syncPileCard(pileSlot, player.topCard, highlight);
  });

  for (const [playerId, zone] of existingZones) {
    if (!seenPlayers.has(playerId)) zone.remove();
  }

  startTurnTimer(game);
  renderGameInfoPanel(game);
  updateMobileGameInfoPanel();
  updateMobileTouchHint(game);
  scheduleFlipAvailabilityRefresh(game);
  updateGameOverlay(game);
  syncTutorialWithGame(game);
}

function renderGameInfoPanel(game) {
  renderReactionSpeeds(game.recentReactionSpeeds || []);
  renderGameUsers(game.players || []);
  renderLatency();
  renderMobileBoardStats(game);
}

function renderReactionSpeeds(rows) {
  const list = $("#reactionSpeedList");
  if (!list) return;
  const topRows = rows.slice(0, 3);
  if (!topRows.length) {
    list.innerHTML = `<li class="empty-info">정답 대기 중</li>`;
    return;
  }
  list.innerHTML = topRows.map((row, index) => `
    <li>
      <span>${index + 1}위 ${escapeHtml(formatReactionPlayerName(row))}</span>
      <strong>${(Number(row.reactionMs || 0) / 1000).toFixed(3)}s</strong>
    </li>
  `).join("");
}

function formatReactionPlayerName(row) {
  const name = row.displayName || row.nickname || "";
  if (!row.isAI) return name;
  return `AI ${name.replace(/^AI\s+/, "")}`;
}

function renderGameUsers(players) {
  const list = $("#gameUserInfoList");
  if (!list) return;
  list.innerHTML = players.map((player) => {
    const stats = player.stats || {};
    const meta = state.game?.isTutorial
      ? (player.isAI ? "느린 튜토리얼 AI" : "튜토리얼 참여중")
      : player.isAI
        ? `AI ${aiDifficultyLabel(player.aiDifficulty)}`
        : `${Number(stats.wins || 0)}승 ${Number(stats.losses || 0)}패 ${formatWinRate(stats.winRate)}`;
    return `
      <article class="game-user-info ${player.eliminated || player.spectator ? "is-eliminated" : ""}">
        <strong>${renderName(player)} ${renderHostBadge(player)}</strong>
        <span>${escapeHtml(meta)}</span>
      </article>
    `;
  }).join("");
}

function renderLatency() {
  const element = $("#serverLatencyValue");
  const mobileElement = $("#mobileLatencyValue");
  if (!element && !mobileElement) return;
  const applyLatencyClass = (target, className) => {
    if (!target) return;
    target.classList.remove("latency-good", "latency-warn", "latency-bad", "latency-measuring");
    target.classList.add(className);
  };
  if (state.latency.state === "unstable") {
    if (element) element.textContent = "불안정";
    if (mobileElement) mobileElement.textContent = "불안정";
    applyLatencyClass(element, "latency-bad");
    applyLatencyClass(mobileElement, "latency-bad");
    return;
  }
  if (!Number.isFinite(state.latency.value)) {
    if (element) element.textContent = "측정 중";
    if (mobileElement) mobileElement.textContent = "측정 중";
    applyLatencyClass(element, "latency-measuring");
    applyLatencyClass(mobileElement, "latency-measuring");
    return;
  }
  const value = Math.round(state.latency.value);
  const className = value <= 80 ? "latency-good" : value <= 150 ? "latency-warn" : "latency-bad";
  if (element) element.textContent = `${value}ms`;
  if (mobileElement) mobileElement.textContent = `${value}ms`;
  applyLatencyClass(element, className);
  applyLatencyClass(mobileElement, className);
}

function renderMobileBoardStats(game = state.game) {
  const reaction = $("#mobileReactionTop");
  if (!reaction) return;
  const top = game?.recentReactionSpeeds?.[0];
  reaction.textContent = top
    ? `${formatReactionPlayerName(top)} ${(Number(top.reactionMs || 0) / 1000).toFixed(3)}s`
    : "-";
}

function sendLatencyPing() {
  if (!socket.connected) return;
  const nonce = `${Date.now()}-${latencyNonce++}`;
  pendingLatencyPings.set(nonce, Date.now());
  socket.emit("latencyPing", { nonce, sentAt: Date.now() });
  setTimeout(() => {
    if (!pendingLatencyPings.has(nonce)) return;
    pendingLatencyPings.delete(nonce);
    state.latency = { value: null, state: "unstable" };
    renderLatency();
  }, 2500);
}

function isAnyModalOpen() {
  return [...document.querySelectorAll(".modal-backdrop")].some((modal) => !modal.classList.contains("hidden"));
}

function shouldIgnoreMobileGameTouch(event) {
  if (!isMobileMode() || state.activeScreen !== "game") return true;
  if (isAnyModalOpen()) return true;
  if (!$("#settingsPanel")?.classList.contains("hidden")) return true;
  return Boolean(event.target.closest([
    "button",
    "input",
    "select",
    "textarea",
    "label",
    "a",
    "#settingsPanel",
    "#settingsButton",
    "#gameInfoPanel",
    "#gameInfoToggleButton",
    "#resultOverlay",
    ".modal-backdrop",
    ".modal-card",
  ].join(",")));
}

async function handleMobileGameBoardTouch(event) {
  if (shouldIgnoreMobileGameTouch(event)) return;
  const now = Date.now();
  if (now - mobileTouchLastAt < 300) return;

  const tutorialStep = getTutorialStep();
  if (state.game?.isTutorial && (tutorialStep?.waitingFor === "correctBell" || tutorialStep?.waitingFor === "wrongBell")) {
    mobileTouchLastAt = now;
    event.preventDefault();
    socket.emit("ringBell");
    return;
  }

  if (isBellAvailable()) {
    mobileTouchLastAt = now;
    event.preventDefault();
    socket.emit("ringBell");
    return;
  }
  if (isFlipAvailable()) {
    mobileTouchLastAt = now;
    event.preventDefault();
    await requestFlipCard();
  }
}

function startLatencyMonitor() {
  if (latencyTimer) return;
  sendLatencyPing();
  latencyTimer = setInterval(sendLatencyPing, 5000);
}

function showScoreDeltas(changes = []) {
  if (!Array.isArray(changes)) return;
  for (const change of changes) {
    if (!change || !Number.isFinite(Number(change.delta))) continue;
    const zone = document.querySelector(`[data-player-id="${change.playerId}"]`);
    const layer = zone?.querySelector(".score-delta-layer");
    if (!layer) continue;
    const badge = document.createElement("div");
    badge.className = `score-delta ${change.delta > 0 ? "positive" : "negative"}`;
    badge.textContent = `${change.delta > 0 ? "+" : ""}${change.delta}`;
    layer.appendChild(badge);
    setTimeout(() => badge.remove(), 1100);
  }
}

function renderDeckCard(clickable) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `deck-card ${clickable ? "clickable" : ""}`;
  card.disabled = !clickable;
  card.title = "카드덱";
  const pattern = document.createElement("div");
  pattern.className = "deck-pattern";
  pattern.setAttribute("aria-hidden", "true");
  const image = document.createElement("img");
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.decoding = "async";
  image.loading = "eager";
  image.draggable = false;
  image.width = 264;
  image.height = 352;
  image.src = CARD_BACK_ASSET;
  card.replaceChildren(pattern, image);
  image.addEventListener("error", (event) => {
    event.currentTarget.remove();
  });
  return card;
}

function renderFrontCard(card, highlight = []) {
  const element = document.createElement("div");
  element.className = "front-card";
  element.dataset.cardId = cardIdentity(card);
  const firstCharacter = card.items?.[0]?.characterId || "nano";
  element.style.background = `linear-gradient(160deg, #fff, ${CARD_COLORS[firstCharacter] || "#edf7ff"})`;

  const total = Math.max(1, card.items?.length || 1);
  for (const item of card.items || []) {
    const slot = CARD_SLOTS[item.slot] || CARD_SLOTS[3];
    const piece = document.createElement("div");
    piece.className = "character-piece";
    piece.dataset.characterId = item.characterId;
    piece.classList.toggle("highlighted", highlight.includes(item.characterId));
    piece.style.left = slot.left;
    piece.style.top = slot.top;
    piece.style.width = CHARACTER_SIZE_BY_COUNT[total] || "34%";
    piece.style.height = CHARACTER_SIZE_BY_COUNT[total] || "34%";
    const imageUrl = CHARACTER_ASSETS[item.characterId];
    const fallback = document.createElement("div");
    fallback.className = "character-fallback";
    fallback.setAttribute("aria-hidden", "true");
    fallback.textContent = CHARACTER_FALLBACK_LABELS[item.characterId] || "?";
    const { image, loaded } = createCachedCardImage(imageUrl);
    if (loaded) piece.classList.add("image-loaded");
    piece.replaceChildren(fallback, image);
    preloadImage(imageUrl).then((result) => {
      if (result.ok) piece.classList.add("image-loaded");
    });
    image.addEventListener("load", () => {
      piece.classList.add("image-loaded");
    });
    image.addEventListener("error", (event) => {
      event.currentTarget.remove();
    });
    element.appendChild(piece);
  }
  return element;
}

function stopTurnTimer() {
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  turnTimerInterval = null;
}

function startTurnTimer(game) {
  stopTurnTimer();
  const timer = $("#turnTimer");
  const render = () => {
    if (!game.turnEndsAt || game.bellLocked || game.status !== "playing") {
      timer.textContent = "--";
      timer.classList.remove("urgent");
      return;
    }
    const remaining = Math.max(0, (game.turnEndsAt - Date.now()) / 1000);
    const maxVisible = Number(game.turnDurationMs || 0) > 0
      ? Number(game.turnDurationMs) / 1000
      : Number(game.turnTime || remaining);
    const visibleRemaining = Math.min(remaining, maxVisible);
    timer.textContent = visibleRemaining.toFixed(1);
    timer.classList.toggle("urgent", visibleRemaining <= 1.5);
  };
  render();
  turnTimerInterval = setInterval(render, 100);
}

function updateGameOverlay(game) {
  const overlay = $("#resultOverlay");
  overlay.className = "result-overlay hidden";
  overlay.innerHTML = "";

  if (state.gameResult) {
    overlay.className = "result-overlay result-card";
    overlay.innerHTML = renderGameResult(state.gameResult);
    overlay.querySelector(".overlay-leave-button")?.addEventListener("click", () => socket.emit("leaveRoom"));
    overlay.querySelector(".overlay-watch-button")?.addEventListener("click", () => {
      state.gameResult = null;
      updateGameOverlay(state.game || { players: [] });
    });
    return;
  }

  const self = game.players?.find((player) => player.id === game.selfPlayerId);
  if (self && !self.spectator) state.spectatorOverlayDismissedFor = null;
  if (self?.spectator && game.status === "playing" && state.spectatorOverlayDismissedFor !== self.id) {
    overlay.className = "result-overlay result-card";
    overlay.innerHTML = `
      <div class="result-box">
        <h2>패배</h2>
        <p class="hint-text">관전모드로 보거나 바로 나갈 수 있습니다</p>
        <div class="result-actions">
          <button class="secondary-button overlay-watch-button" type="button">관전모드</button>
          <button class="primary-button overlay-leave-button" type="button">나가기</button>
        </div>
      </div>
    `;
    overlay.querySelector(".overlay-watch-button").addEventListener("click", () => {
      state.spectatorOverlayDismissedFor = self.id;
      updateGameOverlay(game);
    });
    overlay.querySelector(".overlay-leave-button").addEventListener("click", () => socket.emit("leaveRoom"));
    return;
  }

  if (game.wrongFlash) {
    overlay.classList.remove("hidden");
    overlay.textContent = "X";
  }
}

function renderGameResult(result) {
  if (result.isTutorial) {
    return `
      <div class="result-box tutorial-result-box">
        <h2>튜토리얼 완료!</h2>
        <p class="hint-text">이제 실제 게임에 참가해보세요.</p>
        <div class="result-actions">
          <button class="primary-button overlay-leave-button" type="button">튜토리얼 종료</button>
        </div>
      </div>
    `;
  }

  const isWinner = result.winner?.id === result.selfPlayerId;
  const title = isWinner ? "승리" : "패배";
  const hint = isWinner
    ? "5초 후 자동 이동하거나 지금 대기실로 이동할 수 있습니다"
    : "관전모드로 보거나 바로 나갈 수 있습니다";
  const rows = result.players
    .map((player) => `
      <div>
        <strong>${renderName(player)}</strong>
        <span>${player.isAI ? "[AI]" : ""}</span>
        <span>${player.score}점</span>
        <span>${player.eliminated || player.spectator ? "탈락" : "생존"}</span>
      </div>
    `)
    .join("");

  return `
    <div class="result-box">
      <h2>${title}</h2>
      <p class="hint-text">${hint}</p>
      <p class="hint-text">승자: ${renderName(result.winner)}</p>
      ${result.statsExcluded ? `<p class="hint-text">AI 포함 게임은 전적에 반영되지 않습니다</p>` : ""}
      <div class="result-actions">
        ${isWinner ? "" : `<button class="secondary-button overlay-watch-button" type="button">관전모드</button>`}
        <button class="primary-button overlay-leave-button" type="button">${isWinner ? "대기실 이동" : "나가기"}</button>
      </div>
      <div class="result-score-list">${rows}</div>
    </div>
  `;
}

function openCreateRoomModal() {
  closeSettingsPanel();
  $("#createError").textContent = "";
  $("#createRoomModal").classList.remove("hidden");
  $("#roomTitleInput").focus();
}

function closeCreateRoomModal() {
  $("#createRoomModal").classList.add("hidden");
}

function openPasswordModal(roomId, message = "") {
  hideContextMenu();
  state.passwordRoomId = roomId;
  $("#passwordError").textContent = message;
  $("#passwordJoinInput").value = "";
  $("#passwordModal").classList.remove("hidden");
  $("#passwordJoinInput").focus();
}

function closePasswordModal() {
  state.passwordRoomId = null;
  $("#passwordModal").classList.add("hidden");
}

function openNicknameChangeModal() {
  $("#settingsPanel").classList.add("hidden");
  $("#nicknameChangeError").textContent = "";
  $("#nicknameChangeInput").value = state.nickname || "";
  $("#nicknameChangeModal").classList.remove("hidden");
  $("#nicknameChangeInput").focus();
}

function closeNicknameChangeModal() {
  $("#nicknameChangeModal").classList.add("hidden");
}

function closeSettingsPanel() {
  $("#settingsPanel").classList.add("hidden");
}

function setupBellImage() {
  const button = $("#bellButton");
  const image = $("#bellImage");
  if (!button || !image) return;
  const markReady = () => {
    button.classList.add("bell-image-ready");
    button.classList.remove("bell-fallback-ready");
  };
  const markFallback = () => {
    button.classList.remove("bell-image-ready");
    button.classList.add("bell-fallback-ready");
    image.remove();
  };
  image.addEventListener("load", markReady);
  image.addEventListener("error", markFallback);
  image.src = BELL_IMAGE_URL;
  if (image.complete) {
    if (image.naturalWidth > 0) markReady();
    else markFallback();
  }
}

$("#nicknameForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const nickname = $("#nicknameInput").value.trim();
  $("#nicknameError").textContent = "";
  if (!nickname || nickname.length > 6) {
    $("#nicknameError").textContent = "닉네임은 1~6자로 입력해 주세요.";
    return;
  }
  state.nickname = nickname;
  socket.emit("joinLobby", { nickname });
});

$("#openCreateRoomButton").addEventListener("click", openCreateRoomModal);
$("#guideToggleButton")?.addEventListener("click", toggleLobbyGuide);
$("#tutorialButton")?.addEventListener("click", async () => {
  closeSettingsPanel();
  await ensureAssetsReady();
  resetTutorialState(true);
  socket.emit("startTutorial");
});
$("#closeCreateRoomModalButton").addEventListener("click", closeCreateRoomModal);
$("#createRoomModal").addEventListener("click", (event) => {
  if (event.target.id === "createRoomModal") closeCreateRoomModal();
});

$("#createRoomForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("#roomTitleInput").value.trim();
  const isPrivate = $("#privateRoomCheck").checked;
  const password = $("#roomPasswordInput").value.trim();
  const maxPlayers = Number($("#maxPlayersSelect").value);
  const aiCount = Number($("#aiCountSelect").value);
  const mode = document.querySelector("input[name='gameMode']:checked")?.value || "normal";
  const penaltyMultiplier = Number(document.querySelector("input[name='penaltyMultiplier']:checked")?.value || 1);
  const turnTime = Number(document.querySelector("input[name='turnTime']:checked")?.value || 6);
  const aiDifficulty = $("#aiDifficultySelect")?.value || "intermediate";
  $("#createError").textContent = "";

  if (!title || title.length > 10) {
    $("#createError").textContent = "방 제목은 1~10자로 입력해 주세요.";
    return;
  }
  if (isPrivate && !/^[0-9]{1,6}$/.test(password)) {
    $("#createError").textContent = "비밀번호는 숫자 1~6자리여야 합니다.";
    return;
  }
  if (aiCount + 1 > maxPlayers) {
    $("#createError").textContent = "AI 수가 최대 인원을 초과합니다.";
    return;
  }

  socket.emit("createRoom", { title, isPrivate, password, maxPlayers, aiCount, mode, penaltyMultiplier, turnTime, aiDifficulty });
});

$("#privateRoomCheck").addEventListener("change", (event) => {
  $("#passwordCreateRow").classList.toggle("hidden", !event.target.checked);
});

$("#roomPasswordInput").addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
});

$("#passwordJoinInput").addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
});

$("#passwordForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const password = $("#passwordJoinInput").value.trim();
  if (!/^[0-9]{1,6}$/.test(password)) {
    $("#passwordError").textContent = "비밀번호는 숫자 1~6자리여야 합니다.";
    return;
  }
  socket.emit("submitRoomPassword", { roomId: state.passwordRoomId, password });
});

$("#cancelPasswordButton").addEventListener("click", closePasswordModal);
$("#nicknameChangeButton").addEventListener("click", openNicknameChangeModal);
$("#cancelNicknameChangeButton").addEventListener("click", closeNicknameChangeModal);
$("#nicknameChangeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const nickname = $("#nicknameChangeInput").value.trim();
  $("#nicknameChangeError").textContent = "";
  if (!nickname || nickname.length > 6) {
    $("#nicknameChangeError").textContent = "닉네임은 1~6자로 입력해 주세요.";
    return;
  }
  socket.emit("changeNickname", { nickname });
});

$("#readyButton").addEventListener("click", () => socket.emit("toggleReady"));
$("#addAIButton").addEventListener("click", () => {
  if ($("#addAIButton").disabled) return;
  socket.emit("addAI");
});
$("#removeAIButton").addEventListener("click", () => socket.emit("removeAI"));
$("#roomAIDifficultySelect")?.addEventListener("change", (event) => {
  socket.emit("setAIDifficulty", { aiDifficulty: event.target.value });
});
$("#startGameButton").addEventListener("click", async () => {
  await ensureAssetsReady();
  socket.emit("startGame");
});
$("#roomLeaveButton").addEventListener("click", () => socket.emit("leaveRoom"));
$("#bellButton").addEventListener("click", () => socket.emit("ringBell"));
$("#tutorialBackButton")?.addEventListener("click", goBackTutorialStep);
$("#tutorialNextButton")?.addEventListener("click", advanceTutorialStep);
$("#tutorialCompleteButton")?.addEventListener("click", () => socket.emit("completeTutorial"));
$("#gameBoard")?.addEventListener("pointerup", handleMobileGameBoardTouch);
$("#gameInfoToggleButton")?.addEventListener("click", () => {
  state.mobileGameInfoExpanded = !state.mobileGameInfoExpanded;
  updateMobileGameInfoPanel();
});
$("#refreshUsersButton").addEventListener("click", () => socket.emit("refreshLobby"));
$("#onlineUsersToggleButton").addEventListener("click", (event) => {
  event.stopPropagation();
  closeSettingsPanel();
  state.onlineUsersExpanded = !state.onlineUsersExpanded;
  updateOnlineUsersPanelState();
});

$("#settingsButton").addEventListener("click", (event) => {
  event.stopPropagation();
  $("#settingsPanel").classList.toggle("hidden");
});

$("#bgmVolumeSlider").addEventListener("input", (event) => {
  applyBgmVolume(event.target.value);
});

$("#bgmModeSelect").addEventListener("change", (event) => {
  applyBgmMode(event.target.value, true);
});

$("#sfxVolumeSlider").addEventListener("input", (event) => {
  applySfxVolume(event.target.value);
});

$("#leaveButton").addEventListener("click", () => {
  closeSettingsPanel();
  if (state.activeScreen === "game" && state.game?.isTutorial) {
    socket.emit("completeTutorial");
    return;
  }
  if (state.activeScreen === "room" || state.activeScreen === "game") {
    socket.emit("leaveRoom");
    return;
  }
  if (state.activeScreen === "lobby") {
    socket.disconnect();
    state.nickname = "";
    state.lobby = null;
    state.room = null;
    state.game = null;
    resetTutorialState(false);
    hideTutorialOverlay();
    showScreen("nickname");
    socket.connect();
  }
});

$("#onlineUsersPanel").addEventListener("click", (event) => {
  if (event.target.closest(".online-user") || event.target.closest(".mini-button")) return;
  showHiddenUsersMenu(event.clientX, event.clientY);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("#settingsPanel") && !event.target.closest("#settingsButton")) closeSettingsPanel();
  if (event.target.closest("#userContextMenu") || event.target.closest("#onlineUsersPanel")) return;
  hideContextMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideContextMenu();
    closeCreateRoomModal();
    closeSettingsPanel();
  }
  if (isFormFieldFocused() || state.activeScreen !== "game") return;
  if (event.code === "Space") {
    event.preventDefault();
    socket.emit("ringBell");
  }
  if (/^Numpad[1-5]$/.test(event.code)) {
    socket.emit("sendEmote", { emote: event.code.replace("Numpad", "") });
  }
});

window.addEventListener("resize", () => {
  updateMobileMode();
  updateResponsiveSizes();
});

updateMobileMode();

socket.on("nicknameError", (message) => {
  $("#nicknameError").textContent = message;
  showScreen("nickname");
});

socket.on("nicknameChangeResult", (payload) => {
  if (!payload.success) {
    $("#nicknameChangeError").textContent = payload.message || "닉네임 변경에 실패했습니다.";
    return;
  }
  state.nickname = payload.nickname;
  closeNicknameChangeModal();
  showToast(payload.message || "닉네임이 변경되었습니다.");
});

socket.on("lobbyState", (payload) => {
  state.lobby = payload;
  if (payload.currentUser?.nickname) state.nickname = payload.currentUser.nickname;
  renderLobby();
  if (!state.room && !state.game) {
    showScreen("lobby");
    startBgmWhenAllowed();
  }
});

socket.on("roomState", (payload) => {
  if (payload) {
    closePasswordModal();
    closeCreateRoomModal();
  }
  renderRoom(payload);
});

socket.on("gameState", async (payload) => {
  if (!payload) return;
  await ensureAssetsReady();
  renderGame(payload);
});

socket.on("roomPasswordError", (payload) => {
  if (payload?.needsPassword) openPasswordModal(payload.roomId, payload.message || "");
  else showToast(payload?.message || "비밀번호 오류");
});

socket.on("errorMessage", (message) => {
  showToast(message);
  if (!$("#createRoomModal").classList.contains("hidden")) $("#createError").textContent = message;
});

socket.on("bellResult", (payload) => {
  playBellSound();
  const ringerName = payload.bellRingerDisplayName || payload.bellRingerName;
  showBellLog(ringerName);
  if (payload.correct) playBellAnimation();
  showScoreDeltas(payload.scoreChanges);
  const message = payload.correct ? `${ringerName} 정답!` : `${ringerName} 오답!`;
  showToast(message);
  handleTutorialBellResult(payload);
});

socket.on("timeoutResult", (payload) => {
  const name = payload.playerDisplayName || payload.playerName;
  showScoreDeltas(payload.scoreChanges);
  showToast(`${name} 시간초과! -${payload.penalty}점`);
});

socket.on("latencyPong", (payload) => {
  const startedAt = pendingLatencyPings.get(payload?.nonce);
  if (!startedAt) return;
  pendingLatencyPings.delete(payload.nonce);
  state.latency = { value: Date.now() - startedAt, state: "ok" };
  renderLatency();
});

socket.on("emoteEvent", (payload) => {
  const zone = document.querySelector(`[data-player-id="${payload.playerId}"]`);
  if (!zone) return;
  const balloon = document.createElement("div");
  balloon.className = "emote-balloon";
  balloon.textContent = payload.label;
  zone.appendChild(balloon);
  setTimeout(() => balloon.remove(), 1000);
});

socket.on("gameResult", (payload) => {
  payload.selfPlayerId = state.game?.selfPlayerId;
  state.gameResult = payload;
  if (payload.isTutorial) {
    hideTutorialOverlay();
    resetTutorialState(false);
    updateGameOverlay(state.game || { wrongFlash: false });
    return;
  }
  const isWinner = payload.winner?.id === payload.selfPlayerId;
  const returnAfterMs = payload.returnAfterMs || 5000;
  if (isWinner && !victoryPlayedForResult) {
    victoryPlayedForResult = true;
    playVictorySoundOnce();
  }
  updateGameOverlay(state.game || { wrongFlash: false });
  if (isWinner) {
    setTimeout(() => {
      state.game = null;
      state.room = null;
      state.gameResult = null;
      victoryPlayedForResult = false;
      showScreen("lobby");
      renderLobby();
    }, returnAfterMs);
  }
});

socket.on("reconnectResult", (payload) => {
  if (payload.success) showToast(payload.spectator ? "관전자 모드로 복귀했습니다." : "기존 자리로 복귀했습니다.");
});

socket.on("connect", () => {
  startLatencyMonitor();
  emitClientAssetsReady();
  if (state.nickname && state.activeScreen !== "nickname") {
    socket.emit("joinLobby", { nickname: state.nickname });
  }
});

preloadAssets();
applyBgmMode(getStoredBgmMode(), false);
applyBgmVolume(getStoredBgmVolume());
applySfxVolume(getStoredSfxVolume());
applyLobbyGuideCollapsed(isLobbyGuideCollapsed());
setupBellImage();
startLatencyMonitor();
updateResponsiveSizes();
showScreen("nickname");
