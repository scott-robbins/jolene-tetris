'use strict';
// ===================== JOLENETRIS — CHUNK 1: ENGINE =====================

const COLS = 10, ROWS = 20;
const LOCK_DELAY = 500;          // ms a grounded piece waits before locking
const MAX_LOCK_RESETS = 15;      // moves/rotations allowed while grounded
const LINE_SCORES = [0, 100, 300, 500, 800];

const COLORS = {
  I: '#22e3ff', O: '#ffd23f', T: '#b44dff', S: '#3dff8a',
  Z: '#ff3d6e', J: '#3d7bff', L: '#ff7a1a'
};

const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]]
};

// SRS wall kicks [dx, dy] with y pointing UP (we flip y when applying)
const KICKS_JLSTZ = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
};
const KICKS_I = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
};

const state = {
  board: [], piece: null, queue: [], holdType: null, canHold: true,
  score: 0, lines: 0, level: 1,
  running: false, paused: false, over: false,
  dropTimer: 0, lockTimer: 0, lockResets: 0
};

// Chunk 3 replaces these with sound + visual effects
const hooks = { lock() {}, clear(n) {}, tetris() {}, hold() {}, gameOver() {} };

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

// 7-bag randomizer: every piece once per bag, shuffled
function refillBag() {
  const bag = Object.keys(SHAPES);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  state.queue.push(...bag);
}

function nextType() {
  while (state.queue.length < 7) refillBag();
  return state.queue.shift();
}

function spawn(type) {
  const matrix = SHAPES[type].map(row => row.slice());
  state.piece = {
    type, matrix, rot: 0,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: type === 'I' ? -1 : 0
  };
  state.dropTimer = 0;
  state.lockTimer = 0;
  state.lockResets = 0;
  if (collides(matrix, state.piece.x, state.piece.y)) endGame();
}

function collides(matrix, px, py) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const x = px + c, y = py + r;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && state.board[y][x]) return true;
    }
  }
  return false;
}

function isGrounded() {
  const p = state.piece;
  return collides(p.matrix, p.x, p.y + 1);
}

function bumpLock() {
  if (isGrounded() && state.lockResets < MAX_LOCK_RESETS) {
    state.lockTimer = 0;
    state.lockResets++;
  }
}

function tryMove(dx, dy) {
  const p = state.piece;
  if (!p || collides(p.matrix, p.x + dx, p.y + dy)) return false;
  p.x += dx;
  p.y += dy;
  if (dx !== 0) bumpLock();
  return true;
}

function rotate(dir) { // 1 = clockwise, -1 = counter-clockwise
  const p = state.piece;
  if (!p || p.type === 'O') return false;
  const m = p.matrix, n = m.length;
  const rotated = dir === 1
    ? m[0].map((_, i) => m.map(row => row[i]).reverse())
    : m[0].map((_, i) => m.map(row => row[n - 1 - i]));
  const to = (p.rot + dir + 4) % 4;
  const kicks = (p.type === 'I' ? KICKS_I : KICKS_JLSTZ)[p.rot + '>' + to];
  for (const [kx, ky] of kicks) {
    if (!collides(rotated, p.x + kx, p.y - ky)) {
      p.matrix = rotated;
      p.rot = to;
      p.x += kx;
      p.y -= ky;
      bumpLock();
      return true;
    }
  }
  return false;
}

function ghostY() {
  const p = state.piece;
  let y = p.y;
  while (!collides(p.matrix, p.x, y + 1)) y++;
  return y;
}

function softDrop() {
  if (tryMove(0, 1)) {
    state.score += 1;
    state.dropTimer = 0;
    return true;
  }
  return false;
}

function hardDrop() {
  const p = state.piece;
  if (!p) return;
  const gy = ghostY();
  state.score += (gy - p.y) * 2;
  p.y = gy;
  lockPiece();
}

function lockPiece() {
  const p = state.piece;
  let lockedAboveTop = false;
  p.matrix.forEach((row, r) => row.forEach((v, c) => {
    if (!v) return;
    const y = p.y + r;
    if (y < 0) lockedAboveTop = true;
    else state.board[y][p.x + c] = p.type;
  }));
  state.piece = null;
  hooks.lock();
  if (lockedAboveTop) return endGame();
  clearLines();
  state.canHold = true;
  spawn(nextType());
}

function clearLines() {
  let cleared = 0;
  for (let r = RO
