const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const levelEl = document.querySelector("#level");
const livesEl = document.querySelector("#lives");
const powerEl = document.querySelector("#power");
const touchControls = document.querySelector(".touch-controls");

const keys = new Set();
const pointer = {
  active: false,
  x: 0,
};

const state = {
  score: 0,
  level: 1,
  lives: 3,
  mode: "ready",
  lastTime: 0,
  shake: 0,
  baseBallSpeed: 420,
  missileCooldown: 0,
};

const effects = {
  missile: 0,
  expand: 0,
  slow: 0,
};

const itemTypes = {
  missile: { label: "M", color: "#ff686b", name: "MISSILE" },
  multi: { label: "3", color: "#f7c85f", name: "TRIPLE" },
  expand: { label: "W", color: "#39d5c4", name: "WIDE" },
  slow: { label: "S", color: "#7aa2ff", name: "SLOW" },
};

const itemOrder = Object.keys(itemTypes);

const world = {
  width: canvas.width,
  height: canvas.height,
  wall: 22,
};

const paddle = {
  baseWidth: 132,
  width: 132,
  height: 18,
  x: world.width / 2 - 66,
  y: world.height - 58,
  speed: 680,
};

const brickConfig = {
  columns: 10,
  rows: 6,
  gap: 9,
  top: 82,
  left: 52,
  width: 78,
  height: 24,
};

const stagePatterns = [
  { name: "FULL", include: () => true, hard: (row, col) => row < 2 && (col + row) % 2 === 0 },
  { name: "CHECKER", include: (row, col) => row < 2 || (row + col) % 2 === 0, hard: (row, col) => row <= 3 && col % 3 === 1 },
  { name: "STAIRS", include: (row, col) => col >= row && col <= brickConfig.columns - 1 - Math.floor(row / 2), hard: (row, col) => row === col || col === brickConfig.columns - 1 - row },
  { name: "GATE", include: (row, col) => row < 2 || col < 3 || col > 6 || row === 5, hard: (row, col) => col === 2 || col === 7 || row === 1 },
  { name: "DIAMOND", include: (row, col) => Math.abs(col - 4.5) + Math.abs(row - 2.5) <= 5, hard: (row, col) => Math.abs(col - 4.5) + Math.abs(row - 2.5) <= 2.6 },
  { name: "FORT", include: (row, col) => row === 0 || row === 5 || col === 0 || col === 9 || (row >= 2 && row <= 3 && col >= 3 && col <= 6), hard: (row, col) => row === 0 || col === 0 || col === 9 },
];

let balls = [];
let bricks = [];
let items = [];
let missiles = [];

function makeBall(x, y, vx = 0, vy = 0, stuck = true) {
  return {
    radius: 9,
    x,
    y,
    vx,
    vy,
    stuck,
  };
}

function resetLevel() {
  const palette = ["#ff686b", "#f7c85f", "#39d5c4", "#8bd17c", "#7aa2ff", "#d783ff"];
  const stage = getStagePattern();
  bricks = [];
  items = [];
  missiles = [];

  for (let row = 0; row < brickConfig.rows; row += 1) {
    for (let col = 0; col < brickConfig.columns; col += 1) {
      if (!stage.include(row, col)) continue;

      const strength = getBrickStrength(row, col, stage);
      bricks.push({
        x: brickConfig.left + col * (brickConfig.width + brickConfig.gap),
        y: brickConfig.top + row * (brickConfig.height + brickConfig.gap),
        width: brickConfig.width,
        height: brickConfig.height,
        color: palette[(row + state.level - 1) % palette.length],
        strength,
        maxStrength: strength,
        alive: true,
        item: null,
      });
    }
  }

  seedItemBricks();
  resetBall(true);
}

function getStagePattern() {
  return stagePatterns[(state.level - 1) % stagePatterns.length];
}

function getBrickStrength(row, col, stage) {
  if (state.level === 1) return 1;

  const cycleBoost = Math.floor((state.level - 1) / stagePatterns.length);
  if (cycleBoost > 0 && (row + col + state.level) % 7 === 0) return 3;
  if (stage.hard(row, col)) return 2;
  if (state.level >= 4 && (row * 2 + col + state.level) % 9 === 0) return 2;
  return 1;
}

function seedItemBricks() {
  const candidates = bricks.filter((brick) => brick.y > brickConfig.top + brickConfig.height);
  const itemCount = 9 + Math.min(state.level, 4);

  for (let i = 0; i < itemCount && candidates.length > 0; i += 1) {
    const index = Math.floor(Math.random() * candidates.length);
    const brick = candidates.splice(index, 1)[0];
    brick.item = itemOrder[(i + state.level) % itemOrder.length];
  }
}

function resetBall(centerPaddle = false) {
  if (centerPaddle) {
    paddle.x = world.width / 2 - paddle.width / 2;
  }

  balls = [makeBall(paddle.x + paddle.width / 2, paddle.y - 20)];
}

function launchBall() {
  if (!balls.some((ball) => ball.stuck)) return;

  for (const ball of balls) {
    if (!ball.stuck) continue;
    const angle = (Math.random() * 0.35 + 0.66) * Math.PI;
    const direction = Math.random() > 0.5 ? 1 : -1;
    ball.vx = Math.cos(angle) * state.baseBallSpeed * direction;
    ball.vy = -Math.sin(angle) * state.baseBallSpeed;
    ball.stuck = false;
  }

  state.mode = "playing";
}

function togglePause() {
  if (state.mode === "playing") state.mode = "paused";
  else if (state.mode === "paused") state.mode = "playing";
}

function updateHud() {
  scoreEl.textContent = state.score.toString();
  levelEl.textContent = state.level.toString();
  livesEl.textContent = state.lives.toString();

  if (!powerEl) return;
  const active = [];
  if (effects.missile > 0) active.push("M " + Math.ceil(effects.missile));
  if (effects.expand > 0) active.push("W " + Math.ceil(effects.expand));
  if (effects.slow > 0) active.push("S " + Math.ceil(effects.slow));
  powerEl.textContent = active.length > 0 ? active.join(" / ") : "-";
}

function handleKeys(dt) {
  const movingLeft = keys.has("ArrowLeft") || keys.has("KeyA");
  const movingRight = keys.has("ArrowRight") || keys.has("KeyD");
  const direction = Number(movingRight) - Number(movingLeft);

  if (pointer.active) {
    paddle.x = pointer.x - paddle.width / 2;
  } else {
    paddle.x += direction * paddle.speed * dt;
  }

  paddle.x = clamp(paddle.x, world.wall, world.width - world.wall - paddle.width);

  for (const ball of balls) {
    if (!ball.stuck) continue;
    ball.x = paddle.x + paddle.width / 2;
    ball.y = paddle.y - ball.radius - 2;
  }
}

function update(dt) {
  if (state.mode !== "playing" && state.mode !== "ready") return;

  handleKeys(dt);
  updateEffects(dt);

  if (state.mode !== "playing") return;

  state.missileCooldown = Math.max(0, state.missileCooldown - dt);
  updateBalls(dt);
  updateItems(dt);
  updateMissiles(dt);

  if (bricks.every((brick) => !brick.alive)) {
    state.level += 1;
    state.baseBallSpeed += 42;
    clearTemporaryPower();
    state.mode = "level";
    updateHud();
    setTimeout(() => {
      resetLevel();
      state.mode = "ready";
      updateHud();
    }, 900);
  }
}

function updateEffects(dt) {
  let changed = false;

  for (const key of Object.keys(effects)) {
    if (effects[key] <= 0) continue;
    effects[key] = Math.max(0, effects[key] - dt);
    changed = true;
  }

  paddle.width = effects.expand > 0 ? 204 : paddle.baseWidth;
  paddle.x = clamp(paddle.x, world.wall, world.width - world.wall - paddle.width);

  if (changed) updateHud();
}

function updateBalls(dt) {
  const speedScale = effects.slow > 0 ? 0.58 : 1;

  for (const ball of balls) {
    if (ball.stuck) continue;

    ball.x += ball.vx * dt * speedScale;
    ball.y += ball.vy * dt * speedScale;

    if (ball.x - ball.radius < world.wall) {
      ball.x = world.wall + ball.radius;
      ball.vx = Math.abs(ball.vx);
    }

    if (ball.x + ball.radius > world.width - world.wall) {
      ball.x = world.width - world.wall - ball.radius;
      ball.vx = -Math.abs(ball.vx);
    }

    if (ball.y - ball.radius < world.wall) {
      ball.y = world.wall + ball.radius;
      ball.vy = Math.abs(ball.vy);
    }

    collidePaddle(ball);
    collideBricks(ball);
  }

  balls = balls.filter((ball) => ball.y - ball.radius <= world.height);

  if (balls.length === 0) {
    loseLife();
  }
}

function updateItems(dt) {
  for (const item of items) {
    item.y += item.speed * dt;
    item.spin += dt * 4;

    const caught =
      item.y + item.size / 2 >= paddle.y &&
      item.y - item.size / 2 <= paddle.y + paddle.height &&
      item.x >= paddle.x &&
      item.x <= paddle.x + paddle.width;

    if (caught) {
      item.collected = true;
      applyItem(item.type);
    }
  }

  items = items.filter((item) => !item.collected && item.y - item.size < world.height);
}

function updateMissiles(dt) {
  for (const missile of missiles) {
    missile.y -= missile.speed * dt;

    for (const brick of bricks) {
      if (!brick.alive) continue;
      const hit =
        missile.x >= brick.x &&
        missile.x <= brick.x + brick.width &&
        missile.y >= brick.y &&
        missile.y <= brick.y + brick.height;

      if (!hit) continue;

      missile.dead = true;
      damageBrick(brick, 1, true);
      state.shake = 4;
      break;
    }
  }

  missiles = missiles.filter((missile) => !missile.dead && missile.y > world.wall);
}

function fireMissiles() {
  if (effects.missile <= 0 || state.mode !== "playing" || state.missileCooldown > 0) return;

  missiles.push(
    { x: paddle.x + 20, y: paddle.y - 5, width: 5, height: 18, speed: 760, dead: false },
    { x: paddle.x + paddle.width - 20, y: paddle.y - 5, width: 5, height: 18, speed: 760, dead: false },
  );
  state.missileCooldown = 0.24;
}

function applyItem(type) {
  state.score += 50 * state.level;
  state.shake = 6;

  if (type === "missile") {
    effects.missile = 12;
  }

  if (type === "multi") {
    splitBalls();
  }

  if (type === "expand") {
    effects.expand = 14;
  }

  if (type === "slow") {
    effects.slow = 10;
  }

  updateHud();
}

function splitBalls() {
  const source = balls.find((ball) => !ball.stuck) || balls[0];
  if (!source) return;

  const speed = Math.max(state.baseBallSpeed, Math.hypot(source.vx, source.vy) || state.baseBallSpeed);
  const angles = [-0.72, -Math.PI / 2, -2.42];
  balls = angles.map((angle) => makeBall(source.x, source.y, Math.cos(angle) * speed, Math.sin(angle) * speed, false));
  state.mode = "playing";
}

function collidePaddle(ball) {
  const hit =
    ball.y + ball.radius >= paddle.y &&
    ball.y - ball.radius <= paddle.y + paddle.height &&
    ball.x >= paddle.x &&
    ball.x <= paddle.x + paddle.width &&
    ball.vy > 0;

  if (!hit) return;

  const relative = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
  const bounce = relative * 0.92;
  const angle = bounce * (Math.PI / 3);
  const speed = Math.hypot(ball.vx, ball.vy) * 1.01;
  ball.vx = Math.sin(angle) * speed;
  ball.vy = -Math.cos(angle) * speed;
  ball.y = paddle.y - ball.radius - 1;
}

function collideBricks(ball) {
  for (const brick of bricks) {
    if (!brick.alive) continue;

    const nearestX = clamp(ball.x, brick.x, brick.x + brick.width);
    const nearestY = clamp(ball.y, brick.y, brick.y + brick.height);
    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;

    if (dx * dx + dy * dy > ball.radius * ball.radius) continue;

    damageBrick(brick, 1, false);

    const overlapX = ball.radius - Math.abs(dx);
    const overlapY = ball.radius - Math.abs(dy);
    if (overlapX < overlapY) {
      ball.vx *= -1;
    } else {
      ball.vy *= -1;
    }

    state.shake = 5;
    break;
  }
}

function damageBrick(brick, amount, fromMissile) {
  brick.strength -= amount;

  if (brick.strength <= 0) {
    brick.alive = false;
    state.score += (fromMissile ? 80 : 100) * state.level;
    dropItem(brick);
  } else {
    state.score += 35 * state.level;
    brick.color = lightenColor(brick.color, 0.16);
  }

  updateHud();
}

function dropItem(brick) {
  if (!brick.item) return;

  items.push({
    type: brick.item,
    x: brick.x + brick.width / 2,
    y: brick.y + brick.height / 2,
    size: 26,
    speed: 150,
    spin: 0,
    collected: false,
  });
}

function loseLife() {
  state.lives -= 1;
  state.shake = 12;
  items = [];
  missiles = [];
  clearTemporaryPower();
  updateHud();

  if (state.lives <= 0) {
    state.mode = "gameover";
    resetBall();
    return;
  }

  state.mode = "ready";
  resetBall();
}

function clearTemporaryPower() {
  effects.missile = 0;
  effects.expand = 0;
  effects.slow = 0;
  paddle.width = paddle.baseWidth;
  state.missileCooldown = 0;
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, world.width, world.height);

  if (state.shake > 0) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    state.shake *= 0.82;
    if (state.shake < 0.3) state.shake = 0;
  }

  drawArena();
  drawBricks();
  drawItems();
  drawMissiles();
  drawPaddle();
  drawBalls();
  drawOverlay();

  ctx.restore();
}

function drawArena() {
  const gradient = ctx.createLinearGradient(0, 0, 0, world.height);
  gradient.addColorStop(0, "#121820");
  gradient.addColorStop(1, "#090b0e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 2;
  ctx.strokeRect(world.wall, world.wall, world.width - world.wall * 2, world.height - world.wall * 0.5);

  ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
  for (let x = world.wall; x < world.width - world.wall; x += 42) {
    ctx.fillRect(x, world.wall, 1, world.height - world.wall * 1.6);
  }
}

function drawBricks() {
  for (const brick of bricks) {
    if (!brick.alive) continue;
    ctx.save();
    ctx.shadowColor = brick.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = brick.color;
    roundRect(brick.x, brick.y, brick.width, brick.height, 5);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    roundRect(brick.x + 5, brick.y + 4, brick.width - 10, 5, 3);
    ctx.fill();

    if (brick.maxStrength > 1) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      roundRect(brick.x + brick.width - 24, brick.y + 5, 16, 14, 4);
      ctx.fill();
      ctx.fillStyle = "#f3f1ea";
      ctx.font = "900 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(brick.strength.toString(), brick.x + brick.width - 16, brick.y + 12.5);
    }

    if (brick.item) {
      const item = itemTypes[brick.item];
      ctx.fillStyle = "rgba(8, 10, 12, 0.48)";
      ctx.beginPath();
      ctx.arc(brick.x + brick.width / 2, brick.y + brick.height / 2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = item.color;
      ctx.font = "800 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.label, brick.x + brick.width / 2, brick.y + brick.height / 2 + 0.5);
    }

    ctx.restore();
  }
}

function drawItems() {
  for (const item of items) {
    const info = itemTypes[item.type];
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.spin);
    ctx.shadowColor = info.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = info.color;
    roundRect(-item.size / 2, -item.size / 2, item.size, item.size, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#101113";
    ctx.font = "900 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(info.label, 0, 1);
    ctx.restore();
  }
}

function drawMissiles() {
  for (const missile of missiles) {
    ctx.save();
    ctx.shadowColor = "#ff686b";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ff686b";
    roundRect(missile.x - missile.width / 2, missile.y - missile.height, missile.width, missile.height, 3);
    ctx.fill();
    ctx.fillStyle = "#f7c85f";
    ctx.fillRect(missile.x - 1, missile.y, 2, 7);
    ctx.restore();
  }
}

function drawPaddle() {
  const gradient = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x + paddle.width, paddle.y);
  gradient.addColorStop(0, "#39d5c4");
  gradient.addColorStop(0.5, "#f3f1ea");
  gradient.addColorStop(1, "#ff686b");
  ctx.save();
  ctx.shadowColor = effects.expand > 0 ? "#f7c85f" : "#39d5c4";
  ctx.shadowBlur = effects.expand > 0 ? 22 : 16;
  ctx.fillStyle = gradient;
  roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 9);
  ctx.fill();

  if (effects.missile > 0) {
    ctx.fillStyle = "#ff686b";
    roundRect(paddle.x + 14, paddle.y - 8, 12, 12, 3);
    roundRect(paddle.x + paddle.width - 26, paddle.y - 8, 12, 12, 3);
    ctx.fill();
  }
  ctx.restore();
}

function drawBalls() {
  for (const ball of balls) {
    const gradient = ctx.createRadialGradient(ball.x - 4, ball.y - 5, 2, ball.x, ball.y, ball.radius + 5);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.4, effects.slow > 0 ? "#7aa2ff" : "#f7c85f");
    gradient.addColorStop(1, "#ff686b");
    ctx.save();
    ctx.shadowColor = effects.slow > 0 ? "#7aa2ff" : "#f7c85f";
    ctx.shadowBlur = 18;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawOverlay() {
  const messages = {
    ready: ["SPACE", "スタート"],
    paused: ["PAUSED", "Pで再開"],
    gameover: ["GAME OVER", "Rでリスタート"],
    level: ["CLEAR", "次のレベルへ"],
  };

  const message = messages[state.mode];
  if (!message) return;

  ctx.save();
  ctx.fillStyle = "rgba(6, 8, 10, 0.58)";
  ctx.fillRect(world.wall, world.wall, world.width - world.wall * 2, world.height - world.wall * 1.5);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f3f1ea";
  ctx.font = "800 56px system-ui, sans-serif";
  ctx.fillText(message[0], world.width / 2, world.height / 2 - 18);
  ctx.fillStyle = "#a7adb5";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText(message[1], world.width / 2, world.height / 2 + 42);
  ctx.restore();
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function lightenColor(hex, amount) {
  const value = hex.replace("#", "");
  const red = Math.min(255, parseInt(value.slice(0, 2), 16) + Math.round(255 * amount));
  const green = Math.min(255, parseInt(value.slice(2, 4), 16) + Math.round(255 * amount));
  const blue = Math.min(255, parseInt(value.slice(4, 6), 16) + Math.round(255 * amount));
  return "#" + [red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function restart() {
  state.score = 0;
  state.level = 1;
  state.lives = 3;
  state.mode = "ready";
  state.baseBallSpeed = 420;
  clearTemporaryPower();
  updateHud();
  resetLevel();
}

function frame(time) {
  const dt = Math.min((time - state.lastTime) / 1000 || 0, 0.032);
  state.lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  const handled = ["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space", "KeyP", "KeyR", "KeyX", "Enter"].includes(event.code);
  if (handled) event.preventDefault();

  keys.add(event.code);

  if (event.code === "Space") {
    if (state.mode === "ready") launchBall();
    if (state.mode === "gameover") restart();
  }

  if (event.code === "KeyX" || event.code === "Enter") {
    fireMissiles();
  }

  if (event.code === "KeyP") {
    togglePause();
  }

  if (event.code === "KeyR") {
    restart();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

function setPointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = world.width / rect.width;
  pointer.x = (event.clientX - rect.left) * scaleX;
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.focus();
  pointer.active = true;
  canvas.setPointerCapture(event.pointerId);
  setPointerFromEvent(event);

  if (state.mode === "ready") {
    launchBall();
  } else if (state.mode === "gameover") {
    restart();
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointer.active) return;
  setPointerFromEvent(event);
});

canvas.addEventListener("pointerup", (event) => {
  pointer.active = false;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
});

canvas.addEventListener("pointercancel", () => {
  pointer.active = false;
});

if (touchControls) {
  touchControls.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    canvas.focus();
    const action = button.dataset.action;
    if (action === "start") {
      if (state.mode === "ready") launchBall();
      else if (state.mode === "gameover") restart();
    }
    if (action === "fire") fireMissiles();
    if (action === "pause") togglePause();
    if (action === "restart") restart();
  });
}

window.addEventListener("load", () => canvas.focus());

restart();
requestAnimationFrame(frame);
