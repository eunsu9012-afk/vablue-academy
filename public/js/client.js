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
const HIDDEN_USERS_KEY = "babyblue-hidden-users";

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
};

const $ = (selector) => document.querySelector(selector);

let victoryPlayedForResult = false;
let turnTimerInterval = null;

function showScreen(name) {
  Object.entries(screens).forEach(([screenName, element]) => {
    element.classList.toggle("hidden", screenName !== name);
  });
  state.activeScreen = name;
  if (name !== "game") stopTurnTimer();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2200);
}

function setText(selector, text) {
  const element = $(selector);
  if (element) element.textContent = text;
}

function isFormFieldFocused() {
  const tag = document.activeElement?.tagName;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
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
  return `<span class="${className}">${escapeHtml(displayName(player))}</span>`;
}

function modeLabel(mode) {
  return mode === "hard" ? "하드" : "일반";
}

function penaltyLabel(value) {
  return `${Number(value || 1)}배`;
}

// BGM is intentionally resilient: missing files are skipped and the app stays silent.
const bgmTracks = [
  "/assets/sounds/bgm1.mp3",
  "/assets/sounds/bgm2.mp3",
  "/assets/sounds/bgm3.mp3",
  "/assets/sounds/bgm4.mp3",
];
const bgm = new Audio();
let bgmIndex = 0;
let userGestureSeen = false;
let bgmStarted = false;
let skippedTracks = 0;
let bgmSilent = false;

function getStoredVolume() {
  const stored = Number(localStorage.getItem("babyblue-bgm-volume"));
  return Number.isFinite(stored) ? Math.min(10, Math.max(0, stored)) : 5;
}

function applyVolume(value) {
  const volume = Math.min(10, Math.max(0, Number(value)));
  bgm.volume = volume / 10;
  localStorage.setItem("babyblue-bgm-volume", String(volume));
  $("#volumeSlider").value = String(volume);
  $("#volumeValue").textContent = String(volume);
}

function playBgmTrack() {
  if (!userGestureSeen || bgmSilent) return;
  bgm.src = bgmTracks[bgmIndex];
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
  bgmIndex = (bgmIndex + 1) % bgmTracks.length;
  playBgmTrack();
}

function playSound(src) {
  const audio = new Audio(src);
  audio.volume = bgm.volume;
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

bgm.addEventListener("ended", playNextBgmTrack);
bgm.addEventListener("error", () => {
  skippedTracks += 1;
  if (skippedTracks >= bgmTracks.length) {
    bgmSilent = true;
    return;
  }
  bgmIndex = (bgmIndex + 1) % bgmTracks.length;
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
    <div class="context-status">[${escapeHtml(user.statusLabel)}]</div>
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
  const panel = $("#onlineUsersPanel");
  const toggleButton = $("#onlineUsersToggleButton");
  panel?.classList.toggle("collapsed", !state.onlineUsersExpanded);
  if (toggleButton) {
    toggleButton.textContent = `현재 접속 유저 ${state.onlineUsersExpanded ? "▲" : "▼"}`;
  }
  if (!state.onlineUsersExpanded) {
    list.innerHTML = "";
    return;
  }

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

function renderRoom(room) {
  if (!room) {
    state.room = null;
    state.game = null;
    state.gameResult = null;
    victoryPlayedForResult = false;
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
  setText("#roomCount", `[${modeLabel(room.mode)}] [${penaltyLabel(room.penaltyMultiplier)}] ${room.players.length}/${room.maxPlayers}`);

  const self = room.players.find((player) => player.id === room.selfPlayerId);
  const isHost = self?.id === room.hostId;
  const playerList = $("#roomPlayers");
  playerList.innerHTML = "";

  for (const player of room.players) {
    const item = document.createElement("article");
    item.className = "waiting-player";
    item.innerHTML = `
      <h3>${renderName(player)}</h3>
      <div class="badge-row">
        ${player.isHost ? `<span class="badge host">방장</span>` : ""}
        ${player.isAI ? `<span class="badge ai">[AI]</span>` : ""}
        <span class="badge ${player.ready ? "ready" : "not-ready"}">${player.ready ? "[준비]" : "[미준비]"}</span>
      </div>
    `;
    playerList.appendChild(item);
  }

  $("#readyButton").textContent = self?.ready ? "준비 취소" : "준비";
  $("#readyButton").disabled = !self;
  $("#addAIButton").disabled = !isHost || room.status !== "waiting" || room.players.length >= room.maxPlayers;
  $("#removeAIButton").disabled = !isHost || !room.players.some((player) => player.isAI);
  $("#startGameButton").disabled = !isHost || !room.canStart;
  $("#roomHint").textContent = "게임 시작 조건: 총 2명 이상";
}

function getSeatPosition(index, count) {
  const layouts = {
    1: [{ left: 50, top: 50 }],
    2: [{ left: 24, top: 50 }, { left: 76, top: 50 }],
    3: [{ left: 50, top: 22 }, { left: 24, top: 76 }, { left: 76, top: 76 }],
    4: [{ left: 50, top: 20 }, { left: 82, top: 52 }, { left: 50, top: 80 }, { left: 18, top: 52 }],
    5: [{ left: 50, top: 20 }, { left: 82, top: 40 }, { left: 70, top: 78 }, { left: 30, top: 78 }, { left: 18, top: 40 }],
    6: [{ left: 35, top: 22 }, { left: 65, top: 22 }, { left: 84, top: 52 }, { left: 65, top: 78 }, { left: 35, top: 78 }, { left: 16, top: 52 }],
  };
  return (layouts[count] || layouts[6])[index] || { left: 50, top: 50 };
}

function updateResponsiveSizes() {
  const root = document.documentElement;
  const count = state.game?.players?.length || 6;
  const width = Math.max(360, window.innerWidth);
  const height = Math.max(560, window.innerHeight);
  const boardHeight = Math.max(420, height - 120);
  let openWidth = Math.floor(Math.min(320, width / 4.7, boardHeight / 1.95));

  if (count >= 5) openWidth = Math.min(openWidth, Math.floor(Math.min(width / 8.2, boardHeight / 3.05)));
  else if (count === 4) openWidth = Math.min(openWidth, Math.floor(Math.min(width / 6.5, boardHeight / 2.7)));
  else if (count === 3) openWidth = Math.min(openWidth, Math.floor(Math.min(width / 5.6, boardHeight / 2.45)));
  else if (count === 2) openWidth = Math.min(openWidth, Math.floor(Math.min(width / 4.2, boardHeight / 2.05)));

  openWidth = Math.max(88, openWidth);
  const deckWidth = Math.max(70, Math.round(openWidth * 0.82));
  const bellSize = Math.max(72, Math.min(180, Math.round(Math.min(width, height) * 0.16)));
  const seatWidth = Math.max(openWidth + Math.round(deckWidth * 0.62) + 34, Math.min(390, openWidth + deckWidth + 48));

  root.style.setProperty("--open-card-width", `${openWidth}px`);
  root.style.setProperty("--open-card-height", `${Math.round(openWidth * 4 / 3)}px`);
  root.style.setProperty("--deck-card-width", `${deckWidth}px`);
  root.style.setProperty("--deck-card-height", `${Math.round(deckWidth * 4 / 3)}px`);
  root.style.setProperty("--card-width", `${openWidth}px`);
  root.style.setProperty("--card-height", `${Math.round(openWidth * 4 / 3)}px`);
  root.style.setProperty("--bell-size", `${bellSize}px`);
  root.style.setProperty("--seat-width", `${seatWidth}px`);
}

function renderGame(game) {
  state.game = game;
  state.room = null;
  showScreen("game");
  startBgmWhenAllowed();
  updateResponsiveSizes();

  setText("#gameModeBadge", `[${modeLabel(game.mode)}]`);
  setText("#gamePenaltyBadge", `[${penaltyLabel(game.penaltyMultiplier)}]`);
  setText("#gameTurnLimitBadge", `턴 제한: ${Number(game.turnTime || game.turnDurationMs / 1000 || 6)}초`);

  const wrap = $("#gamePlayers");
  const playerCount = game.players.length;
  wrap.className = `game-players players-${playerCount}`;
  wrap.innerHTML = "";
  const highlight = game.matchedCharacters || [];

  game.players.forEach((player, index) => {
    const seat = getSeatPosition(index, playerCount);
    const zone = document.createElement("article");
    zone.className = "player-zone";
    zone.dataset.playerId = player.id;
    zone.style.left = `${seat.left}%`;
    zone.style.top = `${seat.top}%`;
    zone.classList.toggle("current-turn", player.id === game.currentTurnPlayerId);
    zone.classList.toggle("eliminated", player.spectator || player.eliminated);

    const isSelf = player.id === game.selfPlayerId;
    const canFlip = isSelf && !player.spectator && player.id === game.currentTurnPlayerId && !game.bellLocked;

    zone.innerHTML = `
      <header class="player-head">
        <div class="player-name">${renderName(player)}</div>
        <div class="score">${player.score}</div>
      </header>
      <div class="card-stack">
        <div class="deck-slot"></div>
        <div class="pile-slot"></div>
      </div>
    `;

    const deckSlot = zone.querySelector(".deck-slot");
    if (!player.spectator) {
      const deck = renderDeckCard(canFlip);
      if (canFlip) deck.addEventListener("click", () => socket.emit("flipCard"));
      deckSlot.appendChild(deck);
    }

    const pileSlot = zone.querySelector(".pile-slot");
    if (player.topCard) pileSlot.appendChild(renderFrontCard(player.topCard, highlight));
    else pileSlot.innerHTML = `<div class="empty-card-space" aria-hidden="true"></div>`;

    wrap.appendChild(zone);
  });

  startTurnTimer(game);
  updateGameOverlay(game);
}

function renderDeckCard(clickable) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `deck-card ${clickable ? "clickable" : ""}`;
  card.disabled = !clickable;
  card.title = "카드덱";
  card.innerHTML = `
    <div class="deck-pattern" aria-hidden="true"></div>
    <img alt="" aria-hidden="true" src="${CARD_BACK_ASSET}" />
  `;
  card.querySelector("img").addEventListener("error", (event) => {
    event.currentTarget.remove();
  });
  return card;
}

function renderFrontCard(card, highlight = []) {
  const element = document.createElement("div");
  element.className = "front-card";
  const firstCharacter = card.items?.[0]?.characterId || "nano";
  element.style.background = `linear-gradient(160deg, #fff, ${CARD_COLORS[firstCharacter] || "#edf7ff"})`;

  const total = Math.max(1, card.items?.length || 1);
  for (const item of card.items || []) {
    const slot = CARD_SLOTS[item.slot] || CARD_SLOTS[3];
    const piece = document.createElement("div");
    piece.className = "character-piece";
    piece.classList.toggle("highlighted", highlight.includes(item.characterId));
    piece.style.left = slot.left;
    piece.style.top = slot.top;
    piece.style.width = CHARACTER_SIZE_BY_COUNT[total] || "34%";
    piece.style.height = CHARACTER_SIZE_BY_COUNT[total] || "34%";
    piece.innerHTML = `
      <div class="character-fallback" aria-hidden="true"></div>
      <img alt="" aria-hidden="true" src="${CHARACTER_ASSETS[item.characterId]}" />
    `;
    piece.querySelector("img").addEventListener("error", (event) => {
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
    timer.textContent = remaining.toFixed(1);
    timer.classList.toggle("urgent", remaining <= 1.5);
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
    return;
  }

  const self = game.players?.find((player) => player.id === game.selfPlayerId);
  if (self?.spectator && game.status === "playing") {
    overlay.className = "result-overlay result-card";
    overlay.innerHTML = `
      <div class="result-box">
        <h2>패배</h2>
        <p class="hint-text">관전모드</p>
        <button class="primary-button overlay-leave-button" type="button">나가기</button>
      </div>
    `;
    overlay.querySelector(".overlay-leave-button").addEventListener("click", () => socket.emit("leaveRoom"));
    return;
  }

  if (game.wrongFlash) {
    overlay.classList.remove("hidden");
    overlay.textContent = "X";
  }
}

function renderGameResult(result) {
  const isWinner = result.winner?.id === result.selfPlayerId;
  const title = isWinner ? "승리" : "패배";
  const actionsEnabled = Boolean(result.actionsEnabled);
  const hint = isWinner
    ? "5초 후 대기실로 이동합니다"
    : actionsEnabled
      ? "관전모드입니다. 대기실로 이동할 수 있습니다"
      : "5초 후 관전모드/대기실 이동을 선택할 수 있습니다";
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
      <button class="primary-button overlay-leave-button" type="button" ${actionsEnabled ? "" : "disabled"}>대기실 이동</button>
      <div class="result-score-list">${rows}</div>
    </div>
  `;
}

function openCreateRoomModal() {
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
  image.src = `${BELL_IMAGE_ASSET}?v=${Date.now()}`;
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

  socket.emit("createRoom", { title, isPrivate, password, maxPlayers, aiCount, mode, penaltyMultiplier, turnTime });
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
$("#addAIButton").addEventListener("click", () => socket.emit("addAI"));
$("#removeAIButton").addEventListener("click", () => socket.emit("removeAI"));
$("#startGameButton").addEventListener("click", () => socket.emit("startGame"));
$("#roomLeaveButton").addEventListener("click", () => socket.emit("leaveRoom"));
$("#bellButton").addEventListener("click", () => socket.emit("ringBell"));
$("#refreshUsersButton").addEventListener("click", () => socket.emit("refreshLobby"));
$("#onlineUsersToggleButton").addEventListener("click", () => {
  state.onlineUsersExpanded = !state.onlineUsersExpanded;
  renderOnlineUsers();
});

$("#settingsButton").addEventListener("click", () => {
  $("#settingsPanel").classList.toggle("hidden");
});

$("#volumeSlider").addEventListener("input", (event) => {
  applyVolume(event.target.value);
});

$("#leaveButton").addEventListener("click", () => {
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
    showScreen("nickname");
    socket.connect();
  }
});

$("#onlineUsersPanel").addEventListener("click", (event) => {
  if (!state.onlineUsersExpanded) return;
  if (event.target.closest(".online-user") || event.target.closest(".mini-button") || event.target.closest(".panel-toggle-button")) return;
  showHiddenUsersMenu(event.clientX, event.clientY);
});

document.addEventListener("click", (event) => {
  if (event.target.closest("#userContextMenu") || event.target.closest("#onlineUsersPanel")) return;
  hideContextMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideContextMenu();
    closeCreateRoomModal();
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

window.addEventListener("resize", updateResponsiveSizes);

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

socket.on("gameState", (payload) => {
  if (!payload) return;
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
  const message = payload.correct ? `${ringerName} 정답!` : `${ringerName} 오답!`;
  showToast(message);
});

socket.on("timeoutResult", (payload) => {
  const name = payload.playerDisplayName || payload.playerName;
  showToast(`${name} 시간초과! -${payload.penalty}점`);
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
  payload.actionsEnabled = false;
  state.gameResult = payload;
  const isWinner = payload.winner?.id === payload.selfPlayerId;
  const returnAfterMs = payload.returnAfterMs || 5000;
  if (isWinner && !victoryPlayedForResult) {
    victoryPlayedForResult = true;
    playVictorySoundOnce();
  }
  updateGameOverlay(state.game || { wrongFlash: false });
  setTimeout(() => {
    if (state.gameResult === payload) {
      payload.actionsEnabled = true;
      updateGameOverlay(state.game || { wrongFlash: false });
    }
  }, returnAfterMs);
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
  if (state.nickname && state.activeScreen !== "nickname") {
    socket.emit("joinLobby", { nickname: state.nickname });
  }
});

applyVolume(getStoredVolume());
setupBellImage();
updateResponsiveSizes();
showScreen("nickname");
