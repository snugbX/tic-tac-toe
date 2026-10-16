const sounds = {
  human: new Audio('./sounds/click_human.wav'),
  ai: new Audio('./sounds/click_ai.mp3'),
  win: new Audio('./sounds/win.mp3'),
  lose: new Audio('./sounds/lose.mp3'),
  draw: new Audio('./sounds/draw.mp3')
};

const cells = [...document.querySelectorAll('.cell')];
const statusElement = document.getElementById('status');
const resetButton = document.getElementById('resetButton');
const scoreXElement = document.getElementById('scoreX');
const scoreOElement = document.getElementById('scoreO');
const scoreDrawsElement = document.getElementById('scoreDraws');
const roundCountElement = document.getElementById('roundCount');
const moveHistoryElement = document.getElementById('moveHistory');
const matchHistoryElement = document.getElementById('matchHistory');
const resetStatsButton = document.getElementById('resetStatsButton');
const symbolSelect = document.getElementById('symbol');
const starterSelect = document.getElementById('starter');
const setupScreen = document.getElementById('setupScreen');
const startGameButton = document.getElementById('startGameButton');
const localSetupActions = document.getElementById('localSetupActions');
const playerNameField = document.getElementById('playerNameField');
const playerNameInput = document.getElementById('playerName');
const backToMenuButton = document.getElementById('backToMenuButton');
const gameScreen = document.getElementById('gameScreen');
const themeToggle = document.getElementById('themeToggle');
const modeSelect = document.getElementById('mode');
const difficultySelect = document.getElementById('difficulty');
const difficultyField = document.getElementById('difficultyField');
const symbolField = document.getElementById('symbolField');
const starterField = document.getElementById('starterField');
const onlineLobby = document.getElementById('onlineLobby');
const createRoomButton = document.getElementById('createRoomButton');
const joinRoomButton = document.getElementById('joinRoomButton');
const findRoomsButton = document.getElementById('findRoomsButton');
const roomListContainer = document.getElementById('roomListContainer');
const roomListMessage = document.getElementById('roomListMessage');
const roomList = document.getElementById('roomList');
const roomCodeInput = document.getElementById('roomCode');
const roomShare = document.getElementById('roomShare');
const roomLinkInput = document.getElementById('roomLink');
const copyRoomLinkButton = document.getElementById('copyRoomLinkButton');
const connectionStatus = document.getElementById('connectionStatus');
const leaveRoomButton = document.getElementById('leaveRoomButton');
const onlinePlayersPanel = document.getElementById('onlinePlayersPanel');
const playerCards = document.getElementById('playerCards');
const roomBadge = document.getElementById('roomBadge');
const playerJoinAlert = document.getElementById('playerJoinAlert');
const playerJoinAlertText = document.getElementById('playerJoinAlertText');
const chatPanel = document.getElementById('chatPanel');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessagesElement = document.getElementById('chatMessages');
const chatHint = document.getElementById('chatHint');
const sendChatButton = document.getElementById('sendChatButton');
const boardElement = document.getElementById('board');
const canvas = document.getElementById('boardCanvas');
const webglWarning = document.getElementById('webglWarning');

const winCombos = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

let gl;
let program;
let vertexBuffer;
let resolutionUniform;
let colorUniform;
let board = [];
let playerOne = 'X';
let playerTwo = 'O';
let human = 'X';
let ai = 'O';
let currentPlayer = 'X';
let gameOver = false;
let aiThinking = false;
let aiMoveTimeout;
let boardResizeObserver;
let supabaseClient;
let onlineChannel;
let onlineLobbyChannel;
let onlineLobbyConnected = false;
let onlineLobbyConnectionPromise;
let currentLobbyStatus = 'idle';
let currentLobbyRoomCode = '';
let currentLobbyHostId = '';
let currentLobbyCreatedAt = 0;
let onlineRoomCode = '';
let onlineHostId = '';
let onlinePlayerId = getOnlinePlayerId();
let onlineSymbol = '';
let onlinePlayerCount = 0;
let onlineConnected = false;
let onlineSpectator = false;
let onlineGameRevision = 0;
let playerName = loadSavedPlayerName();
let roomStartingPreference = 'X';
let localStats = loadGameStats();
let roomStats = createEmptyStats();
let moveHistory = [];
let roundRecorded = false;
let chatMessages = [];
let previousPresenceMembers = new Map();
let hasSyncedRoomPresence = false;
let joinAlertTimeout;

const vertexShaderSource = `#version 300 es
in vec2 a_position;
uniform vec2 u_resolution;

void main() {
  vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 outColor;

void main() {
  outColor = u_color;
}`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || 'Não foi possível preparar o WebGL 2.0.');
  }

  return shader;
}

function initializeRenderer() {
  gl = canvas.getContext('webgl2', { alpha: true, antialias: true });
  if (!gl) return false;

  try {
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Não foi possível iniciar o WebGL 2.0.');
    }

    const positionAttribute = gl.getAttribLocation(program, 'a_position');
    resolutionUniform = gl.getUniformLocation(program, 'u_resolution');
    colorUniform = gl.getUniformLocation(program, 'u_color');
    vertexBuffer = gl.createBuffer();

    const vertexArray = gl.createVertexArray();
    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.enableVertexAttribArray(positionAttribute);
    gl.vertexAttribPointer(positionAttribute, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  } catch (error) {
    console.error('Falha ao iniciar o WebGL 2.0:', error);
    return false;
  }
}

function colorFromCss(variableName) {
  const value = getComputedStyle(document.body).getPropertyValue(variableName).trim();
  const hex = value.replace('#', '');
  const expanded = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  const number = Number.parseInt(expanded, 16);

  return [
    ((number >> 16) & 255) / 255,
    ((number >> 8) & 255) / 255,
    (number & 255) / 255,
    1
  ];
}

function appendSegment(vertices, x1, y1, x2, y2, thickness, rounded = false) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const halfWidth = thickness / 2;
  const offsetX = (-dy / length) * halfWidth;
  const offsetY = (dx / length) * halfWidth;
  const a = [x1 + offsetX, y1 + offsetY];
  const b = [x1 - offsetX, y1 - offsetY];
  const c = [x2 + offsetX, y2 + offsetY];
  const d = [x2 - offsetX, y2 - offsetY];
  vertices.push(...a, ...b, ...c, ...c, ...b, ...d);

  if (rounded) {
    appendCircle(vertices, x1, y1, halfWidth, 12);
    appendCircle(vertices, x2, y2, halfWidth, 12);
  }
}

function appendCircle(vertices, centerX, centerY, radius, segments) {
  for (let index = 0; index < segments; index += 1) {
    const start = (index / segments) * Math.PI * 2;
    const end = ((index + 1) / segments) * Math.PI * 2;
    vertices.push(
      centerX, centerY,
      centerX + Math.cos(start) * radius, centerY + Math.sin(start) * radius,
      centerX + Math.cos(end) * radius, centerY + Math.sin(end) * radius
    );
  }
}

function appendRing(vertices, centerX, centerY, radius, thickness, segments = 56) {
  const innerRadius = radius - thickness / 2;
  const outerRadius = radius + thickness / 2;

  for (let index = 0; index < segments; index += 1) {
    const start = (index / segments) * Math.PI * 2;
    const end = ((index + 1) / segments) * Math.PI * 2;
    const innerStart = [centerX + Math.cos(start) * innerRadius, centerY + Math.sin(start) * innerRadius];
    const outerStart = [centerX + Math.cos(start) * outerRadius, centerY + Math.sin(start) * outerRadius];
    const innerEnd = [centerX + Math.cos(end) * innerRadius, centerY + Math.sin(end) * innerRadius];
    const outerEnd = [centerX + Math.cos(end) * outerRadius, centerY + Math.sin(end) * outerRadius];
    vertices.push(...innerStart, ...outerStart, ...innerEnd, ...innerEnd, ...outerStart, ...outerEnd);
  }
}

function drawGeometry(vertices, color) {
  if (!vertices.length) return;
  gl.uniform4fv(colorUniform, color);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
}

function renderBoard() {
  if (!gl || !program || !board) return;

  const width = boardElement.clientWidth;
  const height = boardElement.clientHeight;
  if (!width || !height) return;

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.uniform2f(resolutionUniform, width, height);

  const markThickness = Math.max(5, width * 0.03);
  board.forEach((mark, index) => {
    if (!mark) return;

    const row = Math.floor(index / 3);
    const column = index % 3;
    const centerX = (column + 0.5) * (width / 3);
    const centerY = (row + 0.5) * (height / 3);
    const markSize = width * 0.145;

    if (mark === 'X') {
      const cross = [];
      appendSegment(cross, centerX - markSize, centerY - markSize, centerX + markSize, centerY + markSize, markThickness, true);
      appendSegment(cross, centerX + markSize, centerY - markSize, centerX - markSize, centerY + markSize, markThickness, true);
      const glow = [];
      appendSegment(glow, centerX - markSize, centerY - markSize, centerX + markSize, centerY + markSize, markThickness * 2.2, true);
      appendSegment(glow, centerX + markSize, centerY - markSize, centerX - markSize, centerY + markSize, markThickness * 2.2, true);
      const markColor = colorFromCss('--x-color');
      drawGeometry(glow, [...markColor.slice(0, 3), 0.14]);
      drawGeometry(cross, markColor);
    } else {
      const ring = [];
      appendRing(ring, centerX, centerY, markSize, markThickness);
      const glow = [];
      appendRing(glow, centerX, centerY, markSize, markThickness * 2.2);
      const markColor = colorFromCss('--o-color');
      drawGeometry(glow, [...markColor.slice(0, 3), 0.14]);
      drawGeometry(ring, markColor);
    }
  });
}

function resizeCanvas() {
  if (!gl) return;
  const rect = boardElement.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  gl.viewport(0, 0, canvas.width, canvas.height);
  renderBoard();
}

function updateCellButtons() {
  const onlineTurnBlocked = modeSelect.value === 'online'
    && (!onlineConnected || onlinePlayerCount < 2 || onlineSpectator || onlineSymbol !== currentPlayer);

  cells.forEach((cell, index) => {
    const value = board[index];
    cell.setAttribute('aria-label', value ? `Casa ${index + 1}, ${value}` : `Casa ${index + 1}, vazia`);
    cell.disabled = !gl || gameOver || aiThinking || Boolean(value) || onlineTurnBlocked
      || (modeSelect.value === 'ai' && currentPlayer !== human);
  });
}

function playSound(sound) {
  sound.currentTime = 0;
  const playback = sound.play();
  if (playback) playback.catch(() => {});
}

function oppositeSymbol(symbol) {
  return symbol === 'X' ? 'O' : 'X';
}

function isWinner(position, symbol) {
  return winCombos.some((combo) => combo.every((index) => position[index] === symbol));
}

function isTie(position) {
  return position.every(Boolean);
}

function getOnlinePlayerId() {
  let playerId = sessionStorage.getItem('tic-tac-toe-player-id');
  if (!playerId) {
    playerId = window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    sessionStorage.setItem('tic-tac-toe-player-id', playerId);
  }
  return playerId;
}

function loadSavedPlayerName() {
  try {
    return localStorage.getItem('tic-tac-toe-player-name') || ('Jogador ' + Math.floor(1000 + Math.random() * 9000));
  } catch (error) {
    return 'Jogador ' + Math.floor(1000 + Math.random() * 9000);
  }
}

function applyPlayerName() {
  const cleanedName = String(playerNameInput.value || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  playerName = cleanedName || playerName || ('Jogador ' + Math.floor(1000 + Math.random() * 9000));
  playerNameInput.value = playerName;
  try {
    localStorage.setItem('tic-tac-toe-player-name', playerName);
  } catch (error) {
    console.warn('Não foi possível guardar seu nome neste navegador:', error);
  }
}

function resolveStartingSymbol(preference = starterSelect.value) {
  if (preference === 'random') return Math.random() < 0.5 ? 'X' : 'O';
  return preference === 'O' ? 'O' : 'X';
}

function updateSetupControls() {
  const isOnline = modeSelect.value === 'online';
  const isAiMode = modeSelect.value === 'ai';
  playerNameField.hidden = !isOnline;
  symbolField.hidden = !isAiMode;
  difficultyField.hidden = !isAiMode;
  starterField.hidden = false;
  onlineLobby.hidden = !isOnline;
  localSetupActions.hidden = isOnline;
}

function showGameScreen() {
  setupScreen.hidden = true;
  gameScreen.hidden = false;
  window.requestAnimationFrame(() => {
    resizeCanvas();
    renderBoard();
  });
}

async function returnToSetup() {
  window.clearTimeout(aiMoveTimeout);
  aiMoveTimeout = undefined;
  if (onlineChannel) await closeOnlineRoom();
  chatPanel.hidden = true;
  onlinePlayersPanel.hidden = true;
  playerJoinAlert.hidden = true;
  gameScreen.hidden = true;
  setupScreen.hidden = false;
  updateSetupControls();
  if (modeSelect.value === 'online') {
    connectionStatus.textContent = 'Você saiu da sala. Crie outra ou entre com um código.';
    roomCodeInput.value = '';
  }
  statusElement.textContent = 'Configure a partida para começar.';
  board = Array(9).fill('');
  moveHistory = [];
  roundRecorded = false;
  gameOver = false;
  updateCellButtons();
  renderGameInsights();
}

function createEmptyStats() {
  return { total: 0, scores: { X: 0, O: 0, draws: 0 }, history: [] };
}

function normalizeStats(value) {
  const empty = createEmptyStats();
  if (!value || typeof value !== 'object') return empty;

  const scores = value.scores || {};
  const history = Array.isArray(value.history) ? value.history : [];
  return {
    total: Math.max(0, Number.parseInt(value.total, 10) || history.length),
    scores: {
      X: Math.max(0, Number.parseInt(scores.X, 10) || 0),
      O: Math.max(0, Number.parseInt(scores.O, 10) || 0),
      draws: Math.max(0, Number.parseInt(scores.draws, 10) || 0)
    },
    history: history.slice(0, 12).filter((entry) => entry && typeof entry === 'object').map((entry) => ({
      winner: entry.winner === 'X' || entry.winner === 'O' ? entry.winner : '',
      mode: ['ai', 'local', 'online'].includes(entry.mode) ? entry.mode : 'local',
      humanSymbol: entry.humanSymbol === 'O' ? 'O' : 'X',
      playedAt: String(entry.playedAt || ''),
      moves: Math.max(0, Number.parseInt(entry.moves, 10) || 0),
      round: Math.max(0, Number.parseInt(entry.round, 10) || 0)
    }))
  };
}

function loadGameStats() {
  try {
    return normalizeStats(JSON.parse(localStorage.getItem('tic-tac-toe-stats-v1') || 'null'));
  } catch (error) {
    return createEmptyStats();
  }
}

function saveLocalStats() {
  try {
    localStorage.setItem('tic-tac-toe-stats-v1', JSON.stringify(localStats));
  } catch (error) {
    console.warn('Não foi possível guardar o placar neste dispositivo:', error);
  }
}

function activeStats() {
  return modeSelect.value === 'online' ? roomStats : localStats;
}

function getModeLabel(mode) {
  if (mode === 'ai') return 'Contra a IA';
  if (mode === 'online') return 'Online';
  return 'Dois jogadores';
}

function getHistoryResult(entry) {
  if (!entry.winner) return 'Empate';
  if (entry.mode === 'ai') return entry.winner === entry.humanSymbol ? 'Você venceu' : 'IA venceu';
  return entry.mode === 'online' ? 'Jogador ' + entry.winner + ' venceu' : entry.winner + ' venceu';
}

function renderGameInsights() {
  const stats = activeStats();
  scoreXElement.textContent = String(stats.scores.X);
  scoreOElement.textContent = String(stats.scores.O);
  scoreDrawsElement.textContent = String(stats.scores.draws);
  roundCountElement.textContent = stats.total + (stats.total === 1 ? ' partida' : ' partidas');

  moveHistoryElement.replaceChildren();
  moveHistory.forEach((move) => {
    const item = document.createElement('li');
    item.textContent = move.symbol + ' jogou na casa ' + (move.index + 1);
    moveHistoryElement.append(item);
  });

  matchHistoryElement.replaceChildren();
  stats.history.forEach((entry) => {
    const item = document.createElement('li');
    const result = document.createElement('span');
    result.className = 'match-result';
    result.textContent = getHistoryResult(entry);
    const details = document.createElement('span');
    details.className = 'match-details';
    const playedAt = entry.playedAt ? new Date(entry.playedAt) : null;
    const dateLabel = playedAt && !Number.isNaN(playedAt.getTime())
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(playedAt)
      : '';
    details.textContent = getModeLabel(entry.mode) + ' · ' + entry.moves + ' jogadas' + (dateLabel ? ' · ' + dateLabel : '');
    item.append(result, details);
    matchHistoryElement.append(item);
  });

  resetStatsButton.disabled = modeSelect.value === 'online'
    && (!onlineConnected || onlinePlayerCount < 2 || onlineSpectator);
}

function recordGameResult() {
  if (roundRecorded) return;
  roundRecorded = true;

  const winner = isWinner(board, 'X') ? 'X' : (isWinner(board, 'O') ? 'O' : '');
  const stats = activeStats();
  if (winner) stats.scores[winner] += 1;
  else stats.scores.draws += 1;
  stats.total += 1;
  stats.history.unshift({
    winner,
    mode: modeSelect.value,
    humanSymbol: human,
    playedAt: new Date().toISOString(),
    moves: moveHistory.length,
    round: stats.total
  });
  stats.history = stats.history.slice(0, 12);

  if (modeSelect.value === 'online') {
    roomStats = normalizeStats(stats);
  } else {
    localStats = normalizeStats(stats);
    saveLocalStats();
  }
  renderGameInsights();
}

async function resetGameStats() {
  if (modeSelect.value === 'online') {
    if (!onlineConnected || onlinePlayerCount < 2 || onlineSpectator) return;
    roomStats = createEmptyStats();
    onlineGameRevision += 1;
    saveOnlineSnapshot();
    renderGameInsights();
    await sendOnlineState();
    return;
  }

  localStats = createEmptyStats();
  saveLocalStats();
  renderGameInsights();
}

function enterOnlineMode() {
  updateSetupControls();

  if (!onlineChannel) {
    board = Array(9).fill('');
    currentPlayer = resolveStartingSymbol(starterSelect.value);
    gameOver = false;
    moveHistory = [];
    roundRecorded = false;
    statusElement.textContent = 'Configure seu nome e crie ou encontre uma sala.';
  }

  updateCellButtons();
  renderBoard();
  renderGameInsights();
}

function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomValues = new Uint8Array(12);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(randomValues);
  } else {
    for (let index = 0; index < randomValues.length; index += 1) {
      randomValues[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
}

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const config = window.SUPABASE_CONFIG || {};
  const projectUrl = String(config.url || '').trim();
  const publicKey = String(config.publishableKey || '').trim();

  if (!projectUrl || !publicKey || projectUrl.includes('seu-projeto')) {
    throw new Error('Configure a Project URL e a chave pública em supabase-config.js.');
  }

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabaseClient = createClient(projectUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } }
  });
  return supabaseClient;
}

async function ensureOnlineLobby(client) {
  if (onlineLobbyConnected && onlineLobbyChannel) return onlineLobbyChannel;
  if (onlineLobbyConnectionPromise) return onlineLobbyConnectionPromise;

  onlineLobbyConnectionPromise = new Promise((resolve, reject) => {
    const channel = client.channel('tic-tac-toe:lobby:v1', {
      config: { presence: { key: onlinePlayerId } }
    });
    onlineLobbyChannel = channel;
    channel
      .on('presence', { event: 'sync' }, renderAvailableRooms)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          onlineLobbyConnected = true;
          try {
            await channel.track({
              playerId: onlinePlayerId,
              roomCode: currentLobbyRoomCode,
              hostId: currentLobbyHostId,
              status: currentLobbyStatus,
              createdAt: currentLobbyCreatedAt || Date.now()
            });
            renderAvailableRooms();
            resolve(channel);
          } catch (error) {
            reject(error);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          onlineLobbyConnected = false;
          reject(new Error('Não foi possível carregar as salas. Confira o Realtime do Supabase.'));
        }
      });
  });

  try {
    return await onlineLobbyConnectionPromise;
  } finally {
    onlineLobbyConnectionPromise = null;
  }
}

async function updateLobbyPresence(roomCode, status, hostId = '', createdAt = 0) {
  const previousState = [currentLobbyRoomCode, currentLobbyStatus, currentLobbyHostId].join('|');
  currentLobbyRoomCode = roomCode || '';
  currentLobbyStatus = status || 'idle';
  currentLobbyHostId = hostId || '';
  if (createdAt) currentLobbyCreatedAt = createdAt;
  if (currentLobbyStatus === 'waiting' && !currentLobbyCreatedAt) currentLobbyCreatedAt = Date.now();
  if (!currentLobbyRoomCode && currentLobbyStatus === 'idle') currentLobbyCreatedAt = 0;
  const currentState = [currentLobbyRoomCode, currentLobbyStatus, currentLobbyHostId].join('|');
  if (previousState === currentState || !onlineLobbyChannel || !onlineLobbyConnected) return;

  try {
    await onlineLobbyChannel.track({
      playerId: onlinePlayerId,
      roomCode: currentLobbyRoomCode,
      hostId: currentLobbyHostId,
      status: currentLobbyStatus,
      createdAt: currentLobbyCreatedAt || Date.now()
    });
  } catch (error) {
    console.warn('Não foi possível atualizar a lista de salas:', error);
  }
}

function renderAvailableRooms() {
  if (roomListContainer.hidden) return;

  roomList.replaceChildren();
  if (!onlineLobbyConnected || !onlineLobbyChannel) {
    roomListMessage.textContent = 'Conectando à lista de salas…';
    return;
  }

  const presence = onlineLobbyChannel.presenceState();
  const roomsByCode = new Map();
  Object.entries(presence).forEach(([id, values]) => {
    const metadata = Array.isArray(values) ? values[0] : null;
    if (!metadata || metadata.status !== 'waiting' || !metadata.roomCode || id === onlinePlayerId) return;
    if (!roomsByCode.has(metadata.roomCode)) {
      roomsByCode.set(metadata.roomCode, {
        code: metadata.roomCode,
        hostId: metadata.hostId || id,
        createdAt: Number(metadata.createdAt) || 0
      });
    }
  });

  const rooms = [...roomsByCode.values()].sort((left, right) => left.createdAt - right.createdAt);
  if (!rooms.length) {
    roomListMessage.textContent = 'Nenhuma sala aberta agora. Você pode criar uma e aguardar alguém.';
    return;
  }

  roomListMessage.textContent = 'Salas aguardando um jogador:';
  rooms.forEach((room) => {
    const item = document.createElement('li');
    item.className = 'room-list-item';

    const details = document.createElement('div');
    details.className = 'room-list-details';
    const code = document.createElement('span');
    code.className = 'room-list-code';
    code.textContent = 'Sala ' + room.code;
    const age = document.createElement('span');
    age.className = 'room-list-age';
    age.textContent = 'Aguardando jogador';
    details.append(code, age);

    const joinButton = document.createElement('button');
    joinButton.className = 'lobby-button';
    joinButton.type = 'button';
    joinButton.textContent = 'Entrar';
    joinButton.addEventListener('click', () => {
      roomCodeInput.value = room.code;
      void connectToOnlineRoom(room.code, room.hostId, false);
    });

    item.append(details, joinButton);
    roomList.append(item);
  });
}

async function findOnlineRooms() {
  roomListContainer.hidden = false;
  roomListMessage.textContent = 'Conectando à lista de salas…';
  roomList.replaceChildren();
  findRoomsButton.disabled = true;
  try {
    const client = await getSupabaseClient();
    await ensureOnlineLobby(client);
    renderAvailableRooms();
  } catch (error) {
    roomListMessage.textContent = error.message || 'Não foi possível procurar salas.';
  } finally {
    findRoomsButton.disabled = false;
  }
}

function getOnlineMembers() {
  if (!onlineChannel) return [];

  const presence = onlineChannel.presenceState();
  return Object.entries(presence).map(([id, values]) => {
    const metadata = Array.isArray(values) ? values[0] : {};
    return {
      id,
      name: String(metadata && metadata.name || '').slice(0, 20),
      joinedAt: Number(metadata && metadata.joinedAt) || 0
    };
  }).sort((left, right) => left.joinedAt - right.joinedAt || left.id.localeCompare(right.id));
}

function createMessageId() {
  return window.crypto && typeof window.crypto.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function normalizeChatMessage(message) {
  if (!message || typeof message !== 'object' || !message.id) return null;
  const isSystem = message.type === 'system';
  const text = String(message.text || '').trim().slice(0, 300);
  if (!text) return null;
  return {
    id: String(message.id).slice(0, 80),
    type: isSystem ? 'system' : 'chat',
    senderId: String(message.senderId || '').slice(0, 80),
    senderName: String(message.senderName || 'Jogador').replace(/\s+/g, ' ').trim().slice(0, 20),
    symbol: message.symbol === 'O' ? 'O' : (message.symbol === 'X' ? 'X' : ''),
    text,
    sentAt: String(message.sentAt || new Date().toISOString())
  };
}

function mergeChatMessages(incoming = []) {
  const messagesById = new Map();
  [...chatMessages, ...(Array.isArray(incoming) ? incoming : [])].forEach((rawMessage) => {
    const message = normalizeChatMessage(rawMessage);
    if (message) messagesById.set(message.id, message);
  });
  chatMessages = [...messagesById.values()]
    .sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime())
    .slice(-60);
  renderChat();
}

function renderChat() {
  const inOnlineRoom = modeSelect.value === 'online' && Boolean(onlineRoomCode);
  chatPanel.hidden = !inOnlineRoom;
  chatMessagesElement.replaceChildren();

  if (!chatMessages.length) {
    const empty = document.createElement('li');
    empty.className = 'chat-empty';
    empty.textContent = 'A conversa começa quando alguém enviar uma mensagem.';
    chatMessagesElement.append(empty);
  } else {
    chatMessages.forEach((message) => {
      const item = document.createElement('li');
      if (message.type === 'system') {
        item.className = 'chat-message system-message';
        item.textContent = message.text;
        chatMessagesElement.append(item);
        return;
      }

      const isSelf = message.senderId === onlinePlayerId;
      item.className = 'chat-message chat-message-' + (message.symbol || 'x').toLowerCase()
        + (isSelf ? ' from-self' : '');
      const meta = document.createElement('div');
      meta.className = 'chat-message-meta';
      const name = document.createElement('span');
      name.className = 'chat-message-name';
      name.textContent = (isSelf ? 'Você' : message.senderName) + (message.symbol ? ' · ' + message.symbol : '');
      const time = document.createElement('time');
      time.className = 'chat-message-time';
      const sentAt = new Date(message.sentAt);
      if (!Number.isNaN(sentAt.getTime())) {
        time.dateTime = sentAt.toISOString();
        time.textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(sentAt);
      }
      meta.append(name, time);

      const bubble = document.createElement('span');
      bubble.className = 'chat-message-bubble';
      bubble.textContent = message.text;
      item.append(meta, bubble);
      chatMessagesElement.append(item);
    });
  }

  const canChat = onlineConnected && onlinePlayerCount >= 2 && !onlineSpectator;
  chatInput.disabled = !canChat;
  sendChatButton.disabled = !canChat;
  chatHint.textContent = onlineSpectator
    ? 'O chat está disponível apenas para os dois jogadores.'
    : (canChat ? 'Conversa da sala em tempo real.' : 'Entre na sala com dois jogadores para conversar.');
  chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
}

function addSystemMessage(messageText, { announce = false } = {}) {
  const message = normalizeChatMessage({
    id: createMessageId(),
    type: 'system',
    text: messageText,
    sentAt: new Date().toISOString()
  });
  if (!message) return;
  mergeChatMessages([message]);
  saveOnlineSnapshot();
  if (announce && onlineChannel && onlineConnected) {
    void onlineChannel.send({
      type: 'broadcast',
      event: 'room-notice',
      payload: { room: onlineRoomCode, senderId: onlinePlayerId, message }
    });
  }
}

function showPlayerJoinAlert(name) {
  playerJoinAlertText.textContent = name + ' entrou na sala!';
  playerJoinAlert.hidden = false;
  window.clearTimeout(joinAlertTimeout);
  joinAlertTimeout = window.setTimeout(() => { playerJoinAlert.hidden = true; }, 6500);
}

function receiveRoomNotice(payload) {
  if (!payload || payload.room !== onlineRoomCode || payload.senderId === onlinePlayerId) return;
  const message = normalizeChatMessage(payload.message);
  if (!message) return;
  mergeChatMessages([message]);
  saveOnlineSnapshot();
  if (payload.kind === 'player-joined') showPlayerJoinAlert(message.text.replace(/ entrou na sala!?$/, ''));
}

function announcePlayerJoined(member) {
  const name = member.name || 'Novo jogador';
  const message = normalizeChatMessage({
    id: createMessageId(),
    type: 'system',
    text: name + ' entrou na sala!',
    sentAt: new Date().toISOString()
  });
  mergeChatMessages([message]);
  saveOnlineSnapshot();
  showPlayerJoinAlert(name);
  if (onlineChannel && onlineConnected) {
    void onlineChannel.send({
      type: 'broadcast',
      event: 'room-notice',
      payload: { room: onlineRoomCode, senderId: onlinePlayerId, kind: 'player-joined', message }
    });
  }
}

function renderOnlinePlayers(members = getOnlineMembers()) {
  const inOnlineRoom = modeSelect.value === 'online' && Boolean(onlineRoomCode);
  onlinePlayersPanel.hidden = !inOnlineRoom;
  chatPanel.hidden = !inOnlineRoom;
  roomBadge.textContent = onlineRoomCode ? 'SALA ' + onlineRoomCode : '';
  if (!inOnlineRoom) return;

  const hostId = onlineHostId || members[0]?.id || '';
  const xPlayer = members.find((member) => member.id === hostId);
  const oPlayer = members.find((member) => member.id !== hostId);
  playerCards.replaceChildren();

  [
    { symbol: 'X', player: xPlayer },
    { symbol: 'O', player: oPlayer }
  ].forEach(({ symbol, player }) => {
    const isSelf = Boolean((player && player.id === onlinePlayerId)
      || (!player && !onlineSpectator && onlineSymbol === symbol));
    const card = document.createElement('div');
    card.className = 'player-card player-' + symbol.toLowerCase();
    const badge = document.createElement('span');
    badge.className = 'player-symbol';
    badge.textContent = symbol;
    const details = document.createElement('div');
    details.className = 'player-card-details';
    const name = document.createElement('span');
    name.className = 'player-card-name';
    name.textContent = player && player.name ? player.name : (isSelf ? playerName : (symbol === 'X' ? 'Anfitrião' : 'Aguardando jogador'));
    const state = document.createElement('span');
    state.className = 'player-card-status';
    state.textContent = player
      ? (isSelf ? 'Você · conectado' : 'Conectado')
      : (isSelf && onlineConnected ? 'Conectando…' : 'Aguardando');
    details.append(name, state);
    card.append(badge, details);
    playerCards.append(card);
  });
}

async function sendChatMessage(event) {
  event.preventDefault();
  const text = chatInput.value.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text || !onlineConnected || onlinePlayerCount < 2 || onlineSpectator || !onlineChannel) return;

  const message = normalizeChatMessage({
    id: createMessageId(),
    senderId: onlinePlayerId,
    senderName: playerName,
    symbol: onlineSymbol,
    text,
    sentAt: new Date().toISOString()
  });
  mergeChatMessages([message]);
  chatInput.value = '';
  saveOnlineSnapshot();

  try {
    const result = await onlineChannel.send({
      type: 'broadcast',
      event: 'chat-message',
      payload: { room: onlineRoomCode, message }
    });
    if (result !== 'ok') chatHint.textContent = 'Mensagem não enviada. Verifique sua conexão.';
  } catch (error) {
    chatHint.textContent = 'Mensagem não enviada. Verifique sua conexão.';
  }
}

function receiveChatMessage(payload) {
  if (!payload || payload.room !== onlineRoomCode) return;
  const message = normalizeChatMessage(payload.message);
  if (!message || message.senderId === onlinePlayerId) return;
  mergeChatMessages([message]);
  saveOnlineSnapshot();
}

function updateOnlineStatus() {
  if (modeSelect.value !== 'online') return;

  if (gameOver) {
    const winner = isWinner(board, 'X') ? 'X' : (isWinner(board, 'O') ? 'O' : '');
    connectionStatus.textContent = winner ? 'Jogador ' + winner + ' venceu!' : 'Empate!';
    statusElement.textContent = connectionStatus.textContent;
    renderOnlinePlayers();
    renderChat();
    updateCellButtons();
    return;
  }

  if (onlineSpectator) {
    connectionStatus.textContent = 'Esta sala já tem dois jogadores. Você está acompanhando como espectador.';
  } else if (!onlineConnected) {
    connectionStatus.textContent = onlineRoomCode ? 'Conectando à sala…' : 'Crie uma sala ou entre com o código de um amigo.';
  } else if (onlinePlayerCount < 2) {
    connectionStatus.textContent = onlineSymbol === 'X'
      ? 'Sala criada. Compartilhe o link e aguarde o outro jogador.'
      : 'Aguardando o criador da sala entrar.';
  } else if (!onlineSymbol) {
    connectionStatus.textContent = 'Definindo os jogadores…';
  } else if (onlineSymbol === currentPlayer) {
    connectionStatus.textContent = 'Conectado como ' + onlineSymbol + '. Sua vez.';
  } else {
    connectionStatus.textContent = 'Conectado como ' + onlineSymbol + '. Vez do adversário (' + currentPlayer + ').';
  }

  if (!onlineConnected) {
    leaveRoomButton.hidden = !onlineRoomCode;
  }
  statusElement.textContent = connectionStatus.textContent;
  renderOnlinePlayers();
  renderChat();
  updateCellButtons();
}

function updateOnlinePresence() {
  if (!onlineChannel) return;

  const members = getOnlineMembers();
  const memberIds = members.map((member) => member.id);
  const wasFirstSync = !hasSyncedRoomPresence;
  const newlyJoinedMember = !wasFirstSync && onlineSymbol === 'X'
    ? members.find((member) => member.id !== onlinePlayerId && !previousPresenceMembers.has(member.id))
    : null;
  onlinePlayerCount = members.length;
  onlineSpectator = members.length > 2 || (members.length > 0 && !memberIds.includes(onlinePlayerId));

  if (!onlineHostId && members.length >= 2) {
    onlineHostId = members[0].id;
  }

  if (onlineHostId) {
    onlineSymbol = onlinePlayerId === onlineHostId ? 'X' : 'O';
  } else if (members.length >= 2) {
    onlineSymbol = members[0].id === onlinePlayerId ? 'X' : 'O';
  } else {
    onlineSymbol = '';
  }

  previousPresenceMembers = new Map(members.map((member) => [member.id, member]));
  hasSyncedRoomPresence = true;

  if (onlineRoomCode && onlinePlayerCount >= 2 && !roomShare.hidden && onlineHostId) {
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set('room', onlineRoomCode);
    inviteUrl.searchParams.set('host', onlineHostId);
    roomLinkInput.value = inviteUrl.toString();
  }

  updateOnlineStatus();
  if (newlyJoinedMember) announcePlayerJoined(newlyJoinedMember);
  if (onlineSpectator) {
    void updateLobbyPresence('', 'idle');
  } else if (onlineSymbol === 'X') {
    void updateLobbyPresence(onlineRoomCode, onlinePlayerCount >= 2 ? 'playing' : 'waiting', onlineHostId);
  } else if (onlineSymbol === 'O') {
    void updateLobbyPresence('', 'in-room', onlineHostId);
  }

  if (onlinePlayerCount >= 2 && onlineSymbol === 'X') {
    void sendOnlineState();
  } else if (onlinePlayerCount >= 2 && onlineSymbol === 'O') {
    void onlineChannel.send({
      type: 'broadcast',
      event: 'request-state',
      payload: { room: onlineRoomCode, senderId: onlinePlayerId }
    });
  }
}

function getOnlineSnapshot() {
  return {
    room: onlineRoomCode,
    senderId: onlinePlayerId,
    board: [...board],
    currentPlayer,
    revision: onlineGameRevision,
    moves: [...moveHistory],
    stats: roomStats,
    roundRecorded,
    startingPreference: roomStartingPreference,
    chatMessages: [...chatMessages]
  };
}

function saveOnlineSnapshot() {
  if (!onlineRoomCode) return;
  try {
    localStorage.setItem('tic-tac-toe-room-' + onlineRoomCode, JSON.stringify(getOnlineSnapshot()));
  } catch (error) {
    console.warn('Não foi possível guardar a partida neste dispositivo:', error);
  }
}

function restoreOnlineSnapshot() {
  if (!onlineRoomCode) return false;
  try {
    const saved = JSON.parse(localStorage.getItem('tic-tac-toe-room-' + onlineRoomCode) || 'null');
    if (!saved || !Array.isArray(saved.board) || saved.board.length !== 9) return false;
    if (!saved.board.every((mark) => mark === '' || mark === 'X' || mark === 'O')) return false;
    if (saved.currentPlayer !== 'X' && saved.currentPlayer !== 'O') return false;

    board = [...saved.board];
    currentPlayer = saved.currentPlayer;
    onlineGameRevision = Number(saved.revision) || 0;
    gameOver = isWinner(board, 'X') || isWinner(board, 'O') || isTie(board);
    moveHistory = Array.isArray(saved.moves)
      ? saved.moves.filter((move) => move && (move.symbol === 'X' || move.symbol === 'O')
        && Number.isInteger(move.index) && move.index >= 0 && move.index < 9)
        .map((move) => ({ symbol: move.symbol, index: move.index }))
      : [];
    roomStats = normalizeStats(saved.stats);
    roundRecorded = Boolean(saved.roundRecorded) || gameOver;
    roomStartingPreference = ['X', 'O', 'random'].includes(saved.startingPreference)
      ? saved.startingPreference
      : 'X';
    chatMessages = [];
    mergeChatMessages(saved.chatMessages);
    renderGameInsights();
    return true;
  } catch (error) {
    return false;
  }
}

async function sendOnlineState() {
  if (!onlineChannel || !onlineConnected || !onlineRoomCode) return;
  try {
    const result = await onlineChannel.send({
      type: 'broadcast',
      event: 'game-state',
      payload: getOnlineSnapshot()
    });
    if (result === 'ok') return;
    connectionStatus.textContent = 'A jogada não foi enviada. Verifique sua conexão e tente novamente.';
    statusElement.textContent = connectionStatus.textContent;
  } catch (error) {
    connectionStatus.textContent = 'A jogada não foi enviada. Verifique sua conexão e tente novamente.';
    statusElement.textContent = connectionStatus.textContent;
  }
}

function receiveOnlineState(payload) {
  if (!payload || payload.room !== onlineRoomCode || payload.senderId === onlinePlayerId) return;
  if (!Array.isArray(payload.board) || payload.board.length !== 9) return;
  if (!payload.board.every((mark) => mark === '' || mark === 'X' || mark === 'O')) return;
  if (payload.currentPlayer !== 'X' && payload.currentPlayer !== 'O') return;
  if (Number(payload.revision) < onlineGameRevision) return;

  board = [...payload.board];
  currentPlayer = payload.currentPlayer;
  onlineGameRevision = Number(payload.revision) || 0;
  moveHistory = Array.isArray(payload.moves)
    ? payload.moves.filter((move) => move && (move.symbol === 'X' || move.symbol === 'O')
      && Number.isInteger(move.index) && move.index >= 0 && move.index < 9)
      .map((move) => ({ symbol: move.symbol, index: move.index }))
    : [];
  roomStats = normalizeStats(payload.stats);
  gameOver = isWinner(board, 'X') || isWinner(board, 'O') || isTie(board);
  roundRecorded = Boolean(payload.roundRecorded) || gameOver;
  roomStartingPreference = ['X', 'O', 'random'].includes(payload.startingPreference)
    ? payload.startingPreference
    : roomStartingPreference;
  mergeChatMessages(payload.chatMessages);
  updateOnlineStatus();

  saveOnlineSnapshot();
  renderGameInsights();
  updateCellButtons();
  renderBoard();
}

function updateRoomUrl(roomCode, hostId) {
  const url = new URL(window.location.href);
  if (roomCode) {
    url.searchParams.set('room', roomCode);
    if (hostId) url.searchParams.set('host', hostId);
    else url.searchParams.delete('host');
  } else {
    url.searchParams.delete('room');
    url.searchParams.delete('host');
  }
  window.history.replaceState({}, '', url.toString());
}

async function closeOnlineRoom(clearUrl = true) {
  const oldChannel = onlineChannel;
  await updateLobbyPresence('', 'idle');
  onlineChannel = null;
  if (oldChannel && supabaseClient) {
    await supabaseClient.removeChannel(oldChannel);
  }

  onlineRoomCode = '';
  onlineHostId = '';
  onlineSymbol = '';
  onlinePlayerCount = 0;
  onlineConnected = false;
  onlineSpectator = false;
  onlineGameRevision = 0;
  roomStartingPreference = 'X';
  roomStats = createEmptyStats();
  moveHistory = [];
  roundRecorded = false;
  chatMessages = [];
  previousPresenceMembers = new Map();
  hasSyncedRoomPresence = false;
  window.clearTimeout(joinAlertTimeout);
  roomShare.hidden = true;
  chatPanel.hidden = true;
  onlinePlayersPanel.hidden = true;
  playerJoinAlert.hidden = true;
  leaveRoomButton.hidden = true;
  if (clearUrl) updateRoomUrl('', '');
}

async function connectToOnlineRoom(roomCode, hostId = '', isCreator = false) {
  const normalizedCode = String(roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalizedCode.length < 8 || normalizedCode.length > 16) {
    connectionStatus.textContent = 'Digite um código de sala válido.';
    return;
  }

  applyPlayerName();
  await closeOnlineRoom(false);
  onlineRoomCode = normalizedCode;
  onlineHostId = isCreator ? onlinePlayerId : hostId;
  onlineSymbol = isCreator ? 'X' : '';
  onlinePlayerCount = 0;
  onlineConnected = false;
  onlineSpectator = false;
  onlineGameRevision = 0;
  previousPresenceMembers = new Map();
  hasSyncedRoomPresence = false;
  roomCodeInput.value = normalizedCode;
  leaveRoomButton.hidden = false;
  connectionStatus.textContent = 'Conectando à sala…';
  statusElement.textContent = connectionStatus.textContent;

  if (isCreator) {
    board = Array(9).fill('');
    roomStartingPreference = starterSelect.value;
    currentPlayer = resolveStartingSymbol(roomStartingPreference);
    gameOver = false;
    roomStats = createEmptyStats();
    moveHistory = [];
    roundRecorded = false;
    chatMessages = [];
  } else {
    restoreOnlineSnapshot();
  }
  updateCellButtons();
  renderBoard();
  renderGameInsights();

  try {
    const client = await getSupabaseClient();
    await ensureOnlineLobby(client);
    const channel = client.channel('tic-tac-toe:' + normalizedCode, {
      config: {
        broadcast: { ack: true, self: false },
        presence: { key: onlinePlayerId }
      }
    });
    onlineChannel = channel;

    channel
      .on('broadcast', { event: 'game-state' }, ({ payload }) => receiveOnlineState(payload))
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => receiveChatMessage(payload))
      .on('broadcast', { event: 'room-notice' }, ({ payload }) => receiveRoomNotice(payload))
      .on('broadcast', { event: 'request-state' }, ({ payload }) => {
        if (payload && payload.room === onlineRoomCode && onlineSymbol === 'X') void sendOnlineState();
      })
      .on('presence', { event: 'sync' }, updateOnlinePresence)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          onlineConnected = true;
          await channel.track({ joinedAt: Date.now(), name: playerName });
          leaveRoomButton.hidden = false;
          showGameScreen();
          if (isCreator) {
            roomShare.hidden = false;
            if (!chatMessages.length) addSystemMessage('Sala criada. Compartilhe o convite para começar a conversar.');
            const inviteUrl = new URL(window.location.href);
            inviteUrl.searchParams.set('room', normalizedCode);
            inviteUrl.searchParams.set('host', onlinePlayerId);
            roomLinkInput.value = inviteUrl.toString();
            updateRoomUrl(normalizedCode, onlinePlayerId);
            saveOnlineSnapshot();
          }
          updateOnlinePresence();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          onlineConnected = false;
          connectionStatus.textContent = 'Não foi possível conectar. Confira as configurações de Realtime do Supabase.';
          updateCellButtons();
        }
      });

    if (!isCreator) updateRoomUrl(normalizedCode, hostId);
  } catch (error) {
    console.error('Falha ao conectar à sala online:', error);
    onlineConnected = false;
    connectionStatus.textContent = error.message || 'Não foi possível iniciar a conexão online.';
    statusElement.textContent = connectionStatus.textContent;
    updateCellButtons();
  }
}

async function resetOnlineGame() {
  if (!onlineConnected || onlinePlayerCount < 2 || onlineSpectator) {
    connectionStatus.textContent = 'Aguarde os dois jogadores estarem conectados para reiniciar.';
    return;
  }

  board = Array(9).fill('');
  currentPlayer = resolveStartingSymbol(roomStartingPreference);
  gameOver = false;
  moveHistory = [];
  roundRecorded = false;
  onlineGameRevision += 1;
  statusElement.textContent = '';
  updateOnlineStatus();
  saveOnlineSnapshot();
  updateCellButtons();
  renderBoard();
  await sendOnlineState();
}

function startGame() {
  window.clearTimeout(aiMoveTimeout);
  aiMoveTimeout = undefined;
  resetButton.textContent = 'Nova partida';
  if (!gl || !program) {
    statusElement.textContent = 'WebGL 2.0 não está disponível neste navegador.';
    cells.forEach((cell) => { cell.disabled = true; });
    return;
  }

  board = Array(9).fill('');
  gameOver = false;
  aiThinking = false;
  moveHistory = [];
  roundRecorded = false;
  playerOne = 'X';
  playerTwo = 'O';
  human = symbolSelect.value;
  ai = oppositeSymbol(human);
  currentPlayer = resolveStartingSymbol(starterSelect.value);

  const isAiMode = modeSelect.value === 'ai';
  statusElement.textContent = isAiMode
    ? (currentPlayer === human ? 'Sua vez. Você joga com ' + human + '.' : 'A IA começa com ' + ai + '.')
    : 'Vez de Jogador ' + currentPlayer + '.';

  updateCellButtons();
  renderBoard();
  renderGameInsights();
  showGameScreen();

  if (isAiMode && currentPlayer === ai && gl) {
    scheduleAiMove();
  }
}

function handleCellClick(event) {
  const index = Number(event.currentTarget.dataset.index);
  if (gameOver || aiThinking || board[index] || (modeSelect.value === 'ai' && currentPlayer !== human)) return;

  if (modeSelect.value === 'online') {
    if (!onlineConnected || onlinePlayerCount < 2 || onlineSpectator || onlineSymbol !== currentPlayer) return;
    makeMove(index, currentPlayer);
    if (!gameOver) currentPlayer = oppositeSymbol(currentPlayer);
    onlineGameRevision += 1;
    saveOnlineSnapshot();
    updateOnlineStatus();
    updateCellButtons();
    void sendOnlineState();
    return;
  }

  makeMove(index, currentPlayer);
  if (!gameOver) advanceTurn();
}

function makeMove(index, player) {
  if (index === undefined || index === null || board[index]) return;

  board[index] = player;
  moveHistory.push({ symbol: player, index });
  renderGameInsights();
  playSound(modeSelect.value === 'ai' && player === ai ? sounds.ai : sounds.human);
  updateCellButtons();
  renderBoard();

  if (isWinner(board, player)) {
    gameOver = true;
    if (modeSelect.value === 'local') {
      statusElement.textContent = `${player} venceu!`;
    } else if (modeSelect.value === 'online') {
      statusElement.textContent = `Jogador ${player} venceu!`;
    } else {
      statusElement.textContent = player === human ? 'Você venceu!' : 'A IA venceu.';
    }
    playSound(modeSelect.value === 'ai' && player === ai ? sounds.lose : sounds.win);
  } else if (isTie(board)) {
    gameOver = true;
    statusElement.textContent = 'Empate!';
    playSound(sounds.draw);
  }

  if (gameOver) recordGameResult();

  updateCellButtons();
}

function advanceTurn() {
  currentPlayer = currentPlayer === playerOne ? playerTwo : playerOne;

  if (modeSelect.value === 'online') {
    updateOnlineStatus();
    return;
  }

  if (modeSelect.value === 'ai' && currentPlayer === ai) {
    aiThinking = true;
    statusElement.textContent = 'A IA está pensando…';
    updateCellButtons();
    scheduleAiMove();
    return;
  }

  statusElement.textContent = modeSelect.value === 'ai' ? 'Sua vez.' : `Vez de ${currentPlayer}.`;
  updateCellButtons();
}

function scheduleAiMove() {
  aiThinking = true;
  updateCellButtons();
  aiMoveTimeout = window.setTimeout(() => {
    aiMoveTimeout = undefined;
    if (gameOver || modeSelect.value !== 'ai') return;

    const move = chooseAiMove();
    aiThinking = false;
    makeMove(move, ai);

    if (!gameOver) {
      currentPlayer = human;
      statusElement.textContent = 'Sua vez.';
      updateCellButtons();
    }
  }, 260);
}

function chooseAiMove() {
  const difficulty = difficultySelect.value;
  if (difficulty === 'easy') return randomMove(board);
  if (difficulty === 'medium' && Math.random() < 0.5) return randomMove(board);
  return minimax(board, ai, 0, -Infinity, Infinity).index;
}

function randomMove(position) {
  const available = position.map((value, index) => value ? null : index).filter((index) => index !== null);
  return available[Math.floor(Math.random() * available.length)];
}

function minimax(position, player, depth, alpha, beta) {
  if (isWinner(position, ai)) return { score: 10 - depth };
  if (isWinner(position, human)) return { score: depth - 10 };

  const available = position.map((value, index) => value ? null : index).filter((index) => index !== null);
  if (!available.length) return { score: 0 };

  let bestMove;

  if (player === ai) {
    let bestScore = -Infinity;
    for (const index of available) {
      position[index] = player;
      const score = minimax(position, human, depth + 1, alpha, beta).score;
      position[index] = '';

      if (score > bestScore) {
        bestScore = score;
        bestMove = index;
      }
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return { index: bestMove, score: bestScore };
  }

  let bestScore = Infinity;
  for (const index of available) {
    position[index] = player;
    const score = minimax(position, ai, depth + 1, alpha, beta).score;
    position[index] = '';

    if (score < bestScore) {
      bestScore = score;
      bestMove = index;
    }
    beta = Math.min(beta, score);
    if (beta <= alpha) break;
  }
  return { index: bestMove, score: bestScore };
}

function updateTheme() {
  const isDark = document.body.classList.toggle('dark');
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.textContent = isDark ? 'Tema claro' : 'Tema escuro';
  document.querySelector('meta[name="theme-color"]').content = isDark ? '#080914' : '#f4f3fb';
  renderBoard();
}

cells.forEach((cell) => cell.addEventListener('click', handleCellClick));
resetStatsButton.addEventListener('click', () => {
  void resetGameStats();
});
resetButton.addEventListener('click', () => {
  if (modeSelect.value === 'online') {
    void resetOnlineGame();
  } else {
    startGame();
  }
});
startGameButton.addEventListener('click', () => {
  startGame();
});
backToMenuButton.addEventListener('click', () => {
  void returnToSetup();
});
themeToggle.addEventListener('click', updateTheme);
modeSelect.addEventListener('change', () => {
  if (modeSelect.value === 'online') {
    enterOnlineMode();
    return;
  }

  if (onlineChannel) void closeOnlineRoom();
  updateSetupControls();
});
playerNameInput.value = playerName;
updateSetupControls();

chatForm.addEventListener('submit', (event) => {
  void sendChatMessage(event);
});

createRoomButton.addEventListener('click', () => {
  if (modeSelect.value !== 'online') modeSelect.value = 'online';
  applyPlayerName();
  enterOnlineMode();
  void connectToOnlineRoom(createRoomCode(), onlinePlayerId, true);
});

findRoomsButton.addEventListener('click', () => {
  void findOnlineRooms();
});

joinRoomButton.addEventListener('click', () => {
  if (modeSelect.value !== 'online') modeSelect.value = 'online';
  applyPlayerName();
  enterOnlineMode();
  const pageUrl = new URL(window.location.href);
  const hostId = pageUrl.searchParams.get('room') === roomCodeInput.value.trim().toUpperCase()
    ? (pageUrl.searchParams.get('host') || '')
    : '';
  void connectToOnlineRoom(roomCodeInput.value, hostId, false);
});

roomCodeInput.addEventListener('input', () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
});

copyRoomLinkButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(roomLinkInput.value);
    connectionStatus.textContent = 'Link copiado. Envie para o outro jogador.';
  } catch (error) {
    roomLinkInput.focus();
    roomLinkInput.select();
    connectionStatus.textContent = 'Selecione e copie o link para compartilhar.';
  }
});

leaveRoomButton.addEventListener('click', async () => {
  await closeOnlineRoom();
  roomCodeInput.value = '';
  board = Array(9).fill('');
  currentPlayer = 'X';
  gameOver = false;
  enterOnlineMode();
  connectionStatus.textContent = 'Você saiu da sala. Crie outra ou entre com um código.';
});

const rendererAvailable = initializeRenderer();
board = Array(9).fill('');
renderGameInsights();
if (!rendererAvailable) {
  webglWarning.hidden = false;
  statusElement.textContent = 'WebGL 2.0 não está disponível neste navegador.';
  startGameButton.disabled = true;
  cells.forEach((cell) => { cell.disabled = true; });
} else {
  if ('ResizeObserver' in window) {
    boardResizeObserver = new ResizeObserver(resizeCanvas);
    boardResizeObserver.observe(boardElement);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }
  resizeCanvas();
}

const requestedRoom = new URLSearchParams(window.location.search).get('room');
if (rendererAvailable && requestedRoom) {
  modeSelect.value = 'online';
  enterOnlineMode();
  roomCodeInput.value = requestedRoom.toUpperCase();
  connectionStatus.textContent = 'Confira seu nome e entre na sala para começar.';
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).catch((error) => {
    console.warn('O modo offline não pôde ser ativado:', error);
  });
}
