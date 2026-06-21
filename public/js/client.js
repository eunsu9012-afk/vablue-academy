const socket = io();

const CHARACTER_ASSETS = {
  seolhong: "/assets/characters/seolhong.png",
  yeowooyeon: "/assets/characters/yeowooyeon.png",
  choiaeri: "/assets/characters/choiaeri.png",
  nunyo: "/assets/characters/nunyo.png",
  nano: "/assets/characters/nano.png",
  ruchel: "/assets/characters/ruchel.png",
};

const FAN_CHARACTERS = [
  { id: "jjangdori", name: "짱돌이", image: "/assets/fan-characters/jjangdori.png" },
  { id: "arangi", name: "아랑이", image: "/assets/fan-characters/arangi.png" },
  { id: "golgoli", name: "골골이", image: "/assets/fan-characters/golgoli.png" },
  { id: "maesili", name: "매실이", image: "/assets/fan-characters/maesili.png" },
  { id: "woori", name: "우리", image: "/assets/fan-characters/woori.png" },
  { id: "pico", name: "피코", image: "/assets/fan-characters/pico.png" },
];
const FAN_CHARACTER_IDS = new Set(FAN_CHARACTERS.map((character) => character.id));
const FAN_CHARACTER_ALIASES = new Map([
  ["puru", "jjangdori"],
  ["nano", "arangi"],
  ["bonhoro", "golgoli"],
  ["silong", "maesili"],
  ["yauman", "woori"],
  ["uri", "woori"],
]);
const DEFAULT_FAN_CHARACTER_ID = "jjangdori";
const FAN_CHARACTER_STORAGE_KEY = "babyblue-fan-character-id";

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
  countdown: "3",
  playing: "🔴",
};

const screens = {
  nickname: document.querySelector("#nicknameScreen"),
  lobby: document.querySelector("#lobbyScreen"),
  tutorial: document.querySelector("#tutorialScreen"),
  room: document.querySelector("#roomScreen"),
  game: document.querySelector("#gameScreen"),
};

const state = {
  nickname: "",
  fanCharacterId: DEFAULT_FAN_CHARACTER_ID,
  lobby: null,
  room: null,
  game: null,
  activeScreen: "nickname",
  passwordRoomId: null,
  gameResult: null,
  onlineUsersExpanded: false,
  lobbyRankingExpanded: false,
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
  tutorialGuideIndex: 0,
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
let startCountdownTimer = null;
let lastStartCountdownNumber = null;
let latencyNonce = 0;
let mobileTouchLastAt = 0;
const pendingLatencyPings = new Map();
const missingFanAssetWarnings = new Set();

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

const TUTORIAL_GUIDE_STEPS = [
  {
    key: "goal",
    title: "게임 목표",
    navTitle: "게임 목표",
    summary: "공개 카드의 캐릭터 수를 빠르게 합산하세요.",
    description: [
      "모든 플레이어가 카드를 공개하며 같은 캐릭터가 정확히 5개 모이는 순간을 찾습니다.",
      "정확한 타이밍에 종을 누르는 사람이 유리해집니다.",
    ],
    example: "goal",
  },
  {
    key: "cards",
    title: "카드와 캐릭터",
    navTitle: "카드 보기",
    summary: "내 카드만이 아니라 전체 공개 카드를 합산합니다.",
    description: [
      "카드에는 베이블루 캐릭터가 표시됩니다.",
      "일반 모드는 단순하고, 하드 모드는 여러 캐릭터가 섞일 수 있습니다.",
    ],
    example: "cards",
  },
  {
    key: "bell",
    title: "종을 눌러야 하는 순간",
    navTitle: "종 치기",
    summary: "같은 캐릭터가 정확히 5개이면 종을 칩니다.",
    description: [
      "전체 공개 카드에서 특정 캐릭터 합계가 정확히 5개이면 정답입니다.",
      "정답이면 점수를 지키고 상대에게 압박을 줄 수 있습니다.",
    ],
    example: "bell",
  },
  {
    key: "wrong",
    title: "누르면 안 되는 순간",
    navTitle: "오답",
    summary: "정확히 5개가 아닌데 종을 치면 패널티를 받습니다.",
    description: [
      "캐릭터 합계가 4개이거나 6개 이상이면 오답입니다.",
      "빠른 판단만큼 정확한 확인이 중요합니다.",
    ],
    example: "wrong",
  },
  {
    key: "time",
    title: "턴 제한과 모드",
    navTitle: "모드와 시간",
    summary: "제한 시간 안에 카드를 공개하고 모드별 난이도를 확인하세요.",
    description: [
      "자기 차례에는 제한 시간 안에 카드를 공개해야 합니다.",
      "하드 모드에서는 한 카드에 여러 캐릭터가 나와 더 신중해야 합니다.",
    ],
    example: "modes",
  },
  {
    key: "score",
    title: "점수와 승리 조건",
    navTitle: "점수와 승리",
    summary: "점수가 0 이하가 되면 탈락하고, 끝까지 남으면 승리합니다.",
    description: [
      "오답과 시간초과는 점수 손실로 이어집니다.",
      "AI 포함 게임은 전적 반영 정책에 따라 별도로 처리될 수 있습니다.",
    ],
    example: "score",
  },
];

function showScreen(name) {
  const previousScreen = state.activeScreen;
  Object.entries(screens).forEach(([screenName, element]) => {
    element.classList.toggle("hidden", screenName !== name);
  });
  state.activeScreen = name;
  document.body.classList.toggle("is-nickname-screen", name === "nickname");
  document.body.classList.toggle("is-tutorial-screen", name === "tutorial");
  document.body.classList.toggle("is-game-screen", name === "game");
  if (previousScreen !== name) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  if (name !== "room") updateStartCountdownOverlay(null);
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

function updateAppHeight() {
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
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

function updateMobileMode() {
  document.body.classList.toggle("is-mobile", isMobileMode());
  ensureMobileLobbyAccordions();
  updateLobbyRankingPanelState();
  updateMobileGameInfoPanel();
  updateMobileTouchHint();
}

function setupMobileLobbySection(panel, label, expandedByDefault = true) {
  if (!panel || panel.dataset.mobileAccordion === "true") return;
  panel.dataset.mobileAccordion = "true";
  panel.classList.add("mobile-lobby-collapsible");
  panel.classList.toggle("mobile-collapsed", !expandedByDefault);

  let button = panel.querySelector(".mobile-section-toggle");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "mobile-section-toggle";
    const titleRow = panel.querySelector(".section-title-row");
    if (titleRow) titleRow.appendChild(button);
    else panel.insertBefore(button, panel.firstChild);
  }

  const sync = () => {
    const expanded = !panel.classList.contains("mobile-collapsed");
    button.textContent = `${label} ${expanded ? "▲" : "▼"}`;
    button.setAttribute("aria-expanded", String(expanded));
  };
  sync();
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    panel.classList.toggle("mobile-collapsed");
    sync();
  });
}

function ensureMobileLobbyAccordions() {
  if (!screens.lobby) return;
  if (screens.lobby.querySelector(".lobby-page")) return;
  setupMobileLobbySection(screens.lobby.querySelector(".room-list-panel"), "게임방 목록", true);
  setupMobileLobbySection(screens.lobby.querySelector(".compact-panel"), "내 전적", true);
  setupMobileLobbySection(screens.lobby.querySelector(".ranking-panel"), "서버 TOP3", false);
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
    <span class="mobile-bell-guide">종 터치</span>
    <span class="mobile-open-guide">화면 터치: 카드 오픈</span>
  `;
  hint.classList.remove("hidden");
}

function ensureMobileGameInfoMarkup() {
  const root = $("#mobileBoardStats");
  if (!root || root.dataset.enhanced === "true") return;
  root.dataset.enhanced = "true";
  root.innerHTML = `
    <div class="mobile-board-summary">
      <div>
        <span>최근 정답 TOP1</span>
        <strong id="mobileReactionTop">-</strong>
      </div>
      <div>
        <span>서버 응답속도</span>
        <strong id="mobileLatencyValue">측정 중</strong>
      </div>
    </div>
    <button id="mobileGameInfoToggleButton" class="mobile-game-info-toggle" type="button" aria-expanded="false">게임 정보 ▼</button>
    <div id="mobileGameInfoDetails" class="mobile-game-info-details hidden">
      <section>
        <h2>최근 정답 TOP3</h2>
        <ol id="mobileReactionSpeedList" class="reaction-speed-list"></ol>
      </section>
      <section>
        <h2>현재 게임 유저</h2>
        <div id="mobileGameUserInfoList" class="game-user-info-list"></div>
      </section>
    </div>
  `;
  $("#mobileGameInfoToggleButton")?.addEventListener("click", (event) => {
    event.stopPropagation();
    state.mobileGameInfoExpanded = !state.mobileGameInfoExpanded;
    updateMobileGameInfoPanel();
  });
}

function updateMobileGameInfoPanel() {
  const panel = $("#gameInfoPanel");
  const button = $("#gameInfoToggleButton");
  ensureMobileGameInfoMarkup();
  const mobileButton = $("#mobileGameInfoToggleButton");
  const mobileDetails = $("#mobileGameInfoDetails");
  const mobileStats = $("#mobileBoardStats");
  if (!panel || !button) return;

  const mobile = isMobileMode();
  const visible = mobile && state.activeScreen === "game";
  button.classList.toggle("hidden", true);
  if (mobileStats) {
    mobileStats.classList.toggle("hidden", !visible);
    if (!visible) mobileStats.classList.remove("is-expanded");
  }

  if (!mobile) {
    panel.classList.remove("mobile-collapsed");
    button.setAttribute("aria-expanded", "true");
    if (mobileButton) mobileButton.setAttribute("aria-expanded", "false");
    if (mobileStats) mobileStats.classList.remove("is-expanded");
    if (mobileDetails) mobileDetails.classList.add("hidden");
    return;
  }

  const collapsed = !state.mobileGameInfoExpanded;
  panel.classList.add("mobile-collapsed");
  if (mobileStats) mobileStats.classList.toggle("is-expanded", visible && !collapsed);
  if (mobileButton) {
    mobileButton.setAttribute("aria-expanded", String(!collapsed));
    mobileButton.textContent = collapsed ? "게임 정보 ▼" : "게임 정보 ▲";
  }
  if (mobileDetails) mobileDetails.classList.toggle("hidden", collapsed);
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

function safeText(value, fallback = "") {
  return escapeHtml(value == null || value === "" ? fallback : value);
}

function getDisplayPlayerName(player) {
  return player?.displayName || player?.nickname || "";
}

function displayName(player) {
  return getDisplayPlayerName(player);
}

function isAiPlayer(player) {
  return Boolean(player?.isAI);
}

// Fan-character helpers are display-only. They must never feed game card counts.
function normalizeFanCharacterId(value) {
  const rawId = String(value || "").trim();
  const id = FAN_CHARACTER_ALIASES.get(rawId) || rawId;
  return FAN_CHARACTER_IDS.has(id) ? id : DEFAULT_FAN_CHARACTER_ID;
}

function getFanCharacterById(value) {
  const id = normalizeFanCharacterId(value);
  return FAN_CHARACTERS.find((character) => character.id === id) || FAN_CHARACTERS[0];
}

function fanCharacterById(value) {
  return getFanCharacterById(value);
}

function fanCharacterInitial(character) {
  return String(character?.name || "팬").trim().slice(0, 1) || "팬";
}

function handleFanAvatarImageError(image) {
  const source = image?.getAttribute("src") || "";
  if (source && !missingFanAssetWarnings.has(source)) {
    missingFanAssetWarnings.add(source);
    console.warn(`Fan character asset failed to load: ${source}`);
  }
  const holder = image?.closest(".fan-avatar, .fan-character-image, .selected-character-avatar");
  holder?.classList.add("image-missing");
  image?.remove();
}

window.handleFanAvatarImageError = handleFanAvatarImageError;

document.addEventListener(
  "error",
  (event) => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.closest(".fan-avatar, .fan-character-image, .selected-character-avatar")) {
      handleFanAvatarImageError(image);
    }
  },
  true,
);

function getStoredFanCharacterId() {
  return normalizeFanCharacterId(localStorage.getItem(FAN_CHARACTER_STORAGE_KEY));
}

function saveFanCharacterId(value) {
  state.fanCharacterId = normalizeFanCharacterId(value);
  localStorage.setItem(FAN_CHARACTER_STORAGE_KEY, state.fanCharacterId);
}

function attachFanImageFallback(image) {
  image?.addEventListener("error", (event) => {
    handleFanAvatarImageError(event.currentTarget);
  });
}

function renderFanAvatar(entity, size = "sm") {
  if (!entity || isAiPlayer(entity)) return "";
  const character = fanCharacterById(entity.avatarId || entity.fanCharacterId || state.fanCharacterId);
  const initial = fanCharacterInitial(character);
  return `
    <span class="fan-avatar fan-avatar-${size} bb-avatar bb-avatar-user" title="${escapeHtml(character.name)}" data-avatar-id="${escapeHtml(character.id)}" data-avatar-initial="${escapeHtml(initial)}">
      <img src="${escapeHtml(character.image)}" alt="${escapeHtml(character.name)}" width="40" height="40" loading="lazy" decoding="async" />
    </span>
  `;
}

function renderAiBadge() {
  return `<span class="bb-avatar bb-avatar-ai" aria-hidden="true">AI</span>`;
}

function renderAIAvatar() {
  return renderAiBadge();
}

function renderPlayerAvatar(player, options = {}) {
  const size = options.size || "sm";
  return isAiPlayer(player) ? renderAiBadge(options) : renderFanAvatar(player, size);
}

function renderUserBadge(player) {
  if (isAiPlayer(player)) return `<span class="bb-badge bb-badge-ai">AI</span>`;
  if (player?.isHost) return `<span class="bb-badge bb-badge-host">HOST</span>`;
  return "";
}

function renderName(player, options = {}) {
  const className = player?.isVaNickname ? "va-name" : "";
  const avatarMarkup = options.hideAiBadge && isAiPlayer(player)
    ? ""
    : renderPlayerAvatar(player, { size: options.size || "sm" });
  return `<span class="name-with-avatar">${avatarMarkup}${renderRankBadges(player)}<span class="${className}">${escapeHtml(displayName(player))}</span></span>`;
}

function renderRankBadges(player) {
  const badges = Array.isArray(player?.rankBadges) ? player.rankBadges : [];
  if (!badges.length) return "";
  return `<span class="rank-badges">${badges.map((badge) => escapeHtml(badge.symbol)).join("")}</span>`;
}

function renderHostBadge(player) {
  return player?.isHost && !player?.isAI ? `<span class="host-inline">👑 방장</span>` : "";
}

function updateFanCharacterPicker() {
  document.querySelectorAll(".fan-character-option").forEach((button) => {
    const selected = button.dataset.avatarId === state.fanCharacterId;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", String(selected));
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  updateSelectedFanCharacterPreview();
}

function selectFanCharacter(avatarId) {
  saveFanCharacterId(avatarId);
  updateFanCharacterPicker();
}

function updateSelectedFanCharacterPreview() {
  const preview = $("#selectedCharacterPreview");
  if (!preview) return;
  const character = fanCharacterById(state.fanCharacterId);
  const avatar = $("#selectedFanCharacterAvatar");
  const initial = fanCharacterInitial(character);
  if (avatar) {
    avatar.classList.remove("image-missing");
    avatar.dataset.avatarId = character.id;
    avatar.dataset.avatarInitial = initial;
    avatar.innerHTML = `<img src="${escapeHtml(character.image)}" alt="${escapeHtml(character.name)}" width="96" height="96" loading="eager" decoding="async" />`;
    attachFanImageFallback(avatar.querySelector("img"));
  }
  setText("#selectedFanCharacterName", character.name);
}

function renderFanCharacterPicker() {
  const grid = $("#fanCharacterGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (const character of FAN_CHARACTERS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fan-character-option bb-card-soft";
    button.dataset.avatarId = character.id;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-label", character.name);
    const initial = fanCharacterInitial(character);
    button.innerHTML = `
      <span class="fan-character-image bb-avatar bb-avatar-user" data-avatar-id="${escapeHtml(character.id)}" data-avatar-initial="${escapeHtml(initial)}">
        <img src="${escapeHtml(character.image)}" alt="${escapeHtml(character.name)}" width="72" height="72" loading="eager" decoding="async" />
      </span>
      <strong>${escapeHtml(character.name)}</strong>
      <span class="fan-character-check" aria-hidden="true">✓</span>
    `;
    attachFanImageFallback(button.querySelector("img"));
    button.addEventListener("click", () => selectFanCharacter(character.id));
    grid.appendChild(button);
  }
  updateFanCharacterPicker();
}

function buildJoinLobbyPayload(nickname) {
  return { nickname, avatarId: state.fanCharacterId };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomizeProfile() {
  const nextCharacter = FAN_CHARACTERS[randomInt(0, FAN_CHARACTERS.length - 1)];
  selectFanCharacter(nextCharacter.id);
  syncNicknameSubmitState();
}

function syncNicknameSubmitState() {
  const input = $("#nicknameInput");
  const submit = $("#nicknameSubmitButton");
  if (!input || !submit) return;
  submit.disabled = !input.value.trim();
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

function roomAIInfoLabel(room) {
  return room?.aiMode === "playersOnly" ? "플레이어만" : `AI: ${aiDifficultyLabel(room?.aiDifficulty)}`;
}

function roomStatusLabel(status) {
  if (status === "countdown") return "시작 중";
  if (status === "waiting") return "대기중";
  return "진행중";
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
  ...FAN_CHARACTERS.map((character) => character.image),
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
  button.textContent = collapsed ? "펼치기" : "접기";
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
    <div class="context-title">${renderName(user, { hideAiBadge: true })}</div>
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
    list.innerHTML = `<li class="lobby-empty-row">아직 기록이 없습니다</li>`;
    return;
  }
  list.innerHTML = rows.slice(0, 3).map((row, index) => {
    const value = mode === "rate" ? `${formatWinRate(row.winRate)} · ${row.wins}승` : `${row.wins}승`;
    return `
      <li>
        <span class="rank-number">${index + 1}</span>
        <span class="rank-user">${renderName(row, { hideAiBadge: true })}</span>
        <strong>${escapeHtml(value)}</strong>
      </li>
    `;
  }).join("");
}

function getLobbyRoomStatus(room) {
  if (room.status === "countdown") return "countdown";
  if (room.status === "waiting" && Number(room.currentPlayers || 0) >= Number(room.maxPlayers || 0)) return "full";
  if (room.status === "waiting") return "waiting";
  return "playing";
}

function getLobbyRoomStatusLabel(room) {
  const status = getLobbyRoomStatus(room);
  if (status === "countdown") return "시작 중";
  if (status === "full") return "풀방";
  if (status === "waiting") return "대기중";
  return "게임중";
}

function getLobbyRoomFilters() {
  return {
    query: ($("#lobbyRoomSearchInput")?.value || "").trim().toLowerCase(),
    mode: $("#lobbyModeFilter")?.value || "all",
    status: $("#lobbyStatusFilter")?.value || "all",
  };
}

function matchesLobbyRoomFilters(room, filters) {
  if (filters.mode !== "all" && room.mode !== filters.mode) return false;
  if (filters.status !== "all" && getLobbyRoomStatus(room) !== filters.status) return false;
  if (filters.query && !String(room.title || "").toLowerCase().includes(filters.query)) return false;
  return true;
}

function renderLobbyRoomCard(room, displayIndex) {
  const status = getLobbyRoomStatus(room);
  const statusLabel = getLobbyRoomStatusLabel(room);
  const canJoin = status === "waiting";
  const card = document.createElement("button");
  card.type = "button";
  card.className = `room-card lobby-room-card status-${status}`;
  card.dataset.roomStatus = status;
  card.disabled = !canJoin;
  card.innerHTML = `
    <span class="room-number">${String(displayIndex + 1).padStart(3, "0")}</span>
    <span class="room-title-block">
      <strong>${escapeHtml(room.title)}</strong>
      <span>${room.hasPassword ? "비밀번호 방" : "공개 방"} · ${escapeHtml(roomAIInfoLabel(room))}</span>
    </span>
    <span class="room-badge-group">
      <span class="badge mode-badge">${modeLabel(room.mode)}</span>
      <span class="badge penalty-badge">${penaltyLabel(room.penaltyMultiplier)}</span>
      ${room.hasPassword ? `<span class="badge private-room-badge">비공개</span>` : ""}
    </span>
    <span class="room-player-count">${Number(room.currentPlayers || 0)}/${Number(room.maxPlayers || 0)}</span>
    <span class="room-status-pill status-${status}">${escapeHtml(statusLabel)}</span>
    <span class="room-enter-label">${canJoin ? "입장" : statusLabel}</span>
  `;
  card.addEventListener("click", () => {
    if (!canJoin) return;
    if (room.hasPassword) openPasswordModal(room.id, "비밀번호방입니다.\n비밀번호를 입력해 주세요.");
    else socket.emit("joinRoom", { roomId: room.id });
  });
  return card;
}

function renderLobbyEmptyState(message) {
  return `
    <div class="room-card empty-room-card lobby-empty-state">
      <strong>열린 방이 없어요</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderLobby() {
  const lobby = state.lobby;
  if (!lobby) return;
  const rooms = Array.isArray(lobby.rooms) ? lobby.rooms : [];
  setText("#onlineCount", `${Number(lobby.onlineCount || 0)}명`);
  setText("#lobbyRoomCount", `${rooms.length}개`);

  const currentUser = lobby.currentUser || { nickname: state.nickname, avatarId: state.fanCharacterId };
  setText("#lobbyCurrentUserName", displayName(currentUser) || state.nickname || "-");
  const avatarHolder = $("#lobbyCurrentUserAvatar");
  if (avatarHolder) avatarHolder.innerHTML = renderFanAvatar(currentUser, "lg");

  const stats = lobby.myStats || { wins: 0, losses: 0, winRate: 0 };
  $("#myStats").innerHTML = `
    <div class="stat-box"><span>승</span><strong>${stats.wins}</strong></div>
    <div class="stat-box"><span>패</span><strong>${stats.losses}</strong></div>
    <div class="stat-box"><span>승률</span><strong>${formatWinRate(stats.winRate)}</strong></div>
  `;

  renderRankList("#topWinsList", lobby.topWins || lobby.top3 || [], "wins");
  renderRankList("#topWinRatesList", lobby.topWinRates || [], "rate");
  updateLobbyRankingPanelState();

  const roomList = $("#roomList");
  const filters = getLobbyRoomFilters();
  const visibleRooms = rooms.filter((room) => matchesLobbyRoomFilters(room, filters));
  setText("#lobbyVisibleRoomCount", `${visibleRooms.length}/${rooms.length}개 표시`);
  if (!rooms.length) {
    roomList.innerHTML = renderLobbyEmptyState("아직 열린 방이 없어요. 새 방을 만들어 보세요.");
    renderOnlineUsers();
    return;
  }
  if (!visibleRooms.length) {
    roomList.innerHTML = renderLobbyEmptyState("조건에 맞는 방이 없어요. 필터를 바꿔 보세요.");
    renderOnlineUsers();
    return;
  }

  roomList.innerHTML = "";
  visibleRooms.forEach((room, index) => {
    roomList.appendChild(renderLobbyRoomCard(room, index));
  });
  renderOnlineUsers();
}

function renderOnlineUserRow(user) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = `online-user status-${escapeHtml(user.status)}`;
  item.innerHTML = `
    <span class="status-dot" aria-hidden="true"></span>
    <span class="online-user-name">${renderName(user, { hideAiBadge: true })}</span>
    <span class="user-status-pill status-${escapeHtml(user.status)}">${escapeHtml(user.statusLabel)}</span>
  `;
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showUserContextMenu(user, event.clientX, event.clientY);
  });
  return item;
}

function renderOnlineUsers() {
  const list = $("#onlineUsersList");
  if (!state.lobby || !list) return;
  updateOnlineUsersPanelState();
  const hiddenUsers = getHiddenUsers();
  const users = (state.lobby.onlineUsers || []).filter((user) => !hiddenUsers.has(user.nickname));
  if (!users.length) {
    list.innerHTML = `<p class="hint-text lobby-empty-inline">표시할 유저가 없습니다.</p>`;
    return;
  }

  list.innerHTML = "";
  for (const user of users) {
    list.appendChild(renderOnlineUserRow(user));
  }
}

function updateOnlineUsersPanelState() {
  const panel = $("#onlineUsersPanel");
  const toggle = $("#onlineUsersToggleButton");
  if (!panel || !toggle) return;
  const collapsed = isMobileMode() && !state.onlineUsersExpanded;
  panel.classList.toggle("collapsed", collapsed);
  const count = Number(state.lobby?.onlineCount || 0);
  const heading = panel.querySelector("h2");
  if (heading) heading.textContent = `현재 접속 유저(${count})`;
  toggle.textContent = collapsed ? "펼치기" : "접기";
  toggle.setAttribute("aria-expanded", String(!collapsed));
}

function updateLobbyRankingPanelState() {
  const panel = $("#lobbyRankingPanel");
  const toggle = $("#rankingToggleButton");
  if (!panel || !toggle) return;
  const collapsed = isMobileMode() && !state.lobbyRankingExpanded;
  panel.classList.toggle("collapsed", collapsed);
  toggle.textContent = collapsed ? "펼치기" : "접기";
  toggle.setAttribute("aria-expanded", String(!collapsed));
}

function tutorialGuideStep() {
  return TUTORIAL_GUIDE_STEPS[state.tutorialGuideIndex] || TUTORIAL_GUIDE_STEPS[0];
}

function tutorialAsset(src, alt, className = "") {
  const fallback = String(alt || "•").trim().slice(0, 1) || "•";
  return `
    <span class="tutorial-asset ${className}" data-fallback="${escapeHtml(fallback)}">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />
    </span>
  `;
}

function tutorialCharacterCard(name, src, count, tone = "blue") {
  return `
    <div class="tutorial-character-card tone-${escapeHtml(tone)}">
      ${tutorialAsset(src, name, "character-asset")}
      <strong>${escapeHtml(name)}</strong>
      <span>${escapeHtml(String(count))}개</span>
    </div>
  `;
}

function attachTutorialImageFallbacks() {
  document.querySelectorAll(".tutorial-asset img").forEach((image) => {
    image.addEventListener("error", (event) => {
      const holder = event.currentTarget.closest(".tutorial-asset");
      holder?.classList.add("image-missing");
      event.currentTarget.remove();
    }, { once: true });
  });
}

function renderTutorialExample(step) {
  const cardBack = CARD_BACK_ASSET;
  const bell = BELL_IMAGE_ASSET;
  if (step.example === "goal") {
    return `
      <div class="tutorial-board-example">
        <div class="mini-card-ring">
          ${tutorialAsset(cardBack, "카드 뒷면", "card-back-asset")}
          ${tutorialAsset(cardBack, "카드 뒷면", "card-back-asset")}
          ${tutorialAsset(bell, "종", "bell-asset")}
          ${tutorialAsset(cardBack, "카드 뒷면", "card-back-asset")}
          ${tutorialAsset(cardBack, "카드 뒷면", "card-back-asset")}
        </div>
        <p>모든 공개 카드를 보고 같은 캐릭터 수를 합산합니다.</p>
      </div>
    `;
  }
  if (step.example === "cards") {
    return `
      <div class="tutorial-card-grid-example">
        ${tutorialCharacterCard("눈요", CHARACTER_ASSETS.nunyo, 2)}
        ${tutorialCharacterCard("설홍", CHARACTER_ASSETS.seolhong, 1, "red")}
        ${tutorialCharacterCard("루첼", CHARACTER_ASSETS.ruchel, 2, "gold")}
        ${tutorialCharacterCard("최애리", CHARACTER_ASSETS.choiaeri, 1, "red")}
      </div>
    `;
  }
  if (step.example === "bell") {
    return `
      <div class="tutorial-answer-example is-correct">
        <div class="tutorial-card-grid-example compact">
          ${tutorialCharacterCard("루첼", CHARACTER_ASSETS.ruchel, 2, "gold")}
          ${tutorialCharacterCard("루첼", CHARACTER_ASSETS.ruchel, 3, "gold")}
          ${tutorialCharacterCard("나노", CHARACTER_ASSETS.nano, 1)}
        </div>
        <div class="tutorial-bell-result">
          ${tutorialAsset(bell, "종", "bell-asset")}
          <strong>정답!</strong>
          <span>루첼 5개</span>
        </div>
      </div>
    `;
  }
  if (step.example === "wrong") {
    return `
      <div class="tutorial-answer-example is-wrong">
        <div class="tutorial-card-grid-example compact">
          ${tutorialCharacterCard("나노", CHARACTER_ASSETS.nano, 2)}
          ${tutorialCharacterCard("나노", CHARACTER_ASSETS.nano, 2)}
          ${tutorialCharacterCard("여우연", CHARACTER_ASSETS.yeowooyeon, 1, "red")}
        </div>
        <div class="tutorial-bell-result">
          ${tutorialAsset(bell, "종", "bell-asset")}
          <strong>오답</strong>
          <span>나노 4개</span>
        </div>
      </div>
    `;
  }
  if (step.example === "modes") {
    return `
      <div class="tutorial-info-tiles">
        <article>
          <strong>일반 모드</strong>
          <span>카드 구성이 단순해서 처음 익히기 좋습니다.</span>
        </article>
        <article>
          <strong>하드 모드</strong>
          <span>여러 캐릭터가 섞여 더 빠른 합산이 필요합니다.</span>
        </article>
        <article>
          <strong>턴 제한</strong>
          <span>시간 안에 카드를 공개하지 않으면 패널티가 생깁니다.</span>
        </article>
      </div>
    `;
  }
  return `
    <div class="tutorial-score-board">
      <article><span>시작</span><strong>점수 보유</strong></article>
      <article><span>오답</span><strong>감점</strong></article>
      <article><span>탈락</span><strong>0점 이하</strong></article>
      <article><span>승리</span><strong>끝까지 생존</strong></article>
    </div>
  `;
}

function renderTutorialSideSummaries() {
  const ruleList = $("#tutorialRuleSummary");
  if (ruleList) {
    ruleList.innerHTML = [
      "모든 공개 카드를 동시에 확인합니다.",
      "같은 캐릭터가 정확히 5개이면 종을 칩니다.",
      "4개이거나 6개 이상이면 종을 누르지 않습니다.",
    ].map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }
  const scoreSummary = $("#tutorialScoreSummary");
  if (scoreSummary) {
    scoreSummary.innerHTML = `
      <article><span>오답</span><strong>점수 감소</strong></article>
      <article><span>시간초과</span><strong>패널티</strong></article>
      <article><span>승리</span><strong>최종 생존</strong></article>
    `;
  }
  const modeSummary = $("#tutorialModeSummary");
  if (modeSummary) {
    modeSummary.innerHTML = `
      <article><strong>일반</strong><span>기본 규칙 연습</span></article>
      <article><strong>하드</strong><span>복합 카드 등장</span></article>
      <article><strong>AI</strong><span>함께 연습 가능</span></article>
    `;
  }
}

function renderTutorialScreen() {
  if (!screens.tutorial) return;
  const step = tutorialGuideStep();
  const total = TUTORIAL_GUIDE_STEPS.length;
  setText("#tutorialGuideStepLabel", `${state.tutorialGuideIndex + 1} / ${total}`);
  setText("#tutorialGuideTitle", step.title);
  const description = $("#tutorialGuideDescription");
  if (description) {
    description.innerHTML = step.description.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  }
  const example = $("#tutorialExampleArea");
  if (example) {
    example.innerHTML = renderTutorialExample(step);
  }
  const nav = $("#tutorialStepNav");
  if (nav) {
    nav.innerHTML = TUTORIAL_GUIDE_STEPS.map((item, index) => `
      <button class="tutorial-step-item ${index === state.tutorialGuideIndex ? "is-active" : ""}" type="button" data-step-index="${index}" aria-current="${index === state.tutorialGuideIndex ? "step" : "false"}">
        <span>${index + 1}</span>
        <strong>${escapeHtml(item.navTitle)}</strong>
      </button>
    `).join("");
    nav.querySelectorAll(".tutorial-step-item").forEach((button) => {
      button.addEventListener("click", () => goToTutorialGuideStep(Number(button.dataset.stepIndex || 0)));
    });
  }
  const dots = $("#tutorialProgressDots");
  if (dots) {
    dots.innerHTML = TUTORIAL_GUIDE_STEPS.map((_, index) => `<span class="${index === state.tutorialGuideIndex ? "is-active" : ""}"></span>`).join("");
  }
  const prev = $("#tutorialPrevButton");
  const next = $("#tutorialNextGuideButton");
  if (prev) prev.disabled = state.tutorialGuideIndex <= 0;
  if (next) next.textContent = state.tutorialGuideIndex >= total - 1 ? "로비로 돌아가기" : "다음 단계";
  renderTutorialSideSummaries();
  attachTutorialImageFallbacks();
}

function goToTutorialGuideStep(index) {
  state.tutorialGuideIndex = Math.max(0, Math.min(TUTORIAL_GUIDE_STEPS.length - 1, Number(index || 0)));
  renderTutorialScreen();
}

function openTutorialScreen() {
  closeSettingsPanel();
  resetTutorialState(false);
  hideTutorialOverlay();
  state.tutorialGuideIndex = 0;
  renderTutorialScreen();
  showScreen("tutorial");
}

function returnToLobbyFromTutorial() {
  resetTutorialState(false);
  hideTutorialOverlay();
  showScreen("lobby");
}

function goPrevTutorialGuideStep() {
  if (state.tutorialGuideIndex <= 0) return;
  goToTutorialGuideStep(state.tutorialGuideIndex - 1);
}

function goNextTutorialGuideStep() {
  if (state.tutorialGuideIndex >= TUTORIAL_GUIDE_STEPS.length - 1) {
    returnToLobbyFromTutorial();
    return;
  }
  goToTutorialGuideStep(state.tutorialGuideIndex + 1);
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

function ensureStartCountdownOverlay() {
  let overlay = $("#startCountdownOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "startCountdownOverlay";
  overlay.className = "start-countdown-overlay hidden";
  overlay.setAttribute("aria-live", "assertive");
  overlay.innerHTML = `<strong id="startCountdownNumber">3</strong>`;
  document.body.appendChild(overlay);
  return overlay;
}

function clearStartCountdownTimer() {
  if (startCountdownTimer) clearTimeout(startCountdownTimer);
  startCountdownTimer = null;
}

function updateStartCountdownOverlay(countdown) {
  const overlay = ensureStartCountdownOverlay();
  const numberElement = $("#startCountdownNumber");
  clearStartCountdownTimer();

  if (!countdown || state.activeScreen !== "room") {
    overlay.classList.add("hidden");
    lastStartCountdownNumber = null;
    return;
  }

  const remainingMs = Math.max(0, Number(countdown.endsAt || 0) - Date.now());
  const number = Math.max(1, Math.min(3, Math.ceil(remainingMs / 1000)));
  if (numberElement) numberElement.textContent = String(number);
  overlay.classList.remove("hidden");

  if (lastStartCountdownNumber !== number) {
    lastStartCountdownNumber = number;
    playBellSound();
  }

  if (remainingMs > 0) {
    startCountdownTimer = setTimeout(() => updateStartCountdownOverlay(countdown), 100);
  }
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
      overlay.className = "result-overlay screen-result hidden";
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
  setText("#roomCount", `[${modeLabel(room.mode)}] [${penaltyLabel(room.penaltyMultiplier)}] [${roomAIInfoLabel(room)}] ${room.players.length}/${room.maxPlayers}`);
  updateStartCountdownOverlay(room.countdown || null);

  const self = room.players.find((player) => player.id === room.selfPlayerId);
  const isHost = self?.id === room.hostId;
  const isCountdown = Boolean(room.countdown) || room.status === "countdown";
  const isPlayersOnly = room.aiMode === "playersOnly";
  const humanPlayers = room.players.filter((player) => !player.isAI);
  const nonHostHumans = humanPlayers.filter((player) => player.id !== room.hostId);
  const allNonHostHumansReady = nonHostHumans.length > 0 && nonHostHumans.every((player) => player.ready);
  const aiDifficultySelect = $("#roomAIDifficultySelect");
  if (aiDifficultySelect) {
    aiDifficultySelect.value = room.aiDifficulty || "intermediate";
    aiDifficultySelect.disabled = !isHost || isPlayersOnly || room.status !== "waiting" || isCountdown;
    aiDifficultySelect.closest(".room-ai-difficulty-row")?.classList.toggle("hidden", !isHost || isPlayersOnly);
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
        ${player.isAI || player.isHost ? "" : `<span class="badge ${player.ready ? "ready" : "not-ready"}">${player.ready ? "[준비]" : "[미준비]"}</span>`}
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
  $("#readyButton").classList.toggle("hidden", isHost);
  $("#readyButton").disabled = !self || isHost || room.status !== "waiting" || isCountdown;
  $("#addAIButton").classList.toggle("hidden", !isHost || isPlayersOnly);
  $("#removeAIButton").classList.toggle("hidden", !isHost || isPlayersOnly);
  $("#startGameButton").classList.toggle("hidden", !isHost);
  $("#addAIButton").disabled = !isHost || isPlayersOnly || room.status !== "waiting" || isCountdown || room.players.length >= room.maxPlayers || allNonHostHumansReady;
  $("#removeAIButton").disabled = !isHost || isPlayersOnly || isCountdown || !room.players.some((player) => player.isAI);
  $("#startGameButton").disabled = !isHost || !room.canStart || !state.assetsReady || isCountdown;
  $("#roomHint").textContent = isCountdown
    ? "게임 시작 중입니다."
    : (room.canStartReason || (state.assetsReady ? "게임 시작 조건: 총 2명 이상" : "게임 자료 확인 후 시작할 수 있습니다"));
}

function getSeatPosition(index, count) {
  if (isMobileMode()) return getMobileSeatPosition(index, count);
  const layouts = {
    1: [{ left: 50, top: 76 }],
    2: [{ left: 28, top: 52 }, { left: 72, top: 52 }],
    3: [{ left: 28, top: 23 }, { left: 72, top: 23 }, { left: 50, top: 77 }],
    4: [{ left: 26, top: 23 }, { left: 74, top: 23 }, { left: 26, top: 77 }, { left: 74, top: 77 }],
    5: [{ left: 24, top: 23 }, { left: 50, top: 23 }, { left: 76, top: 23 }, { left: 37, top: 77 }, { left: 63, top: 77 }],
    6: [{ left: 24, top: 23 }, { left: 50, top: 23 }, { left: 76, top: 23 }, { left: 24, top: 77 }, { left: 50, top: 77 }, { left: 76, top: 77 }],
  };
  return (layouts[count] || layouts[6])[index] || { left: 50, top: 50 };
}

function getMobileSeatPosition(index, count) {
  const layouts = {
    1: [{ left: 50, top: 72 }],
    2: [{ left: 28, top: 50 }, { left: 72, top: 50 }],
    3: [{ left: 28, top: 24 }, { left: 72, top: 24 }, { left: 50, top: 74 }],
    4: [{ left: 28, top: 24 }, { left: 72, top: 24 }, { left: 28, top: 74 }, { left: 72, top: 74 }],
    5: [{ left: 27, top: 19 }, { left: 73, top: 19 }, { left: 27, top: 47 }, { left: 73, top: 47 }, { left: 50, top: 74 }],
    6: [{ left: 27, top: 18 }, { left: 73, top: 18 }, { left: 27, top: 45 }, { left: 73, top: 45 }, { left: 27, top: 72 }, { left: 73, top: 72 }],
  };
  return (layouts[count] || layouts[6])[index] || { left: 50, top: 66 };
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
    <div class="player-card-shell">
      <header class="player-head">
        <div class="player-identity">
          <div class="player-name"></div>
          <div class="player-status-row"></div>
        </div>
        <div class="score-wrap" aria-label="점수">
          <span class="score-icon" aria-hidden="true">🏆</span>
          <div class="score"></div>
        </div>
      </header>
      <div class="player-card-body">
        <div class="card-stack" aria-label="플레이어 카드">
          <div class="deck-slot" data-slot-label="덱"></div>
          <div class="pile-slot" data-slot-label="공개"></div>
        </div>
      </div>
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
  updateStartCountdownOverlay(null);
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
    zone.dataset.seatIndex = String(index + 1);
    zone.style.left = `${seat.left}%`;
    zone.style.top = `${seat.top}%`;
    zone.classList.toggle("current-turn", player.id === game.currentTurnPlayerId);
    zone.classList.toggle("eliminated", player.spectator || player.eliminated);
    zone.classList.toggle("self-player", player.id === game.selfPlayerId);
    zone.classList.toggle("ai-player", Boolean(player.isAI));
    zone.classList.toggle("spectator-player", Boolean(player.spectator));

    const isSelf = player.id === game.selfPlayerId;
    const canFlip = isSelf && isFlipAvailable(game);

    const turnChip = player.id === game.currentTurnPlayerId
      ? `<span class="current-turn-chip">${isSelf ? "내 차례" : "차례"}</span>`
      : "";
    const statusBadges = [
      isSelf ? `<span class="player-badge self">나</span>` : "",
      player.spectator ? `<span class="player-badge spectator">관전</span>` : "",
    ].filter(Boolean).join("");
    zone.querySelector(".player-name").innerHTML = `${renderName(player, { hideAiBadge: true })} ${renderHostBadge(player)} ${turnChip}`;
    zone.querySelector(".player-status-row").innerHTML = statusBadges;
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
  ensureMobileGameInfoMarkup();
  const panel = $("#gameInfoPanel");
  if (panel) {
    panel.classList.add("pc-game-info-panel");
    panel.querySelectorAll(".game-info-card").forEach((card, index) => {
      card.classList.toggle("reaction-info-card", index === 0);
      card.classList.toggle("users-info-card", index === 1);
      card.classList.toggle("latency-info-card", index === 2);
    });
  }
  renderReactionSpeeds(game.recentReactionSpeeds || []);
  renderReactionSpeeds(game.recentReactionSpeeds || [], "#mobileReactionSpeedList");
  renderGameUsers(game.players || []);
  renderGameUsers(game.players || [], "#mobileGameUserInfoList");
  renderLatency();
  renderMobileBoardStats(game);
}

function renderReactionSpeeds(rows, selector = "#reactionSpeedList") {
  const list = $(selector);
  if (!list) return;
  const topRows = rows.slice(0, 3);
  if (!topRows.length) {
    list.innerHTML = `<li class="empty-info">정답 대기 중</li>`;
    return;
  }
  if (selector !== "#reactionSpeedList") {
    list.innerHTML = topRows.map((row, index) => `
      <li class="${index === 0 ? "is-best" : ""}">
        <span class="reaction-rank">${index + 1}위</span>
        <span class="reaction-player">${escapeHtml(formatReactionPlayerName(row))}</span>
        <strong class="reaction-time">${(Number(row.reactionMs || 0) / 1000).toFixed(3)}s</strong>
      </li>
    `).join("");
    return;
  }
  list.innerHTML = topRows.map((row, index) => `
    <li class="${index === 0 ? "is-best" : ""}">
      <span class="reaction-rank">${index + 1}위</span>
      <span class="reaction-player">${escapeHtml(formatReactionPlayerName(row))}</span>
      <strong class="reaction-time">${(Number(row.reactionMs || 0) / 1000).toFixed(3)}s</strong>
    </li>
  `).join("");
}

function formatReactionPlayerName(row) {
  const name = row.displayName || row.nickname || "";
  if (!row.isAI) return name;
  return `AI ${name.replace(/^AI\s+/, "")}`;
}

function renderGameUsers(players, selector = "#gameUserInfoList") {
  const list = $(selector);
  if (!list) return;
  list.innerHTML = players.map((player) => {
    const stats = player.stats || {};
    const meta = player.isAI
      ? ""
      : state.game?.isTutorial
        ? "튜토리얼 참여중"
        : `${Number(stats.wins || 0)}승 ${Number(stats.losses || 0)}패 ${formatWinRate(stats.winRate)}`;
    if (selector !== "#gameUserInfoList") {
      return `
        <article class="game-user-info ${player.eliminated || player.spectator ? "is-eliminated" : ""}">
          <strong>${renderName(player, { hideAiBadge: true })} ${renderHostBadge(player)}</strong>
          <span>${escapeHtml(meta)}</span>
        </article>
      `;
    }
    const metaClass = `game-user-meta ${player.isAI ? "game-user-meta-ai" : "game-user-meta-human"}`;
    return `
      <article class="game-user-info ${player.eliminated || player.spectator ? "is-eliminated" : ""}">
        <div class="game-user-main">
          <strong>${renderName(player, { hideAiBadge: true })} ${renderHostBadge(player)}</strong>
          <span class="game-user-state-dot" aria-hidden="true"></span>
        </div>
        <span class="${metaClass}">${escapeHtml(meta)}</span>
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
  ensureMobileGameInfoMarkup();
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
    "#mobileBoardStats",
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
  overlay.className = "result-overlay screen-result hidden";
  overlay.innerHTML = "";

  if (state.gameResult) {
    overlay.className = "result-overlay screen-result result-card";
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
    overlay.className = "result-overlay screen-result result-card";
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
  ensureCreateRoomAIModeControls();
  const defaultAIMode = document.querySelector("input[name='aiMode'][value='enabled']");
  if (defaultAIMode) defaultAIMode.checked = true;
  updateCreateRoomAIModeControls();
  $("#createError").textContent = "";
  document.body.classList.add("is-create-room-modal-open");
  $("#createRoomModal").classList.remove("hidden");
  $("#roomTitleInput").focus();
}

function getSelectedAIMode() {
  return document.querySelector("input[name='aiMode']:checked")?.value || "enabled";
}

function updateCreateRoomAIModeControls() {
  const playersOnly = getSelectedAIMode() === "playersOnly";
  const aiCountSelect = $("#aiCountSelect");
  const aiDifficultySelect = $("#aiDifficultySelect");
  aiCountSelect?.closest("label")?.classList.toggle("hidden", playersOnly);
  aiDifficultySelect?.closest("label")?.classList.toggle("hidden", playersOnly);
  if (playersOnly && aiCountSelect) aiCountSelect.value = "0";
}

function ensureCreateRoomAIModeControls() {
  const aiCountSelect = $("#aiCountSelect");
  const existingField = $("#aiModeField");
  if (!aiCountSelect || existingField) {
    if (existingField && existingField.dataset.bound !== "true") {
      existingField.dataset.bound = "true";
      existingField.addEventListener("change", updateCreateRoomAIModeControls);
    }
    updateCreateRoomAIModeControls();
    return;
  }
  const field = document.createElement("fieldset");
  field.id = "aiModeField";
  field.className = "mode-field ai-mode-field";
  field.innerHTML = `
    <legend>AI 설정</legend>
    <label class="radio-row">
      <input type="radio" name="aiMode" value="enabled" checked />
      <span>AI 포함</span>
    </label>
    <label class="radio-row">
      <input type="radio" name="aiMode" value="playersOnly" />
      <span>플레이어만</span>
    </label>
  `;
  aiCountSelect.closest("label")?.before(field);
  field.addEventListener("change", updateCreateRoomAIModeControls);
  updateCreateRoomAIModeControls();
}

function closeCreateRoomModal() {
  $("#createRoomModal").classList.add("hidden");
  document.body.classList.remove("is-create-room-modal-open");
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
  socket.emit("joinLobby", buildJoinLobbyPayload(nickname));
});

$("#randomProfileButton")?.addEventListener("click", randomizeProfile);
$("#nicknameInput")?.addEventListener("input", syncNicknameSubmitState);
$("#openCreateRoomButton").addEventListener("click", openCreateRoomModal);
$("#guideToggleButton")?.addEventListener("click", toggleLobbyGuide);
$("#tutorialButton")?.addEventListener("click", openTutorialScreen);
$("#tutorialHeaderLobbyButton")?.addEventListener("click", returnToLobbyFromTutorial);
$("#tutorialPrevButton")?.addEventListener("click", goPrevTutorialGuideStep);
$("#tutorialNextGuideButton")?.addEventListener("click", goNextTutorialGuideStep);
$("#closeCreateRoomModalButton").addEventListener("click", closeCreateRoomModal);
$("#cancelCreateRoomButton")?.addEventListener("click", closeCreateRoomModal);
$("#createRoomModal").addEventListener("click", (event) => {
  if (event.target.id === "createRoomModal") closeCreateRoomModal();
});

$("#createRoomForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("#roomTitleInput").value.trim();
  const isPrivate = $("#privateRoomCheck").checked;
  const password = $("#roomPasswordInput").value.trim();
  const maxPlayers = Number($("#maxPlayersSelect").value);
  const aiMode = getSelectedAIMode();
  const aiCount = aiMode === "enabled" ? Number($("#aiCountSelect").value) : 0;
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
  if (aiMode === "enabled" && aiCount + 1 > maxPlayers) {
    $("#createError").textContent = "AI 수가 최대 인원을 초과합니다.";
    return;
  }

  socket.emit("createRoom", { title, isPrivate, password, maxPlayers, aiCount, aiMode, mode, penaltyMultiplier, turnTime, aiDifficulty });
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
$("#refreshLobbyButton")?.addEventListener("click", () => socket.emit("refreshLobby"));
$("#lobbyRoomSearchInput")?.addEventListener("input", renderLobby);
$("#lobbyModeFilter")?.addEventListener("change", renderLobby);
$("#lobbyStatusFilter")?.addEventListener("change", renderLobby);
$("#refreshUsersButton").addEventListener("click", () => socket.emit("refreshLobby"));
$("#onlineUsersToggleButton").addEventListener("click", (event) => {
  event.stopPropagation();
  closeSettingsPanel();
  state.onlineUsersExpanded = !state.onlineUsersExpanded;
  updateOnlineUsersPanelState();
});
$("#rankingToggleButton")?.addEventListener("click", (event) => {
  event.stopPropagation();
  closeSettingsPanel();
  state.lobbyRankingExpanded = !state.lobbyRankingExpanded;
  updateLobbyRankingPanelState();
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
  updateAppHeight();
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
  if (payload.currentUser?.avatarId) {
    saveFanCharacterId(payload.currentUser.avatarId);
    updateFanCharacterPicker();
  }
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
    socket.emit("joinLobby", buildJoinLobbyPayload(state.nickname));
  }
});

preloadAssets();
saveFanCharacterId(getStoredFanCharacterId());
renderFanCharacterPicker();
syncNicknameSubmitState();
applyBgmMode(getStoredBgmMode(), false);
applyBgmVolume(getStoredBgmVolume());
applySfxVolume(getStoredSfxVolume());
applyLobbyGuideCollapsed(isLobbyGuideCollapsed());
setupBellImage();
startLatencyMonitor();
updateAppHeight();
updateResponsiveSizes();
showScreen("nickname");
