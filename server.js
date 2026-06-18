const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const USERDATA_PATH = path.join(__dirname, "userdata.json");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const CHARACTER_IDS = ["seolhong", "yeowooyeon", "choiaeri", "nunyo", "nano", "ruchel"];
const RESERVED_NICKNAMES = ["눈요", "설홍", "루첼", "나노", "최애리", "여우연"];
const AI_NAMES = ["AI 루첼", "AI 나노", "AI 설홍", "AI 눈요", "AI 여우연", "AI 최애리"];
const GAME_MODES = new Set(["normal", "hard"]);
const PENALTY_MULTIPLIERS = new Set([1, 2, 3]);
const TURN_TIME_OPTIONS = new Set([6, 8, 10]);
const DEFAULT_TURN_TIME = 6;
const BASE_PENALTY = 5;
const PRIVATE_DECK_SIZE = 5;
const CARD_TOTAL_WEIGHTS = [
  { count: 1, weight: 20 },
  { count: 2, weight: 30 },
  { count: 3, weight: 30 },
  { count: 4, weight: 15 },
  { count: 5, weight: 5 },
];
const AI_CORRECT_MISS_PROBABILITY = 0.1;
const AI_DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);
const DEFAULT_AI_DIFFICULTY = "intermediate";
const AI_DIFFICULTY_SETTINGS = {
  beginner: { label: "초급", correctDelay: [1000, 1800], mistakeChance: 0.04 },
  intermediate: { label: "중급", correctDelay: [700, 1300], mistakeChance: 0.03 },
  advanced: { label: "고급", correctDelay: [450, 900], mistakeChance: 0.02 },
};
const AI_MIN_BELL_REACTION_MS = 300;
const WIN_RANK_SYMBOLS = ["🏆", "🥈", "🥉"];
const RATE_RANK_SYMBOLS = ["⭐", "✨", "💫"];
const EMOTES = {
  "1": "웃음",
  "2": "조롱",
  "3": "화남",
  "4": "울음",
  "5": "방구",
};

const usersByNickname = new Map();
const rooms = new Map();

let roomSequence = 1;
let playerSequence = 1;
let cardSequence = 1;
let userdata = { users: {} };
let userdataDirty = false;
let userdataWriting = false;
let userdataWriteAgain = false;
let rankBadgeCache = new Map();

function logEvent(label, detail = "") {
  console.log(`[${new Date().toISOString()}] ${label}${detail ? ` - ${detail}` : ""}`);
}

function calculateWinRate(wins, losses) {
  const total = wins + losses;
  return total === 0 ? 0 : Math.round((wins / total) * 100);
}

function normalizeStatRecord(record = {}) {
  const wins = Math.max(0, Math.trunc(Number(record.wins) || 0));
  const losses = Math.max(0, Math.trunc(Number(record.losses) || 0));
  return {
    wins,
    losses,
    winRate: calculateWinRate(wins, losses),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    lastNicknameChangeDate:
      typeof record.lastNicknameChangeDate === "string" ? record.lastNicknameChangeDate : "",
  };
}

function markUserdataDirty() {
  userdataDirty = true;
}

async function flushUserdata(force = false) {
  if (!force && !userdataDirty) return;
  if (userdataWriting) {
    userdataWriteAgain = true;
    if (force) {
      while (userdataWriting) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await flushUserdata(true);
    }
    return;
  }

  userdataWriting = true;
  userdataDirty = false;
  const tempPath = `${USERDATA_PATH}.tmp`;
  try {
    await fs.promises.writeFile(tempPath, `${JSON.stringify(userdata, null, 2)}\n`, "utf8");
    await fs.promises.rename(tempPath, USERDATA_PATH);
  } catch (err) {
    userdataDirty = true;
    console.error("Failed to save userdata.json", err);
  } finally {
    userdataWriting = false;
    if (userdataWriteAgain) {
      userdataWriteAgain = false;
      await flushUserdata(force);
    }
  }
}

function saveUserdata() {
  markUserdataDirty();
}

const userdataFlushInterval = setInterval(() => {
  flushUserdata().catch((err) => console.error("Failed to flush userdata.json", err));
}, 5000);
userdataFlushInterval.unref();

async function shutdown(signal) {
  logEvent("Shutdown", signal);
  clearInterval(userdataFlushInterval);
  await flushUserdata(true);
  process.exit(0);
}

process.once("SIGINT", () => {
  shutdown("SIGINT").catch((err) => {
    console.error("Failed during SIGINT shutdown", err);
    process.exit(1);
  });
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM").catch((err) => {
    console.error("Failed during SIGTERM shutdown", err);
    process.exit(1);
  });
});

async function initUserdata() {
  const existed = fs.existsSync(USERDATA_PATH);
  if (!existed) {
    userdata = { users: {} };
    saveUserdata();
    await flushUserdata(true);
    logEvent("userdata created", "userdata.json");
    return;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(USERDATA_PATH, "utf8"));
    userdata = { users: {} };
    const rawUsers = parsed && typeof parsed.users === "object" && parsed.users ? parsed.users : {};
    for (const [nickname, record] of Object.entries(rawUsers)) {
      userdata.users[nickname] = normalizeStatRecord(record);
    }
    saveUserdata();
    await flushUserdata(true);
    logEvent("userdata ready", "userdata.json");
  } catch (err) {
    const backupPath = `${USERDATA_PATH}.broken-${Date.now()}`;
    fs.copyFileSync(USERDATA_PATH, backupPath);
    userdata = { users: {} };
    saveUserdata();
    await flushUserdata(true);
    logEvent("userdata recreated", `invalid JSON backed up to ${path.basename(backupPath)}`);
  }
}

async function ensureStats(nickname) {
  if (!userdata.users[nickname]) {
    userdata.users[nickname] = normalizeStatRecord();
    saveUserdata();
  }
}

async function getStats(nickname) {
  if (!nickname) return { wins: 0, losses: 0, winRate: 0 };
  await ensureStats(nickname);
  const record = normalizeStatRecord(userdata.users[nickname]);
  userdata.users[nickname] = record;
  return { wins: record.wins, losses: record.losses, winRate: record.winRate };
}

function serializeRankRow(row, includeRate = false) {
  const base = {
    nickname: row.nickname,
    displayName: row.displayName,
    isVaNickname: row.isVaNickname,
    wins: row.wins,
  };
  if (includeRate) base.winRate = row.winRate;
  return base;
}

function refreshRankBadgeCache(topWins, topWinRates) {
  const next = new Map();
  const addBadge = (nickname, type, rank, symbol) => {
    if (!nickname || !symbol) return;
    const badges = next.get(nickname) || [];
    badges.push({ type, rank, symbol });
    next.set(nickname, badges);
  };

  topWins.forEach((row, index) => addBadge(row.nickname, "wins", index + 1, WIN_RANK_SYMBOLS[index]));
  topWinRates.forEach((row, index) => addBadge(row.nickname, "rate", index + 1, RATE_RANK_SYMBOLS[index]));
  rankBadgeCache = next;
}

function getRankBadges(nickname) {
  return rankBadgeCache.get(nickname) || [];
}

async function getRankings() {
  const rows = Object.entries(userdata.users).map(([nickname, record]) => ({
    ...getNicknameProfile(nickname),
    ...normalizeStatRecord(record),
  }));

  const topWins = [...rows]
    .sort((a, b) => b.wins - a.wins || a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, 3)
    .map((row) => serializeRankRow(row));

  const topWinRates = rows
    .filter((row) => row.wins + row.losses > 0)
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, 3)
    .map((row) => serializeRankRow(row, true));

  refreshRankBadgeCache(topWins, topWinRates);
  for (const row of topWins) row.rankBadges = getRankBadges(row.nickname);
  for (const row of topWinRates) row.rankBadges = getRankBadges(row.nickname);

  return { topWins, topWinRates };
}

function isValidNickname(nickname) {
  const trimmed = String(nickname || "").trim();
  return trimmed.length > 0 && trimmed.length <= 6;
}

function getServerDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNicknameProfile(nickname) {
  const cleanNickname = String(nickname || "").trim();
  const vaTarget = cleanNickname.startsWith("va") ? cleanNickname.slice(2) : "";
  const isSpecialVa = RESERVED_NICKNAMES.includes(vaTarget);
  return {
    nickname: cleanNickname,
    displayName: isSpecialVa ? vaTarget : cleanNickname,
    isVaNickname: isSpecialVa,
    isReservedDirect: RESERVED_NICKNAMES.includes(cleanNickname),
  };
}

function validateNicknameForUse(nickname, currentNickname = null) {
  const profile = getNicknameProfile(nickname);
  if (!isValidNickname(profile.nickname)) {
    return { ok: false, message: "닉네임은 1~6자로 입력해 주세요.", profile };
  }
  if (profile.isReservedDirect) {
    return { ok: false, message: "중복되는 닉네임입니다", profile };
  }
  const existing = usersByNickname.get(profile.nickname);
  if (existing?.connected && profile.nickname !== currentNickname) {
    return { ok: false, message: "중복되는 닉네임입니다", profile };
  }
  return { ok: true, profile };
}

function isValidTitle(title) {
  const trimmed = String(title || "").trim();
  return trimmed.length > 0 && trimmed.length <= 10;
}

function isValidPassword(password) {
  return /^[0-9]{1,6}$/.test(String(password || ""));
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function getHumanPlayers(room) {
  return room.players.filter((player) => !player.isAI);
}

function getActivePlayers(room) {
  return room.players.filter((player) => !player.spectator && !player.eliminated);
}

function findPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId);
}

function getSocketById(socketId) {
  return socketId ? io.sockets.sockets.get(socketId) : null;
}

function createHumanPlayer(user, isHost = false) {
  return {
    id: `p${playerSequence++}`,
    nickname: user.nickname,
    displayName: user.displayName,
    isVaNickname: user.isVaNickname,
    isAI: false,
    socketId: user.socketId,
    ready: false,
    isHost,
    joinedAt: Date.now(),
    score: 100,
    deck: [],
    deckCount: PRIVATE_DECK_SIZE,
    faceUpCards: [],
    eliminated: false,
    spectator: false,
    connected: true,
    lastEmoteAt: 0,
  };
}

function createAIPlayer(room) {
  const used = new Set(room.players.filter((player) => player.isAI).map((player) => player.nickname));
  const baseName = AI_NAMES.find((name) => !used.has(name)) || `AI 친구${room.aiSerial + 1}`;
  room.aiSerial += 1;
  return {
    id: `ai${playerSequence++}`,
    nickname: baseName,
    displayName: baseName,
    isVaNickname: false,
    isAI: true,
    socketId: null,
    ready: true,
    isHost: false,
    joinedAt: Date.now(),
    score: 100,
    deck: [],
    deckCount: PRIVATE_DECK_SIZE,
    faceUpCards: [],
    eliminated: false,
    spectator: false,
    connected: true,
    lastEmoteAt: 0,
  };
}

function getPenaltyMultiplier(room) {
  return PENALTY_MULTIPLIERS.has(Number(room?.penaltyMultiplier)) ? Number(room.penaltyMultiplier) : 1;
}

function getTurnTime(room) {
  const seconds = Number(room?.turnTime);
  return TURN_TIME_OPTIONS.has(seconds) ? seconds : DEFAULT_TURN_TIME;
}

function getTurnDurationMs(room) {
  return getTurnTime(room) * 1000;
}

function getAIDifficulty(room) {
  const difficulty = String(room?.aiDifficulty || DEFAULT_AI_DIFFICULTY);
  return AI_DIFFICULTIES.has(difficulty) ? difficulty : DEFAULT_AI_DIFFICULTY;
}

function getAIDifficultySettings(room) {
  return AI_DIFFICULTY_SETTINGS[getAIDifficulty(room)] || AI_DIFFICULTY_SETTINGS[DEFAULT_AI_DIFFICULTY];
}

function snapshotPlayerStats(player) {
  if (!player || player.isAI) return null;
  return normalizeStatRecord(userdata.users[player.nickname] || {});
}

function roomActivePlayerCount(room) {
  return room.players.filter((player) => !player.spectator).length;
}

function serializeRoomForLobby(room) {
  return {
    id: room.id,
    title: room.title,
    mode: room.mode,
    penaltyMultiplier: getPenaltyMultiplier(room),
    turnTime: getTurnTime(room),
    aiDifficulty: getAIDifficulty(room),
    currentPlayers: room.players.filter((player) => !player.spectator).length,
    maxPlayers: room.maxPlayers,
    hasPassword: room.hasPassword,
    status: room.status,
  };
}

function getOnlineUsersPayload() {
  return [...usersByNickname.values()]
    .filter((user) => user.connected)
    .map((user) => {
      const room = user.roomId ? rooms.get(user.roomId) : null;
      let status = "lobby";
      let statusLabel = "대기방";
      let roomId = null;
      let roomHasPassword = false;

      if (room) {
        roomId = room.id;
        roomHasPassword = room.hasPassword;
        if (room.status === "waiting") {
          const isFull = roomActivePlayerCount(room) >= room.maxPlayers;
          status = isFull ? "full" : "waiting";
          statusLabel = isFull ? "풀방" : "대기중";
        } else {
          status = "playing";
          statusLabel = "게임중";
        }
      }

      return {
        nickname: user.nickname,
        displayName: user.displayName,
        isVaNickname: user.isVaNickname,
        rankBadges: getRankBadges(user.nickname),
        status,
        statusLabel,
        roomId,
        roomHasPassword,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));
}

async function makeLobbyPayload(nickname) {
  const [stats, rankings] = await Promise.all([getStats(nickname), getRankings()]);
  const profile = getNicknameProfile(nickname);
  return {
    onlineCount: [...usersByNickname.values()].filter((user) => user.connected).length,
    rooms: [...rooms.values()].filter((room) => room.status !== "finished").map(serializeRoomForLobby),
    onlineUsers: getOnlineUsersPayload(),
    currentUser: {
      nickname: profile.nickname,
      displayName: profile.displayName,
      isVaNickname: profile.isVaNickname,
      rankBadges: getRankBadges(profile.nickname),
    },
    myStats: stats,
    top3: rankings.topWins,
    topWins: rankings.topWins,
    topWinRates: rankings.topWinRates,
  };
}

async function emitLobbyState(targetSocket = null) {
  const sockets = targetSocket
    ? [targetSocket]
    : [...io.sockets.sockets.values()].filter((socket) => {
        const nickname = socket.data.nickname;
        const user = nickname ? usersByNickname.get(nickname) : null;
        return Boolean(user?.connected && !user.roomId);
      });
  for (const socket of sockets) {
    const nickname = socket.data.nickname;
    if (!nickname) continue;
    socket.emit("lobbyState", await makeLobbyPayload(nickname));
  }
}

function serializeRoom(room, selfPlayerId = null) {
  return {
    id: room.id,
    title: room.title,
    mode: room.mode,
    penaltyMultiplier: getPenaltyMultiplier(room),
    turnTime: getTurnTime(room),
    aiDifficulty: getAIDifficulty(room),
    hasPassword: room.hasPassword,
    maxPlayers: room.maxPlayers,
    status: room.status,
    hostId: room.hostId,
    selfPlayerId,
    canStart: canStartGame(room),
    players: room.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      displayName: player.displayName,
      isVaNickname: player.isVaNickname,
      rankBadges: player.isAI ? [] : getRankBadges(player.nickname),
      isAI: player.isAI,
      aiDifficulty: player.isAI ? getAIDifficulty(room) : null,
      ready: player.ready,
      isHost: player.id === room.hostId,
      connected: player.connected,
      score: player.score,
      eliminated: player.eliminated,
      spectator: player.spectator,
    })),
  };
}

function serializeCard(card) {
  return card ? deepClone(card) : null;
}

function serializeGame(room, selfPlayerId = null) {
  const game = room.game;
  return {
    roomId: room.id,
    title: room.title,
    mode: room.mode,
    penaltyMultiplier: getPenaltyMultiplier(room),
    turnTime: getTurnTime(room),
    aiDifficulty: getAIDifficulty(room),
    aiDifficultyLabel: getAIDifficultySettings(room).label,
    statsExcluded: room.statsEnabled === false,
    status: room.status,
    selfPlayerId,
    currentTurnPlayerId: game?.currentTurnPlayerId || null,
    turnStartedAt: game?.turnStartedAt || 0,
    turnEndsAt: game?.turnEndsAt || 0,
    turnDurationMs: getTurnDurationMs(room),
    bellLocked: Boolean(game?.bellLocked),
    matchedCharacters: game?.matchedCharacters || [],
    wrongFlash: Boolean(game?.wrongFlash),
    resultVisible: Boolean(game?.resultVisible),
    recentReactionSpeeds: game?.recentReactionSpeeds || [],
    players: room.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      displayName: player.displayName,
      isVaNickname: player.isVaNickname,
      rankBadges: player.isAI ? [] : getRankBadges(player.nickname),
      isAI: player.isAI,
      aiDifficulty: player.isAI ? getAIDifficulty(room) : null,
      aiDifficultyLabel: player.isAI ? getAIDifficultySettings(room).label : null,
      isHost: player.id === room.hostId,
      connected: player.connected,
      score: player.score,
      stats: player.isAI ? null : (player.statsSnapshot || snapshotPlayerStats(player)),
      deckCount: player.spectator ? 0 : (player.deck?.length || PRIVATE_DECK_SIZE),
      faceUpCount: player.faceUpCards?.length || 0,
      topCard: serializeCard(player.faceUpCards?.[player.faceUpCards.length - 1] || null),
      eliminated: player.eliminated,
      spectator: player.spectator,
    })),
  };
}

function emitRoomState(room) {
  for (const player of getHumanPlayers(room)) {
    const socket = getSocketById(player.socketId);
    if (socket) socket.emit("roomState", serializeRoom(room, player.id));
  }
}

function emitGameState(room) {
  for (const player of getHumanPlayers(room)) {
    const socket = getSocketById(player.socketId);
    if (socket) socket.emit("gameState", serializeGame(room, player.id));
  }
}

function canStartGame(room) {
  if (room.status !== "waiting") return false;
  const total = room.players.length;
  if (total < 2 || total > 6) return false;
  return getHumanPlayers(room).every((player) => player.ready);
}

function areAllHumanPlayersReady(room) {
  const humans = getHumanPlayers(room);
  return humans.length > 0 && humans.every((player) => player.ready);
}

function getCurrentUser(socket) {
  const nickname = socket.data.nickname;
  return nickname ? usersByNickname.get(nickname) : null;
}

function getSocketRoomAndPlayer(socket) {
  const user = getCurrentUser(socket);
  if (!user?.roomId) return {};
  const room = rooms.get(user.roomId);
  if (!room) return {};
  const player = findPlayer(room, user.playerId);
  return { user, room, player };
}

function attachSocketToUser(socket, user) {
  user.socketId = socket.id;
  user.connected = true;
  user.disconnectedAt = null;
  socket.data.nickname = user.nickname;
  if (user.reconnectTimer) {
    clearTimeout(user.reconnectTimer);
    user.reconnectTimer = null;
  }
}

function syncPlayerIdentity(player, user) {
  if (!player || !user) return;
  player.nickname = user.nickname;
  player.displayName = user.displayName;
  player.isVaNickname = user.isVaNickname;
}

async function changeUserNickname(socket, nextNickname) {
  const user = getCurrentUser(socket);
  if (!user) {
    socket.emit("nicknameChangeResult", { success: false, message: "닉네임 변경 대상이 없습니다." });
    return;
  }

  const currentNickname = user.nickname;
  const currentRecord = normalizeStatRecord(userdata.users[currentNickname]);
  if (currentRecord.lastNicknameChangeDate === getServerDateKey()) {
    socket.emit("nicknameChangeResult", { success: false, message: "하루에 1회 변경가능합니다" });
    return;
  }

  const validation = validateNicknameForUse(nextNickname, currentNickname);
  if (!validation.ok) {
    socket.emit("nicknameChangeResult", { success: false, message: validation.message });
    return;
  }

  const { nickname, displayName, isVaNickname } = validation.profile;
  if (nickname === currentNickname) {
    socket.emit("nicknameChangeResult", { success: false, message: "현재 닉네임과 같습니다." });
    return;
  }
  if (userdata.users[nickname]) {
    socket.emit("nicknameChangeResult", { success: false, message: "중복되는 닉네임입니다" });
    return;
  }

  const nextRecord = {
    ...currentRecord,
    winRate: calculateWinRate(currentRecord.wins, currentRecord.losses),
    updatedAt: new Date().toISOString(),
    lastNicknameChangeDate: getServerDateKey(),
  };
  delete userdata.users[currentNickname];
  userdata.users[nickname] = nextRecord;
  saveUserdata();

  usersByNickname.delete(currentNickname);
  user.nickname = nickname;
  user.displayName = displayName;
  user.isVaNickname = isVaNickname;
  usersByNickname.set(nickname, user);
  socket.data.nickname = nickname;

  const room = user.roomId ? rooms.get(user.roomId) : null;
  const player = room ? findPlayer(room, user.playerId) : null;
  syncPlayerIdentity(player, user);

  socket.emit("nicknameChangeResult", {
    success: true,
    nickname,
    displayName,
    isVaNickname,
    message: "닉네임이 변경되었습니다.",
  });
  logEvent("Nickname changed", `${currentNickname} -> ${nickname}`);

  if (room) {
    if (room.status === "playing" || room.status === "finished") emitGameState(room);
    else emitRoomState(room);
  }
  emitLobbyState();
}

function cleanupDisconnectedUser(nickname) {
  const user = usersByNickname.get(nickname);
  if (!user) return;
  if (!user.connected && !user.roomId) {
    usersByNickname.delete(nickname);
  }
}

function transferHostIfNeeded(room) {
  const currentHost = findPlayer(room, room.hostId);
  if (currentHost && !currentHost.isAI && !currentHost.spectator) return;
  const nextHost = getHumanPlayers(room).find((player) => !player.spectator);
  room.hostId = nextHost?.id || null;
}

function deleteRoom(roomId, reason = "") {
  const room = rooms.get(roomId);
  if (!room) return;
  clearRoomTimers(room);
  for (const player of getHumanPlayers(room)) {
    const user = usersByNickname.get(player.nickname);
    if (user?.roomId === roomId) {
      user.roomId = null;
      user.playerId = null;
    }
    const socket = getSocketById(player.socketId);
    if (socket) socket.leave(roomId);
  }
  rooms.delete(roomId);
  logEvent("Room deleted", `${room.title}${reason ? ` (${reason})` : ""}`);
  emitLobbyState();
}

function removeHumanFromRoom(room, player, reason = "leave") {
  const user = usersByNickname.get(player.nickname);
  if (user) {
    user.roomId = null;
    user.playerId = null;
  }
  const socket = getSocketById(player.socketId);
  if (socket) socket.leave(room.id);
  room.players = room.players.filter((entry) => entry.id !== player.id);
  logEvent("Room leave", `${player.nickname} / ${room.title} / ${reason}`);
  if (getHumanPlayers(room).length === 0) {
    if (room.status === "playing") finishAIOnlyRoom(room, "AI only");
    else deleteRoom(room.id, "no humans");
    return;
  }
  transferHostIfNeeded(room);
  emitRoomState(room);
  emitLobbyState();
}

function detachGamePlayerToLobby(socket, room, player, reason = "leave game", emitLobby = true) {
  const user = usersByNickname.get(player.nickname);
  const liveSocket = socket || getSocketById(player.socketId);
  if (user) {
    user.roomId = null;
    user.playerId = null;
  }
  player.connected = false;
  player.socketId = null;
  if (liveSocket) {
    liveSocket.leave(room.id);
    liveSocket.emit("roomState", null);
  }
  logEvent("Room leave", `${player.nickname} / ${room.title} / ${reason}`);
  if (emitLobby) emitLobbyState(liveSocket || null);
}

function finishAIOnlyRoom(room, reason = "AI only") {
  if (!room) return;
  const aiWinner = getActivePlayers(room).find((player) => player.isAI)
    || room.players.find((player) => player.isAI);
  room.statsEnabled = false;
  room.status = "finished";
  if (room.game) room.game.resultVisible = true;
  if (aiWinner) logEvent("AI winner", `${aiWinner.nickname} / ${room.title}`);
  deleteRoom(room.id, reason);
}

async function recordLeaveLoss(room, player) {
  if (!room?.statsEnabled || !player || player.isAI) return;
  await ensureStats(player.nickname);
  const current = normalizeStatRecord(userdata.users[player.nickname]);
  const losses = current.losses + 1;
  userdata.users[player.nickname] = {
    ...current,
    losses,
    winRate: calculateWinRate(current.wins, losses),
    updatedAt: new Date().toISOString(),
  };
  saveUserdata();
  logEvent("Leave loss recorded", `${player.nickname} / ${room.title}`);
}

async function removeActiveHumanFromGame(socket, room, player, reason = "leave game") {
  const wasCurrentTurn = room.game?.currentTurnPlayerId === player.id;
  const nextPlayerId = wasCurrentTurn ? nextAlivePlayerId(room, player.id) : room.game?.currentTurnPlayerId;
  await recordLeaveLoss(room, player);
  detachGamePlayerToLobby(socket, room, player, reason, false);
  room.players = room.players.filter((entry) => entry.id !== player.id);

  if (getHumanPlayers(room).length === 0) {
    finishAIOnlyRoom(room, "AI only");
    return;
  }

  const activePlayers = getActivePlayers(room);
  if (activePlayers.length === 0) {
    deleteRoom(room.id, "no active players");
    return;
  }

  transferHostIfNeeded(room);
  if (wasCurrentTurn && room.status === "playing" && room.game) {
    setCurrentTurn(room, nextPlayerId || activePlayers[0].id);
  }

  const winner = getWinner(room);
  emitGameState(room);
  emitLobbyState();
  if (winner) await finishGame(room, winner);
  else scheduleAI(room);
}

function clearRoomTimers(room) {
  if (!room?.game) return;
  for (const timer of room.game.aiTimers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  room.game.aiTimers = [];
  if (room.game.resultTimer) clearTimeout(room.game.resultTimer);
  if (room.game.turnTimer) clearTimeout(room.game.turnTimer);
  if (room.game.roundTimer) clearTimeout(room.game.roundTimer);
  room.game.resultTimer = null;
  room.game.turnTimer = null;
  room.game.roundTimer = null;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeighted(options) {
  const totalWeight = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const option of options) {
    roll -= option.weight;
    if (roll < 0) return option.value ?? option.count;
  }
  const fallback = options[options.length - 1];
  return fallback.value ?? fallback.count;
}

function pickCardTotalCount() {
  return pickWeighted(CARD_TOTAL_WEIGHTS);
}

function pickHardCharacterCount(totalCount) {
  const options = [{ value: 1, weight: 7 }];
  if (totalCount >= 2) options.push({ value: 2, weight: 2 });
  if (totalCount >= 3) options.push({ value: 3, weight: 1 });
  return pickWeighted(options);
}

function shuffle(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickDistinctCharacters(count) {
  return shuffle(CHARACTER_IDS).slice(0, count);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
  }
  return value;
}

function createCard(type, items, counts) {
  const sequence = cardSequence++;
  const cardId = `card_${sequence}`;
  return deepFreeze({
    id: cardId,
    cardId,
    sequence,
    type,
    items: items.map((item) => ({
      characterId: item.characterId,
      slot: item.slot,
    })),
    counts: { ...counts },
  });
}

function cloneCardForOpenPile(card) {
  return deepFreeze(deepClone(card));
}

function createDeck(room) {
  return Array.from({ length: PRIVATE_DECK_SIZE }, () => generateRandomCard(room.mode));
}

function generateSingleCharacterCard() {
  const characterId = CHARACTER_IDS[randomInt(0, CHARACTER_IDS.length - 1)];
  const totalCount = pickCardTotalCount();
  const slots = shuffle([1, 2, 3, 4, 5]).slice(0, totalCount);
  return createCard(
    "single",
    slots.map((slot) => ({ characterId, slot })),
    { [characterId]: totalCount },
  );
}

// Server-side card generation is the fairness boundary for every round.
function generateRandomCard(mode = "normal") {
  if (mode === "normal") return generateSingleCharacterCard();

  const totalCount = pickCardTotalCount();
  const characterCount = pickHardCharacterCount(totalCount);
  const type = characterCount === 1 ? "single" : characterCount === 2 ? "double" : "triple";
  const selectedCharacters = pickDistinctCharacters(characterCount);
  const counts = Object.fromEntries(selectedCharacters.map((characterId) => [characterId, 1]));

  let remaining = totalCount - characterCount;
  while (remaining > 0) {
    const characterId = selectedCharacters[randomInt(0, selectedCharacters.length - 1)];
    counts[characterId] += 1;
    remaining -= 1;
  }

  const slots = shuffle([1, 2, 3, 4, 5]).slice(0, totalCount);
  const items = [];
  for (const characterId of selectedCharacters) {
    for (let i = 0; i < counts[characterId]; i += 1) {
      items.push({ characterId, slot: slots.pop() });
    }
  }

  return createCard(type, shuffle(items), counts);
}

function topCards(room) {
  return room.players
    .filter((player) => !player.spectator && player.faceUpCards.length > 0)
    .map((player) => player.faceUpCards[player.faceUpCards.length - 1]);
}

function evaluateBell(room) {
  const totals = {};
  for (const card of topCards(room)) {
    for (const [characterId, count] of Object.entries(card.counts)) {
      totals[characterId] = (totals[characterId] || 0) + count;
    }
  }
  const matchedCharacters = Object.entries(totals)
    .filter(([, count]) => count === 5)
    .map(([characterId]) => characterId);
  return {
    correct: matchedCharacters.length > 0,
    matchedCharacters,
    totals,
  };
}

function updateCorrectConditionWindow(room) {
  if (!room?.game) return;
  const verdict = evaluateBell(room);
  if (!verdict.correct) {
    room.game.correctConditionStartedAt = null;
    room.game.correctConditionVersion = -1;
    room.game.collectingCorrectReactions = false;
    room.game.reactionPlayerIds = new Set();
    return;
  }
  if (!room.game.correctConditionStartedAt) {
    room.game.correctConditionStartedAt = Date.now();
    room.game.correctConditionVersion = room.game.tableVersion;
    room.game.collectingCorrectReactions = false;
    room.game.reactionPlayerIds = new Set();
    room.game.recentReactionSpeeds = [];
    logEvent("Correct condition opened", `${room.title} version=${room.game.tableVersion}`);
  }
}

function recordCorrectReaction(room, player, reactedAt = Date.now()) {
  if (!room?.game || !player || player.spectator || player.eliminated) return false;
  if (!room.game.correctConditionStartedAt) return false;
  if (!room.game.reactionPlayerIds) room.game.reactionPlayerIds = new Set();
  if (room.game.reactionPlayerIds.has(player.id)) return false;

  const reactionMs = Math.max(0, reactedAt - room.game.correctConditionStartedAt);
  room.game.reactionPlayerIds.add(player.id);
  room.game.recentReactionSpeeds = [
    ...(room.game.recentReactionSpeeds || []),
    {
      playerId: player.id,
      nickname: player.nickname,
      displayName: player.displayName,
      isAI: player.isAI,
      isVaNickname: player.isVaNickname,
      reactionMs,
    },
  ]
    .sort((a, b) => a.reactionMs - b.reactionMs)
    .slice(0, 3);
  return true;
}

function cardFingerprint(card) {
  return JSON.stringify({
    cardId: card.cardId || card.id,
    sequence: card.sequence,
    items: card.items,
    counts: card.counts,
  });
}

function verifyOpenPileStability(room, newestCardId) {
  if (!room?.game) return;
  if (!room.game.openPileFingerprints) room.game.openPileFingerprints = {};

  for (const player of room.players) {
    for (const card of player.faceUpCards || []) {
      const cardId = card.cardId || card.id;
      const key = `${player.id}:${cardId}`;
      const fingerprint = cardFingerprint(card);
      const previous = room.game.openPileFingerprints[key];
      if (!previous) {
        room.game.openPileFingerprints[key] = fingerprint;
        continue;
      }
      if (previous !== fingerprint) {
        logEvent("OpenPile changed", `player=${player.nickname} cardId=${cardId}`);
        continue;
      }
      if (cardId !== newestCardId) {
        logEvent("OpenPile stable", `player=${player.nickname} cardId=${cardId}`);
      }
    }
  }
}

function analyzeAIMistakeRisk(room, verdict) {
  const cards = topCards(room);
  const counts = Object.values(verdict.totals).map((value) => Number(value || 0));
  const totalVisibleItems = cards.reduce((sum, card) => sum + (card.items?.length || 0), 0);
  const complexCards = cards.filter((card) => (card.items?.length || 0) >= 3).length;
  const recentOpenAge = Date.now() - (room.game?.lastCardOpenedAt || 0);
  const reasons = [];

  if (counts.some((count) => count === 4)) reasons.push("near-five");
  if (counts.some((count) => count >= 6)) reasons.push("over-five");
  if (room.mode === "hard" && complexCards >= 2) reasons.push("hard-complex");
  if (totalVisibleItems >= 12 || (cards.length >= 4 && totalVisibleItems >= 10)) reasons.push("crowded-table");
  if (recentOpenAge >= 0 && recentOpenAge <= 800) reasons.push("recent-open");

  return {
    allowed: reasons.includes("recent-open") && reasons.some((reason) => reason !== "recent-open"),
    reasons,
  };
}

function nextAlivePlayerId(room, fromPlayerId) {
  const activePlayers = getActivePlayers(room);
  if (activePlayers.length === 0) return null;
  const startIndex = room.players.findIndex((player) => player.id === fromPlayerId);
  for (let offset = 1; offset <= room.players.length; offset += 1) {
    const candidate = room.players[(startIndex + offset + room.players.length) % room.players.length];
    if (candidate && !candidate.spectator && !candidate.eliminated) return candidate.id;
  }
  return activePlayers[0].id;
}

function eliminatePlayersIfNeeded(room) {
  for (const player of room.players) {
    if (!player.spectator && player.score <= 0) {
      player.eliminated = true;
      player.spectator = true;
      logEvent("Eliminated", `${player.nickname} / ${room.title}`);
    }
  }
}

function clearRoundCards(room) {
  for (const player of room.players) {
    player.faceUpCards = [];
    if (player.spectator) player.deckCount = 0;
    else player.deckCount = player.deck?.length || PRIVATE_DECK_SIZE;
  }
  if (room.game) {
    room.game.openPileFingerprints = {};
    room.game.correctConditionStartedAt = null;
    room.game.correctConditionVersion = -1;
    room.game.collectingCorrectReactions = false;
    room.game.reactionPlayerIds = new Set();
  }
}

function getWinner(room) {
  const activePlayers = getActivePlayers(room);
  return activePlayers.length === 1 ? activePlayers[0] : null;
}

async function recordGameResult(room, winner) {
  if (!room.statsEnabled) {
    logEvent("Stats skipped", `${room.title} includes AI`);
    return;
  }
  for (const player of getHumanPlayers(room)) {
    await ensureStats(player.nickname);
    const isWinner = player.id === winner.id;
    const current = normalizeStatRecord(userdata.users[player.nickname]);
    const wins = current.wins + (isWinner ? 1 : 0);
    const losses = current.losses + (isWinner ? 0 : 1);
    userdata.users[player.nickname] = {
      ...current,
      wins,
      losses,
      winRate: calculateWinRate(wins, losses),
      updatedAt: new Date().toISOString(),
    };
  }
  saveUserdata();
}

async function finishGame(room, winner) {
  if (!room || room.status === "finished") return;
  room.status = "finished";
  room.game.resultVisible = true;
  clearRoomTimers(room);
  logEvent("Victory", `${winner.nickname} / ${room.title}`);
  await recordGameResult(room, winner);

  const result = {
    winner: {
      id: winner.id,
      nickname: winner.nickname,
      displayName: winner.displayName,
      isVaNickname: winner.isVaNickname,
      isAI: winner.isAI,
    },
    players: room.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      displayName: player.displayName,
      isVaNickname: player.isVaNickname,
      isAI: player.isAI,
      score: player.score,
      eliminated: player.eliminated,
      spectator: player.spectator,
    })),
    returnAfterMs: 5000,
    statsExcluded: room.statsEnabled === false,
  };
  io.to(room.id).emit("gameResult", result);
  emitGameState(room);
  logEvent("Game ended", room.title);

  room.game.resultTimer = setTimeout(() => {
    const winningHumans = getHumanPlayers(room).filter((player) => player.id === winner.id);
    for (const player of winningHumans) {
      const user = usersByNickname.get(player.nickname);
      if (user?.roomId === room.id && user.playerId === player.id) {
        user.roomId = null;
        user.playerId = null;
      }
      const socket = getSocketById(player.socketId);
      if (socket) {
        socket.leave(room.id);
        socket.emit("roomState", null);
      }
      player.socketId = null;
      player.connected = false;
    }
    room.players = room.players.filter((player) => !winningHumans.some((winnerPlayer) => winnerPlayer.id === player.id));
    if (getHumanPlayers(room).filter((player) => getSocketById(player.socketId)).length === 0) {
      clearRoomTimers(room);
      rooms.delete(room.id);
    } else {
      emitGameState(room);
    }
    emitLobbyState();
  }, 5000);
}

function clearTurnTimer(room) {
  if (room?.game?.turnTimer) clearTimeout(room.game.turnTimer);
  if (room?.game) room.game.turnTimer = null;
}

function setCurrentTurn(room, playerId) {
  if (!room?.game || !playerId) return;
  clearTurnTimer(room);
  const now = Date.now();
  const turnDurationMs = getTurnDurationMs(room);
  room.game.currentTurnPlayerId = playerId;
  room.game.turnStartedAt = now;
  room.game.turnEndsAt = now + turnDurationMs;
  room.game.turnSerial = (room.game.turnSerial || 0) + 1;
  const turnSerial = room.game.turnSerial;

  room.game.turnTimer = setTimeout(() => {
    const liveRoom = rooms.get(room.id);
    if (!liveRoom?.game || liveRoom.status !== "playing") return;
    if (liveRoom.game.bellLocked || liveRoom.game.turnSerial !== turnSerial) return;
    handleTurnTimeout(liveRoom, playerId);
  }, turnDurationMs + 40);
}

function beginGame(room) {
  room.status = "playing";
  room.statsEnabled = !room.players.some((player) => player.isAI);
  for (const player of room.players) {
    player.ready = player.isAI ? true : player.ready;
    player.score = 100;
    player.deck = createDeck(room);
    player.deckCount = player.deck.length;
    player.faceUpCards = [];
    player.eliminated = false;
    player.spectator = false;
    player.connected = true;
    player.statsSnapshot = player.isAI ? null : snapshotPlayerStats(player);
    logEvent("deck initialized", `player=${player.nickname} cardIds=[${player.deck.map((card) => card.cardId).join(",")}]`);
  }

  const activePlayers = getActivePlayers(room);
  room.game = {
    currentTurnPlayerId: null,
    turnStartedAt: 0,
    turnEndsAt: 0,
    turnSerial: 0,
    turnTimer: null,
    bellLocked: false,
    matchedCharacters: [],
    wrongFlash: false,
    tableVersion: 0,
    aiBellScheduledForVersion: -1,
    aiTimers: [],
    openPileFingerprints: {},
    lastCardOpenedAt: 0,
    lastOpenedCardId: null,
    correctConditionStartedAt: null,
    correctConditionVersion: -1,
    collectingCorrectReactions: false,
    reactionPlayerIds: new Set(),
    recentReactionSpeeds: [],
    resultVisible: false,
    resultTimer: null,
    roundTimer: null,
  };
  setCurrentTurn(room, activePlayers[randomInt(0, activePlayers.length - 1)].id);

  logEvent("Game started", room.title);
  emitRoomState(room);
  emitGameState(room);
  scheduleAI(room);
}

function handleFlipCard(room, player) {
  if (!room || room.status !== "playing" || !room.game) return false;
  if (room.game.bellLocked) return false;
  if (!player || player.spectator || player.eliminated) return false;
  if (room.game.currentTurnPlayerId !== player.id) return false;

  if (!Array.isArray(player.deck) || player.deck.length === 0) {
    player.deck = createDeck(room);
  }
  const deckCard = player.deck.shift();
  const openedCard = cloneCardForOpenPile(deckCard);
  player.faceUpCards.push(openedCard);
  const replacementCard = generateRandomCard(room.mode);
  player.deck.push(replacementCard);
  player.deckCount = player.deck.length;
  room.game.lastCardOpenedAt = Date.now();
  room.game.lastOpenedCardId = openedCard.cardId;
  room.game.tableVersion += 1;
  updateCorrectConditionWindow(room);
  setCurrentTurn(room, nextAlivePlayerId(room, player.id));
  logEvent(
    "flip",
    `player=${player.nickname} openedCardId=${openedCard.cardId} replacementCardId=${replacementCard.cardId} deckSize=${player.deck.length} counts=${JSON.stringify(openedCard.counts)}`,
  );
  verifyOpenPileStability(room, openedCard.cardId);
  emitGameState(room);
  scheduleAI(room);
  return true;
}

function scaledPenalty(room, basePenalty) {
  return basePenalty * getPenaltyMultiplier(room);
}

function applyCorrectPenalty(room, bellRinger) {
  const changes = [];
  for (const player of getActivePlayers(room)) {
    if (player.id === bellRinger.id) continue;
    const penalty = scaledPenalty(room, (player.faceUpCards.length || 0) * BASE_PENALTY);
    player.score -= penalty;
    if (penalty > 0) changes.push({ playerId: player.id, delta: -penalty, score: player.score });
    if (penalty > 0) logEvent("Score changed", `${player.nickname} -${penalty} = ${player.score}`);
  }
  return changes;
}

function applyWrongPenalty(room, bellRinger) {
  const penalty = scaledPenalty(room, getActivePlayers(room).length * BASE_PENALTY);
  bellRinger.score -= penalty;
  logEvent("Score changed", `${bellRinger.nickname} -${penalty} = ${bellRinger.score}`);
  return { playerId: bellRinger.id, delta: -penalty, score: bellRinger.score };
}

function handleBell(room, bellRinger) {
  if (!room || room.status !== "playing" || !room.game) return;
  if (!bellRinger || bellRinger.spectator || bellRinger.eliminated) return;
  if (room.game.bellLocked) {
    if (room.game.collectingCorrectReactions && recordCorrectReaction(room, bellRinger)) {
      emitGameState(room);
    }
    return;
  }

  clearTurnTimer(room);
  room.game.bellLocked = true;
  const verdict = evaluateBell(room);
  room.game.matchedCharacters = verdict.correct ? verdict.matchedCharacters : [];
  room.game.wrongFlash = !verdict.correct;
  logEvent("Bell input", `${bellRinger.nickname} / ${room.title}`);

  let scoreChanges = [];
  if (verdict.correct) {
    logEvent("Correct", `${bellRinger.nickname} / ${verdict.matchedCharacters.join(",")}`);
    room.game.collectingCorrectReactions = true;
    recordCorrectReaction(room, bellRinger, Date.now());
    scoreChanges = applyCorrectPenalty(room, bellRinger);
  } else {
    logEvent("Wrong", bellRinger.nickname);
    scoreChanges = [applyWrongPenalty(room, bellRinger)];
  }

  eliminatePlayersIfNeeded(room);
  const winner = getWinner(room);

  io.to(room.id).emit("bellResult", {
    correct: verdict.correct,
    bellRingerId: bellRinger.id,
    bellRingerName: bellRinger.nickname,
    bellRingerDisplayName: bellRinger.displayName,
    bellRingerIsVaNickname: bellRinger.isVaNickname,
    matchedCharacters: verdict.matchedCharacters,
    reactionSpeeds: room.game.recentReactionSpeeds || [],
    scoreChanges,
  });
  emitGameState(room);

  if (room.game.roundTimer) clearTimeout(room.game.roundTimer);
  room.game.roundTimer = setTimeout(async () => {
    const liveRoom = rooms.get(room.id);
    if (!liveRoom?.game || liveRoom.status !== "playing") return;
    liveRoom.game.roundTimer = null;
    clearRoundCards(liveRoom);
    liveRoom.game.matchedCharacters = [];
    liveRoom.game.wrongFlash = false;
    liveRoom.game.bellLocked = false;
    liveRoom.game.tableVersion += 1;

    if (winner) {
      await finishGame(liveRoom, winner);
      return;
    }

    setCurrentTurn(liveRoom, bellRinger.spectator
      ? nextAlivePlayerId(liveRoom, bellRinger.id)
      : bellRinger.id);
    emitGameState(liveRoom);
    scheduleAI(liveRoom);
  }, 1000);
}

function applyTimeoutPenalty(room, player) {
  const penalty = scaledPenalty(room, getActivePlayers(room).length * BASE_PENALTY);
  player.score -= penalty;
  logEvent("Timeout penalty", `${player.nickname} -${penalty} = ${player.score}`);
  return { playerId: player.id, delta: -penalty, score: player.score };
}

function handleTurnTimeout(room, playerId) {
  if (!room || room.status !== "playing" || !room.game || room.game.bellLocked) return;
  const player = findPlayer(room, playerId);
  if (!player || player.spectator || player.eliminated) return;

  clearTurnTimer(room);
  room.game.bellLocked = true;
  room.game.matchedCharacters = [];
  room.game.wrongFlash = true;

  const scoreChange = applyTimeoutPenalty(room, player);
  eliminatePlayersIfNeeded(room);
  const winner = getWinner(room);

  io.to(room.id).emit("timeoutResult", {
    playerId: player.id,
    playerName: player.nickname,
    playerDisplayName: player.displayName,
    playerIsVaNickname: player.isVaNickname,
    penalty: Math.abs(scoreChange.delta),
    scoreChanges: [scoreChange],
  });
  emitGameState(room);

  if (room.game.roundTimer) clearTimeout(room.game.roundTimer);
  room.game.roundTimer = setTimeout(async () => {
    const liveRoom = rooms.get(room.id);
    if (!liveRoom?.game || liveRoom.status !== "playing") return;
    liveRoom.game.roundTimer = null;
    clearRoundCards(liveRoom);
    liveRoom.game.wrongFlash = false;
    liveRoom.game.bellLocked = false;
    liveRoom.game.tableVersion += 1;

    if (winner) {
      await finishGame(liveRoom, winner);
      return;
    }

    setCurrentTurn(liveRoom, player.spectator ? nextAlivePlayerId(liveRoom, player.id) : player.id);
    emitGameState(liveRoom);
    scheduleAI(liveRoom);
  }, 1000);
}

function pushAITimer(room, timer) {
  if (room?.game) room.game.aiTimers.push(timer);
}

function scheduleAI(room) {
  if (!room || room.status !== "playing" || !room.game || room.game.bellLocked) return;
  scheduleAITurn(room);
  scheduleAIBell(room);
}

function scheduleAITurn(room) {
  const currentPlayer = findPlayer(room, room.game.currentTurnPlayerId);
  if (!currentPlayer?.isAI || currentPlayer.spectator || currentPlayer.eliminated) return;

  const delay = randomInt(500, 2000);
  const playerId = currentPlayer.id;
  const tableVersion = room.game.tableVersion;
  const timer = setTimeout(() => {
    const liveRoom = rooms.get(room.id);
    if (!liveRoom?.game || liveRoom.status !== "playing") return;
    if (liveRoom.game.bellLocked || liveRoom.game.currentTurnPlayerId !== playerId) return;
    if (liveRoom.game.tableVersion !== tableVersion) return;
    const livePlayer = findPlayer(liveRoom, playerId);
    handleFlipCard(liveRoom, livePlayer);
  }, delay);
  pushAITimer(room, timer);
}

function scheduleAIBell(room) {
  if (topCards(room).length === 0) return;
  if (room.game.aiBellScheduledForVersion === room.game.tableVersion) return;
  room.game.aiBellScheduledForVersion = room.game.tableVersion;

  const verdict = evaluateBell(room);
  const mistakeRisk = analyzeAIMistakeRisk(room, verdict);
  const difficulty = getAIDifficultySettings(room);
  const aiPlayers = getActivePlayers(room).filter((player) => player.isAI);
  for (const ai of aiPlayers) {
    if (verdict.correct && Math.random() < AI_CORRECT_MISS_PROBABILITY) continue;
    if (!verdict.correct) {
      if (!mistakeRisk.allowed) continue;
      if (Math.random() >= difficulty.mistakeChance) continue;
    }

    const [correctMin, correctMax] = difficulty.correctDelay;
    const delay = verdict.correct
      ? Math.max(AI_MIN_BELL_REACTION_MS, randomInt(correctMin, correctMax))
      : randomInt(300, 800);
    const aiId = ai.id;
    const tableVersion = room.game.tableVersion;
    if (!verdict.correct) {
      logEvent("AI mistake scheduled", `player=${ai.nickname} reasons=[${mistakeRisk.reasons.join(",")}] delay=${delay}ms`);
    }
    const timer = setTimeout(() => {
      const liveRoom = rooms.get(room.id);
      if (!liveRoom?.game || liveRoom.status !== "playing") return;
      if (liveRoom.game.tableVersion !== tableVersion) return;
      const liveAI = findPlayer(liveRoom, aiId);
      if (liveRoom.game.bellLocked) {
        if (liveRoom.game.collectingCorrectReactions && recordCorrectReaction(liveRoom, liveAI)) {
          emitGameState(liveRoom);
        }
        return;
      }
      handleBell(liveRoom, liveAI);
    }, delay);
    pushAITimer(room, timer);
  }
}

function joinRoomInternal(socket, room) {
  const user = getCurrentUser(socket);
  if (!user || !room) return;
  if (user.roomId) {
    socket.emit("errorMessage", "이미 방에 들어가 있습니다.");
    return;
  }
  if (room.status !== "waiting") {
    socket.emit("errorMessage", "진행 중인 방에는 입장할 수 없습니다");
    return;
  }
  if (room.players.length >= room.maxPlayers) {
    socket.emit("errorMessage", "해당 방은 가득 찼습니다");
    return;
  }

  const player = createHumanPlayer(user, false);
  room.players.push(player);
  user.roomId = room.id;
  user.playerId = player.id;
  socket.join(room.id);
  logEvent("Room join", `${player.nickname} / ${room.title}`);
  emitRoomState(room);
  emitLobbyState();
}

function addAIToRoom(room) {
  if (room.status !== "waiting" || room.players.length >= room.maxPlayers) return false;
  if (areAllHumanPlayersReady(room)) return false;
  const ai = createAIPlayer(room);
  room.players.push(ai);
  logEvent("AI added", `${ai.nickname} / ${room.title}`);
  return true;
}

function removeAIFromRoom(room) {
  if (room.status !== "waiting") return false;
  const aiIndex = room.players.map((player) => player.isAI).lastIndexOf(true);
  if (aiIndex === -1) return false;
  const [ai] = room.players.splice(aiIndex, 1);
  logEvent("AI removed", `${ai.nickname} / ${room.title}`);
  return true;
}

function handleReconnect(socket, nickname, user) {
  attachSocketToUser(socket, user);
  const room = user.roomId ? rooms.get(user.roomId) : null;
  const player = room ? findPlayer(room, user.playerId) : null;
  if (room && player) {
    player.socketId = socket.id;
    player.connected = true;
    socket.join(room.id);
    socket.emit("reconnectResult", { success: true, roomId: room.id, spectator: player.spectator });
    logEvent("Reconnect success", `${nickname} / ${room.title}`);
    if (room.status === "playing" || room.status === "finished") emitGameState(room);
    else emitRoomState(room);
    emitLobbyState(socket);
    return true;
  }
  return false;
}

async function handleDisconnect(socket) {
  const nickname = socket.data.nickname;
  if (!nickname) return;
  const user = usersByNickname.get(nickname);
  if (!user || user.socketId !== socket.id) return;
  user.connected = false;
  user.socketId = null;
  user.disconnectedAt = Date.now();
  logEvent("User disconnected", nickname);

  if (!user.roomId) {
    cleanupDisconnectedUser(nickname);
    emitLobbyState();
    return;
  }

  const room = rooms.get(user.roomId);
  const player = room ? findPlayer(room, user.playerId) : null;
  if (!room || !player) {
    cleanupDisconnectedUser(nickname);
    emitLobbyState();
    return;
  }

  player.connected = false;

  if (room.status !== "playing") {
    removeHumanFromRoom(room, player, "disconnect");
    cleanupDisconnectedUser(nickname);
    return;
  }

  if (player.spectator) {
    removeHumanFromRoom(room, player, "spectator disconnect");
    cleanupDisconnectedUser(nickname);
    return;
  }

  await removeActiveHumanFromGame(null, room, player, "disconnect");
  cleanupDisconnectedUser(nickname);
}

io.on("connection", (socket) => {
  logEvent("Socket connected", socket.id);

  socket.on("joinLobby", async ({ nickname } = {}) => {
    const validation = validateNicknameForUse(nickname);
    if (!validation.ok) {
      socket.emit("nicknameError", validation.message);
      return;
    }
    const { nickname: cleanNickname, displayName, isVaNickname } = validation.profile;
    const existing = usersByNickname.get(cleanNickname);

    if (existing && handleReconnect(socket, cleanNickname, existing)) return;

    await ensureStats(cleanNickname);
    const user = {
      nickname: cleanNickname,
      displayName,
      isVaNickname,
      socketId: socket.id,
      connected: true,
      roomId: null,
      playerId: null,
      disconnectedAt: null,
      reconnectTimer: null,
    };
    usersByNickname.set(cleanNickname, user);
    socket.data.nickname = cleanNickname;
    logEvent("User joined", cleanNickname);
    emitLobbyState();
  });

  socket.on("changeNickname", async ({ nickname } = {}) => {
    await changeUserNickname(socket, nickname);
  });

  socket.on("refreshLobby", () => {
    emitLobbyState(socket);
  });

  socket.on("latencyPing", ({ nonce, sentAt } = {}) => {
    socket.emit("latencyPong", {
      nonce,
      sentAt,
      serverTime: Date.now(),
    });
  });

  socket.on("createRoom", ({ title, isPrivate, password, maxPlayers, aiCount, mode, penaltyMultiplier, turnTime, aiDifficulty } = {}) => {
    const user = getCurrentUser(socket);
    if (!user || user.roomId) return;
    const roomTitle = String(title || "").trim();
    const max = Number(maxPlayers);
    const aiTotal = Number(aiCount || 0);
    const roomMode = GAME_MODES.has(String(mode)) ? String(mode) : "normal";
    const penalty = PENALTY_MULTIPLIERS.has(Number(penaltyMultiplier)) ? Number(penaltyMultiplier) : 1;
    const selectedTurnTime = TURN_TIME_OPTIONS.has(Number(turnTime)) ? Number(turnTime) : DEFAULT_TURN_TIME;
    const selectedAIDifficulty = AI_DIFFICULTIES.has(String(aiDifficulty)) ? String(aiDifficulty) : DEFAULT_AI_DIFFICULTY;

    if (!isValidTitle(roomTitle)) {
      socket.emit("errorMessage", "방 제목은 1~10자로 입력해 주세요.");
      return;
    }
    if (![2, 3, 4, 5, 6].includes(max)) {
      socket.emit("errorMessage", "최대 인원을 선택해 주세요.");
      return;
    }
    if (!Number.isInteger(aiTotal) || aiTotal < 0 || aiTotal > 5 || aiTotal + 1 > max) {
      socket.emit("errorMessage", "AI 수가 최대 인원을 초과합니다.");
      return;
    }
    if (isPrivate && !isValidPassword(password)) {
      socket.emit("errorMessage", "비밀번호는 숫자 1~6자리여야 합니다.");
      return;
    }

    const room = {
      id: `room${roomSequence++}`,
      title: roomTitle,
      mode: roomMode,
      penaltyMultiplier: penalty,
      turnTime: selectedTurnTime,
      aiDifficulty: selectedAIDifficulty,
      hasPassword: Boolean(isPrivate),
      password: isPrivate ? String(password) : "",
      maxPlayers: max,
      hostId: null,
      status: "waiting",
      players: [],
      aiSerial: 0,
      statsEnabled: true,
      game: null,
      createdAt: Date.now(),
    };

    const host = createHumanPlayer(user, true);
    room.hostId = host.id;
    room.players.push(host);
    for (let i = 0; i < aiTotal; i += 1) addAIToRoom(room);

    rooms.set(room.id, room);
    user.roomId = room.id;
    user.playerId = host.id;
    socket.join(room.id);
    logEvent("Room created", `${room.title} / ${host.nickname}`);
    emitRoomState(room);
    emitLobbyState();
  });

  socket.on("joinRoom", ({ roomId } = {}) => {
    const room = rooms.get(String(roomId || ""));
    if (!room) {
      socket.emit("errorMessage", "방을 찾을 수 없습니다.");
      return;
    }
    if (room.status !== "waiting") {
      socket.emit("errorMessage", "진행 중인 방에는 입장할 수 없습니다");
      return;
    }
    if (room.players.length >= room.maxPlayers) {
      socket.emit("errorMessage", "해당 방은 가득 찼습니다");
      return;
    }
    if (room.hasPassword) {
      socket.emit("roomPasswordError", {
        roomId: room.id,
        needsPassword: true,
        message: "비밀번호방입니다.\n비밀번호를 입력해 주세요.",
      });
      return;
    }
    joinRoomInternal(socket, room);
  });

  socket.on("submitRoomPassword", ({ roomId, password } = {}) => {
    const room = rooms.get(String(roomId || ""));
    if (!room) {
      socket.emit("roomPasswordError", { message: "방을 찾을 수 없습니다." });
      return;
    }
    if (room.status !== "waiting") {
      socket.emit("errorMessage", "진행 중인 방에는 입장할 수 없습니다");
      return;
    }
    if (room.players.length >= room.maxPlayers) {
      socket.emit("errorMessage", "해당 방은 가득 찼습니다");
      return;
    }
    if (!isValidPassword(password) || String(password) !== room.password) {
      socket.emit("roomPasswordError", {
        roomId: room.id,
        needsPassword: true,
        message: "비밀번호가 올바르지 않습니다.",
      });
      return;
    }
    joinRoomInternal(socket, room);
  });

  socket.on("leaveRoom", async () => {
    const { user, room, player } = getSocketRoomAndPlayer(socket);
    if (!user || !room || !player) {
      socket.emit("roomState", null);
      emitLobbyState(socket);
      return;
    }

    if (room.status === "playing" && !player.spectator) {
      await removeActiveHumanFromGame(socket, room, player, "leave game");
      return;
    }

    if (room.status === "playing" && player.spectator) {
      detachGamePlayerToLobby(socket, room, player, "spectator leave");
      room.players = room.players.filter((entry) => entry.id !== player.id);
      if (getHumanPlayers(room).length === 0) {
        finishAIOnlyRoom(room, "AI only");
        return;
      }
      emitGameState(room);
      emitLobbyState();
      return;
    }

    removeHumanFromRoom(room, player, "leave");
    socket.emit("roomState", null);
    emitLobbyState(socket);
  });

  socket.on("toggleReady", () => {
    const { room, player } = getSocketRoomAndPlayer(socket);
    if (!room || !player || room.status !== "waiting" || player.isAI) return;
    player.ready = !player.ready;
    emitRoomState(room);
  });

  socket.on("addAI", () => {
    const { room, player } = getSocketRoomAndPlayer(socket);
    if (!room || !player || player.id !== room.hostId) return;
    if (areAllHumanPlayersReady(room)) {
      socket.emit("errorMessage", "모든 인간 플레이어가 준비 완료되어 AI를 추가할 수 없습니다.");
      return;
    }
    if (!addAIToRoom(room)) socket.emit("errorMessage", "AI를 더 추가할 수 없습니다.");
    emitRoomState(room);
    emitLobbyState();
  });

  socket.on("removeAI", () => {
    const { room, player } = getSocketRoomAndPlayer(socket);
    if (!room || !player || player.id !== room.hostId) return;
    if (!removeAIFromRoom(room)) socket.emit("errorMessage", "제거할 AI가 없습니다.");
    emitRoomState(room);
    emitLobbyState();
  });

  socket.on("setAIDifficulty", ({ aiDifficulty } = {}) => {
    const { room, player } = getSocketRoomAndPlayer(socket);
    if (!room || !player || player.id !== room.hostId || room.status !== "waiting") return;
    const selected = AI_DIFFICULTIES.has(String(aiDifficulty)) ? String(aiDifficulty) : DEFAULT_AI_DIFFICULTY;
    room.aiDifficulty = selected;
    logEvent("AI difficulty changed", `${room.title} / ${AI_DIFFICULTY_SETTINGS[selected].label}`);
    emitRoomState(room);
    emitLobbyState();
  });

  socket.on("startGame", () => {
    const { room, player } = getSocketRoomAndPlayer(socket);
    if (!room || !player || player.id !== room.hostId) return;
    if (!canStartGame(room)) {
      socket.emit("errorMessage", "게임 시작 조건: 총 2명 이상");
      return;
    }
    beginGame(room);
  });

  socket.on("flipCard", () => {
    const { room, player } = getSocketRoomAndPlayer(socket);
    if (!room || !player || player.isAI) return;
    handleFlipCard(room, player);
  });

  socket.on("ringBell", () => {
    const { room, player } = getSocketRoomAndPlayer(socket);
    if (!room || !player || player.isAI) return;
    handleBell(room, player);
  });

  socket.on("sendEmote", ({ emote } = {}) => {
    const { room, player } = getSocketRoomAndPlayer(socket);
    const key = String(emote || "");
    if (!room || !player || room.status !== "playing") return;
    if (player.spectator || player.eliminated || !EMOTES[key]) return;
    if (Date.now() - player.lastEmoteAt < 5000) return;
    player.lastEmoteAt = Date.now();
    io.to(room.id).emit("emoteEvent", {
      playerId: player.id,
      label: EMOTES[key],
      emote: key,
    });
  });

  socket.on("disconnect", () => {
    handleDisconnect(socket).catch((err) => logEvent("Disconnect error", err.message));
  });
});

initUserdata()
  .then(() => {
    server.listen(PORT, () => {
      logEvent("Server started", `http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server", err);
    process.exit(1);
  });
