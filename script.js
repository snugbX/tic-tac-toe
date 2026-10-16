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
const symbolSelect = document.getElementById('symbol');
const starterSelect = document.getElementById('starter');
const themeToggle = document.getElementById('themeToggle');
const modeSelect = document.getElementById('mode');
const difficultySelect = document.getElementById('difficulty');
const difficultyField = document.getElementById('difficultyField');
const symbolField = document.getElementById('symbolField');
const starterField = document.getElementById('starterField');
const onlineLobby = document.getElementById('onlineLobby');
const createRoomButton = document.getElementById('createRoomButton');
const joinRoomButton = document.getElementById('joinRoomButton');
const roomCodeInput = document.getElementById('roomCode');
const roomShare = document.getElementById('roomShare');
const roomLinkInput = document.getElementById('roomLink');
const copyRoomLinkButton = document.getElementById('copyRoomLinkButton');
const connectionStatus = document.getElementById('connectionStatus');
const leaveRoomButton = document.getElementById('leaveRoomButton');
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
let onlineRoomCode = '';
let onlineHostId = '';
let onlinePlayerId = getOnlinePlayerId();
let onlineSymbol = '';
let onlinePlayerCount = 0;
let onlineConnected = false;
let onlineSpectator = false;
let onlineGameRevision = 0;

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

  const grid = [];
  const margin = width * 0.075;
  const firstThird = width / 3;
  const secondThird = (width * 2) / 3;
  const gridThickness = Math.max(2, width * 0.012);
  appendSegment(grid, firstThird, margin, firstThird, height - margin, gridThickness);
  appendSegment(grid, secondThird, margin, secondThird, height - margin, gridThickness);
  appendSegment(grid, margin, firstThird, width - margin, firstThird, gridThickness);
  appendSegment(grid, margin, secondThird, width - margin, secondThird, gridThickness);
  drawGeometry(grid, colorFromCss('--grid-color'));

  const markThickness = Math.max(6, width * 0.035);
  board.forEach((mark, index) => {
    if (!mark) return;

    const row = Math.floor(index / 3);
    const column = index % 3;
    const centerX = (column + 0.5) * (width / 3);
    const centerY = (row + 0.5) * (height / 3);
    const markSize = width * 0.16;

    if (mark === 'X') {
      const cross = [];
      appendSegment(cross, centerX - markSize, centerY - markSize, centerX + markSize, centerY + markSize, markThickness, true);
      appendSegment(cross, centerX + markSize, centerY - markSize, centerX - markSize, centerY + markSize, markThickness, true);
      drawGeometry(cross, colorFromCss('--x-color'));
    } else {
      const ring = [];
      appendRing(ring, centerX, centerY, markSize, markThickness);
      drawGeometry(ring, colorFromCss('--o-color'));
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

function enterOnlineMode() {
  difficultyField.hidden = true;
  symbolField.hidden = true;
  starterField.hidden = true;
  onlineLobby.hidden = false;
  resetButton.textContent = 'Reiniciar partida';

  if (!onlineChannel) {
    board = Array(9).fill('');
    currentPlayer = 'X';
    gameOver = false;
    statusElement.textContent = 'Crie uma sala ou entre com o código de um amigo.';
  }

  updateCellButtons();
  renderBoard();
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

function getOnlineMembers() {
  if (!onlineChannel) return [];

  const presence = onlineChannel.presenceState();
  return Object.entries(presence).map(([id, values]) => {
    const metadata = Array.isArray(values) ? values[0] : {};
    return { id, joinedAt: Number(metadata && metadata.joinedAt) || 0 };
  }).sort((left, right) => left.joinedAt - right.joinedAt || left.id.localeCompare(right.id));
}

function updateOnlineStatus() {
  if (modeSelect.value !== 'online') return;

  if (gameOver) {
    const winner = isWinner(board, 'X') ? 'X' : (isWinner(board, 'O') ? 'O' : '');
    connectionStatus.textContent = winner ? 'Jogador ' + winner + ' venceu!' : 'Empate!';
    statusElement.textContent = connectionStatus.textContent;
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
  updateCellButtons();
}

function updateOnlinePresence() {
  if (!onlineChannel) return;

  const members = getOnlineMembers();
  const memberIds = members.map((member) => member.id);
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

  if (onlineRoomCode && onlinePlayerCount >= 2 && !roomShare.hidden && onlineHostId) {
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set('room', onlineRoomCode);
    inviteUrl.searchParams.set('host', onlineHostId);
    roomLinkInput.value = inviteUrl.toString();
  }

  updateOnlineStatus();
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
    revision: onlineGameRevision
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
  gameOver = isWinner(board, 'X') || isWinner(board, 'O') || isTie(board);
  updateOnlineStatus();

  saveOnlineSnapshot();
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
  roomShare.hidden = true;
  leaveRoomButton.hidden = true;
  if (clearUrl) updateRoomUrl('', '');
}

async function connectToOnlineRoom(roomCode, hostId = '', isCreator = false) {
  const normalizedCode = String(roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalizedCode.length < 8 || normalizedCode.length > 16) {
    connectionStatus.textContent = 'Digite um código de sala válido.';
    return;
  }

  await closeOnlineRoom(false);
  onlineRoomCode = normalizedCode;
  onlineHostId = isCreator ? onlinePlayerId : hostId;
  onlineSymbol = isCreator ? 'X' : '';
  onlinePlayerCount = 0;
  onlineConnected = false;
  onlineSpectator = false;
  onlineGameRevision = 0;
  roomCodeInput.value = normalizedCode;
  leaveRoomButton.hidden = false;
  connectionStatus.textContent = 'Conectando à sala…';
  statusElement.textContent = connectionStatus.textContent;

  if (isCreator) {
    board = Array(9).fill('');
    currentPlayer = 'X';
    gameOver = false;
  } else {
    restoreOnlineSnapshot();
  }
  updateCellButtons();
  renderBoard();

  try {
    const client = await getSupabaseClient();
    const channel = client.channel('tic-tac-toe:' + normalizedCode, {
      config: {
        broadcast: { ack: true, self: false },
        presence: { key: onlinePlayerId }
      }
    });
    onlineChannel = channel;

    channel
      .on('broadcast', { event: 'game-state' }, ({ payload }) => receiveOnlineState(payload))
      .on('broadcast', { event: 'request-state' }, ({ payload }) => {
        if (payload && payload.room === onlineRoomCode && onlineSymbol === 'X') void sendOnlineState();
      })
      .on('presence', { event: 'sync' }, updateOnlinePresence)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          onlineConnected = true;
          await channel.track({ joinedAt: Date.now() });
          leaveRoomButton.hidden = false;
          if (isCreator) {
            roomShare.hidden = false;
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
  currentPlayer = 'X';
  gameOver = false;
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
  symbolField.hidden = false;
  starterField.hidden = false;
  onlineLobby.hidden = true;
  resetButton.textContent = 'Nova partida';
  if (!gl || !program) {
    statusElement.textContent = 'WebGL 2.0 não está disponível neste navegador.';
    cells.forEach((cell) => { cell.disabled = true; });
    return;
  }

  board = Array(9).fill('');
  gameOver = false;
  aiThinking = false;
  playerOne = symbolSelect.value;
  playerTwo = oppositeSymbol(playerOne);
  human = playerOne;
  ai = playerTwo;
  currentPlayer = starterSelect.value === 'human' ? playerOne : playerTwo;

  const isAiMode = modeSelect.value === 'ai';
  difficultyField.hidden = !isAiMode;
  starterSelect.options[0].textContent = isAiMode ? 'Você' : 'Jogador 1';
  starterSelect.options[1].textContent = isAiMode ? 'IA' : 'Jogador 2';
  statusElement.textContent = isAiMode
    ? (currentPlayer === human ? 'Sua vez. Faça a primeira jogada.' : 'A IA começa…')
    : `Vez de ${currentPlayer} (${starterSelect.value === 'human' ? 'Jogador 1' : 'Jogador 2'}).`;

  updateCellButtons();
  renderBoard();

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
  document.querySelector('meta[name="theme-color"]').content = isDark ? '#161c2a' : '#f4f6fb';
  renderBoard();
}

cells.forEach((cell) => cell.addEventListener('click', handleCellClick));
resetButton.addEventListener('click', () => {
  if (modeSelect.value === 'online') {
    void resetOnlineGame();
  } else {
    startGame();
  }
});
themeToggle.addEventListener('click', updateTheme);
modeSelect.addEventListener('change', () => {
  if (modeSelect.value === 'online') {
    enterOnlineMode();
    return;
  }

  if (onlineChannel) void closeOnlineRoom();
  startGame();
});
symbolSelect.addEventListener('change', startGame);
starterSelect.addEventListener('change', startGame);

createRoomButton.addEventListener('click', () => {
  if (modeSelect.value !== 'online') modeSelect.value = 'online';
  enterOnlineMode();
  void connectToOnlineRoom(createRoomCode(), onlinePlayerId, true);
});

joinRoomButton.addEventListener('click', () => {
  if (modeSelect.value !== 'online') modeSelect.value = 'online';
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
if (!rendererAvailable) {
  webglWarning.hidden = false;
  statusElement.textContent = 'WebGL 2.0 não está disponível neste navegador.';
  cells.forEach((cell) => { cell.disabled = true; });
} else {
  if ('ResizeObserver' in window) {
    boardResizeObserver = new ResizeObserver(resizeCanvas);
    boardResizeObserver.observe(boardElement);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }
  startGame();
  resizeCanvas();
}

const requestedRoom = new URLSearchParams(window.location.search).get('room');
if (rendererAvailable && requestedRoom) {
  const requestedHost = new URLSearchParams(window.location.search).get('host') || '';
  modeSelect.value = 'online';
  enterOnlineMode();
  roomCodeInput.value = requestedRoom.toUpperCase();
  void connectToOnlineRoom(requestedRoom, requestedHost, false);
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.warn('O modo offline não pôde ser ativado:', error);
  });
}
