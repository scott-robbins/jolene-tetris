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
  for (let r = ROWS - 1; r >= 0; r--) {
    if (state.board[r].every(cell => cell)) {
      state.board.splice(r, 1);
      state.board.unshift(Array(COLS).fill(null));
      cleared++;
      r++; // re-check this row index, since everything shifted down
    }
  }
  if (!cleared) return;
  state.lines += cleared;
  state.score += LINE_SCORES[cleared] * state.level;
  state.level = Math.floor(state.lines / 10) + 1;
  if (cleared === 4) hooks.tetris(); else hooks.clear(cleared);
}

function holdPiece() {
  if (!state.piece || !state.canHold) return;
  const current = state.piece.type;
  const swap = state.holdType;
  state.holdType = current;
  spawn(swap || nextType());
  state.canHold = false;
  hooks.hold();
}

function dropInterval() {
  // 1s at level 1, ~15% faster each level, floor of 50ms
  return Math.max(50, 1000 * Math.pow(0.85, state.level - 1));
}

function update(dt) {
  if (!state.running || state.paused || state.over || !state.piece) return;
  if (isGrounded()) {
    state.lockTimer += dt;
    if (state.lockTimer >= LOCK_DELAY) lockPiece();
  } else {
    state.lockTimer = 0;
    state.dropTimer += dt;
    if (state.dropTimer >= dropInterval()) {
      state.dropTimer = 0;
      tryMove(0, 1);
    }
  }
}

function endGame() {
  state.over = true;
  state.running = false;
  state.piece = null;
  hooks.gameOver();
}

function resetGame() {
  Object.assign(state, {
    board: emptyBoard(), piece: null, queue: [], holdType: null, canHold: true,
    score: 0, lines: 0, level: 1,
    running: true, paused: false, over: false,
    dropTimer: 0, lockTimer: 0, lockResets: 0
  });
  spawn(nextType());
}

// ===================== END CHUNK 1 — chunk 2 (rendering) goes below =====================

// ===================== CHUNK 2: RENDERING =====================

const CELL = 30;
const boardCanvas = document.getElementById('board');
const bctx = boardCanvas.getContext('2d');
const holdCtx = document.getElementById('hold').getContext('2d');
const nextCtx = document.getElementById('next').getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');

state.board = emptyBoard(); // so the empty board can draw before the first game

// Sharp rendering on Retina / iPhone screens
(function setupBoardDPR() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  boardCanvas.width = COLS * CELL * dpr;
  boardCanvas.height = ROWS * CELL * dpr;
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
})();

function eachCell(matrix, fn) {
  matrix.forEach((row, r) => row.forEach((v, c) => { if (v) fn(r, c); }));
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v + v * amt)));
  return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCell(ctx, x, y, size, color, opts = {}) {
  const pad = size * 0.06;
  const px = x + pad, py = y + pad, s = size - pad * 2;
  ctx.save();
  if (opts.ghost) {
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    roundRect(ctx, px + 1, py + 1, s - 2, s - 2, s * 0.18);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (opts.glow) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
  const g = ctx.createLinearGradient(px, py, px + s, py + s);
  g.addColorStop(0, color);
  g.addColorStop(1, shade(color, -0.4));
  ctx.fillStyle = g;
  roundRect(ctx, px, py, s, s, s * 0.18);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; // glossy highlight
  roundRect(ctx, px + s * 0.12, py + s * 0.1, s * 0.76, s * 0.18, s * 0.08);
  ctx.fill();
  ctx.restore();
}

function drawGrid() {
  const w = COLS * CELL, h = ROWS * CELL;
  bctx.clearRect(0, 0, w, h);
  bctx.strokeStyle = 'rgba(34,227,255,0.07)';
  bctx.lineWidth = 1;
  bctx.beginPath();
  for (let c = 1; c < COLS; c++) { bctx.moveTo(c * CELL + 0.5, 0); bctx.lineTo(c * CELL + 0.5, h); }
  for (let r = 1; r < ROWS; r++) { bctx.moveTo(0, r * CELL + 0.5); bctx.lineTo(w, r * CELL + 0.5); }
  bctx.stroke();
}

function drawBoard() {
  drawGrid();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = state.board[r][c];
      if (t) drawCell(bctx, c * CELL, r * CELL, CELL, COLORS[t]);
    }
  }
  const p = state.piece;
  if (!p) return;
  const gy = ghostY();
  eachCell(p.matrix, (r, c) => {
    if (gy + r >= 0) drawCell(bctx, (p.x + c) * CELL, (gy + r) * CELL, CELL, COLORS[p.type], { ghost: true });
  });
  eachCell(p.matrix, (r, c) => {
    if (p.y + r >= 0) drawCell(bctx, (p.x + c) * CELL, (p.y + r) * CELL, CELL, COLORS[p.type], { glow: true });
  });
}

// Draws a piece centered at (cx, cy) in a side panel
function drawMini(ctx, type, cx, cy, size, dim) {
  const m = SHAPES[type];
  let minR = 9, maxR = -1, minC = 9, maxC = -1;
  eachCell(m, (r, c) => {
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  });
  const ox = cx - ((maxC - minC + 1) * size) / 2;
  const oy = cy - ((maxR - minR + 1) * size) / 2;
  ctx.save();
  if (dim) ctx.globalAlpha = 0.35;
  eachCell(m, (r, c) => drawCell(ctx, ox + (c - minC) * size, oy + (r - minR) * size, size, COLORS[type]));
  ctx.restore();
}

function drawHold() {
  holdCtx.clearRect(0, 0, 96, 96);
  if (state.holdType) drawMini(holdCtx, state.holdType, 48, 48, 20, !state.canHold);
}

function drawNext() {
  nextCtx.clearRect(0, 0, 96, 288);
  for (let i = 0; i < 3 && i < state.queue.length; i++) {
    drawMini(nextCtx, state.queue[i], 48, 48 + i * 96, 20, false);
  }
}

function render() {
  drawBoard();
  drawHold();
  drawNext();
  scoreEl.textContent = state.score.toLocaleString();
  linesEl.textContent = state.lines;
  levelEl.textContent = state.level;
}

// ===================== END CHUNK 2 — chunk 3 (controls + sound + loop) goes below =====================

// ===================== CHUNK 3: SOUND, EFFECTS, CONTROLS, LOOP =====================

// ---------- Sound: synthesized with Web Audio, OFF by default ----------
let soundOn = localStorage.getItem('jolenetris-sound') === 'on';
let audioCtx = null;
const soundBtn = document.getElementById('btn-sound');

function updateSoundIcon() { soundBtn.textContent = soundOn ? '🔊' : '🔇'; }

function beep(freq, dur = 0.08, type = 'square', vol = 0.05, delay = 0) {
  if (!soundOn) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const t = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const sfx = {
  move()   { beep(220, 0.03, 'square', 0.025); },
  rotate() { beep(440, 0.05, 'triangle', 0.04); },
  lock()   { beep(110, 0.08, 'sine', 0.08); },
  hold()   { beep(330, 0.06, 'triangle', 0.04); beep(495, 0.06, 'triangle', 0.04, 0.06); },
  clear(n) { [523, 659, 784].slice(0, n).forEach((f, i) => beep(f, 0.1, 'triangle', 0.06, i * 0.07)); },
  tetris() { [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.14, 'square', 0.05, i * 0.08)); },
  over()   { [392, 330, 262, 196].forEach((f, i) => beep(f, 0.25, 'sawtooth', 0.04, i * 0.18)); }
};

soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('jolenetris-sound', soundOn ? 'on' : 'off');
  if (soundOn && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  updateSoundIcon();
  if (soundOn) sfx.rotate();
});
updateSoundIcon();

// ---------- Effects: line-clear flash + RED dachshund on a Tetris ----------
const flashEl = document.getElementById('flash');
const DACHSHUND_SVG = `
<svg viewBox="0 0 124 60" width="180" style="filter: drop-shadow(0 0 10px #ff7a1a)">
  <path d="M14 26 Q4 14 10 8" stroke="#b5441c" stroke-width="4" fill="none" stroke-linecap="round"/>
  <rect x="12" y="22" width="78" height="22" rx="11" fill="#b5441c"/>
  <rect x="18" y="38" width="7" height="14" rx="3" fill="#b5441c"/>
  <rect x="28" y="38" width="7" height="14" rx="3" fill="#b5441c"/>
  <rect x="72" y="38" width="7" height="14" rx="3" fill="#b5441c"/>
  <rect x="82" y="38" width="7" height="14" rx="3" fill="#b5441c"/>
  <ellipse cx="94" cy="22" rx="14" ry="11" fill="#b5441c"/>
  <ellipse cx="108" cy="27" rx="9" ry="6" fill="#b5441c"/>
  <ellipse cx="89" cy="27" rx="5" ry="9" fill="#7a2a10"/>
  <circle cx="98" cy="19" r="2" fill="#1a0d08"/>
  <circle cx="116" cy="26" r="2.5" fill="#1a0d08"/>
</svg>`;

function flash(html) {
  flashEl.innerHTML = html;
  flashEl.classList.remove('show');
  void flashEl.offsetWidth; // restarts the CSS animation
  flashEl.classList.add('show');
}

// ---------- Overlay + best score ----------
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg = document.getElementById('overlay-msg');
const startBtn = document.getElementById('btn-start');
let best = parseInt(localStorage.getItem('jolenetris-best') || '0', 10);
let lastTime = performance.now();

function showOverlay(title, msg, btnText) {
  overlayTitle.textContent = title;
  overlayMsg.textContent = msg;
  startBtn.textContent = btnText;
  overlay.classList.remove('hidden');
}
function hideOverlay() { overlay.classList.add('hidden'); }

function saveBest() {
  if (state.score > best) {
    best = state.score;
    localStorage.setItem('jolenetris-best', String(best));
  }
}

function startGame() {
  resetGame();
  hideOverlay();
  lastTime = performance.now();
}

function togglePause() {
  if (!state.running || state.over) return;
  state.paused = !state.paused;
  if (state.paused) showOverlay('PAUSED', 'Score ' + state.score.toLocaleString(), 'RESUME');
  else { hideOverlay(); lastTime = performance.now(); }
}

startBtn.addEventListener('click', () => { if (state.paused) togglePause(); else startGame(); });
document.getElementById('btn-pause').addEventListener('click', togglePause);

// ---------- Wire the engine hooks from chunk 1 ----------
hooks.lock = () => sfx.lock();
hooks.hold = () => sfx.hold();
hooks.clear = n => { sfx.clear(n); flash('<div>' + ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n] + '</div>'); };
hooks.tetris = () => { sfx.tetris(); flash('<div style="text-align:center">' + DACHSHUND_SVG + '<div>TETRIS!</div></div>'); };
hooks.gameOver = () => {
  sfx.over();
  const isNewBest = state.score > best;
  saveBest();
  showOverlay(isNewBest ? 'NEW BEST!' : 'GAME OVER',
    'Score ' + state.score.toLocaleString() + ' · Best ' + best.toLocaleString(), 'PLAY AGAIN');
};

// ---------- Actions ----------
function canAct() { return state.running && !state.paused && !state.over && state.piece; }

const actions = {
  left()      { if (canAct() && tryMove(-1, 0)) sfx.move(); },
  right()     { if (canAct() && tryMove(1, 0)) sfx.move(); },
  down()      { if (canAct()) softDrop(); },
  rotate()    { if (canAct() && rotate(1)) sfx.rotate(); },
  rotateCCW() { if (canAct() && rotate(-1)) sfx.rotate(); },
  drop()      { if (canAct()) hardDrop(); },
  hold()      { if (canAct()) holdPiece(); }
};

// ---------- Keyboard (laptop) ----------
const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
  ArrowUp: 'rotate', KeyX: 'rotate', KeyZ: 'rotateCCW',
  Space: 'drop', KeyC: 'hold', ShiftLeft: 'hold'
};
const NO_REPEAT = ['rotate', 'rotateCCW', 'drop', 'hold'];

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
 if (e.code === 'Enter' && !overlay.classList.contains('hidden')) { startBtn.click(); return; }
  const action = KEYMAP[e.code];
  if (!action) return;
  e.preventDefault();
  if (e.repeat && NO_REPEAT.includes(action)) return;
  actions[action]();
});

// ---------- Touch buttons (phone), hold-to-repeat on move/drop ----------
function bindButton(id, action, repeat) {
  const btn = document.getElementById(id);
  let delayT = null, repeatT = null;
  const stop = () => { clearTimeout(delayT); clearInterval(repeatT); delayT = repeatT = null; };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    stop();
    actions[action]();
    if (repeat) delayT = setTimeout(() => { repeatT = setInterval(actions[action], 50); }, 170);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  btn.addEventListener('contextmenu', e => e.preventDefault());
}
bindButton('btn-left', 'left', true);
bindButton('btn-right', 'right', true);
bindButton('btn-down', 'down', true);
bindButton('btn-rotate', 'rotate', false);
bindButton('btn-drop', 'drop', false);
bindButton('btn-hold', 'hold', false);

// Auto-pause if you switch apps or tabs
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.running && !state.paused) togglePause();
});

// ---------- Game loop ----------
function loop(now) {
  const dt = Math.min(now - lastTime, 100); // cap so a background tab can't teleport pieces
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

showOverlay('JOLENETRIS',
  "Stack 'em. Clear 'em. Breathe." + (best ? ' · Best ' + best.toLocaleString() : ''),
  'PLAY');
requestAnimationFrame(loop);

// ===================== END CHUNK 3 — Jolenetris v1 complete =====================