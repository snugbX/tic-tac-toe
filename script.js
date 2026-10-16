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
  cells.forEach((cell, index) => {
    const value = board[index];
    cell.setAttribute('aria-label', value ? `Casa ${index + 1}, ${value}` : `Casa ${index + 1}, vazia`);
    cell.disabled = !gl || gameOver || aiThinking || Boolean(value) || (modeSelect.value === 'ai' && currentPlayer !== human);
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

function startGame() {
  window.clearTimeout(aiMoveTimeout);
  aiMoveTimeout = undefined;
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
resetButton.addEventListener('click', startGame);
themeToggle.addEventListener('click', updateTheme);
modeSelect.addEventListener('change', startGame);
symbolSelect.addEventListener('change', startGame);
starterSelect.addEventListener('change', startGame);

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

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.warn('O modo offline não pôde ser ativado:', error);
  });
}
