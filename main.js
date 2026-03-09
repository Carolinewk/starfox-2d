const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const audioHooks = window.starfoxAudioHooks || null;

const ui = {
  score: document.getElementById("scoreValue"),
  phase: document.getElementById("phaseValue"),
  boss: document.getElementById("bossValue"),
  audioButton: document.getElementById("audioToggle"),
  leaderboard: document.getElementById("leaderboardList"),
};

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const LEADERBOARD_KEY = "starfox2d.local-top-scores";
const LEADERBOARD_LIMIT = 5;
const LEVEL_XP_BASE = 90;
const LEVEL_XP_STEP = 40;

let nextActorId = 1;

const PLAYER_ART = {
  scale: 2,
  thruster: ["#9cecff", "#5173ff"],
  palette: {
    k: "#1f2539",
    h: "#7382a1",
    b: "#4e73ff",
    c: "#7adfff",
    w: "#f7fbff",
    s: "#b8c4de",
  },
  sprite: [
    ".......k.......",
    "......khk......",
    ".....khbhk.....",
    "....khbbbkh....",
    "...khbbcbbhk...",
    "..khbbcwcbbhk..",
    ".khbbccwccbbhk.",
    "khbbskkkkksbbhk",
    ".kkh..k.k..hkk.",
    ".kh....k....hk.",
    "kh.....k.....hk",
    "h......k......h",
  ],
};

const ENEMY_ARTS = [
  {
    scale: 2,
    thruster: ["#ffbf6e", "#ff6f3c"],
    palette: {
      m: "#281a28",
      r: "#8b2d47",
      o: "#ff8d3e",
      y: "#ffe083",
    },
    sprite: [
      ".....m.....",
      "....mrm....",
      "...mrrrm...",
      "..mroyorm..",
      ".mroyyyorm.",
      "mroyyyyyorm",
      ".mmr...rmm.",
      "mm..m.m..mm",
    ],
  },
  {
    scale: 2,
    thruster: ["#86f5ff", "#2fa3d8"],
    palette: {
      n: "#162233",
      t: "#285f77",
      a: "#73e5ff",
      w: "#effdff",
    },
    sprite: [
      ".....n.....",
      "...nntnn...",
      "..ntaaatn..",
      ".ntawwwatn.",
      "ntawwwwwatn",
      ".nnt...tnn.",
      "nn..n.n..nn",
      ".n...n...n.",
    ],
  },
];

const BOSS_ART = {
  scale: 3,
  thruster: ["#ffd082", "#ff6b39"],
  palette: {
    k: "#1d1830",
    d: "#403457",
    r: "#7e2a4c",
    y: "#ffb04f",
    o: "#ffdd7a",
    b: "#5871bf",
    w: "#fff7d9",
  },
  sprite: [
    "........kkkkk........",
    "......kkdddddkk......",
    "....kkddrrrrrddkk....",
    "...kddrryyyyyrrddk...",
    "..kddryyyoooyyyrddk..",
    ".kddryyoobbbbooyrddk.",
    "kddryoobwwwwbooyyrddk",
    "kddryoobwwwwwbooyrddk",
    ".kddryyoobbbbooyrddk.",
    "..kddryyyoooyyyrddk..",
    "...kddrrbbbbbrrddk...",
    "....kkddrrrrrddkk....",
    ".....kkdd...ddkk.....",
    "......dd.....dd......",
  ],
};

const keys = new Set();
const pointer = { active: false, x: WIDTH / 2, y: HEIGHT - 90 };

const state = {
  ...createRunState(),
  leaderboard: loadLeaderboard(),
};

if (audioHooks) {
  for (const eventName of ["unlock", "mute", "music-mode", "support"]) {
    audioHooks.on(eventName, updateAudioUi);
  }
}

if (ui.audioButton) {
  ui.audioButton.addEventListener("click", () => {
    handleAudioToggle();
  });
}

function spriteWidth(art) {
  return art.sprite[0].length * art.scale;
}

function spriteHeight(art) {
  return art.sprite.length * art.scale;
}

function createPlayer() {
  return {
    art: PLAYER_ART,
    x: WIDTH / 2,
    y: HEIGHT - 76,
    width: spriteWidth(PLAYER_ART),
    height: spriteHeight(PLAYER_ART),
    scale: PLAYER_ART.scale,
    speed: 185,
    maxHp: 8,
    hp: 8,
    damage: 1,
    fireInterval: 0.14,
    projectileSpeed: 320,
    projectileRadius: 3,
    spreadLevel: 0,
    pierce: 0,
    shield: 0,
    fireCooldown: 0,
    invuln: 0,
  };
}

const SHIP_UPGRADES = [
  {
    id: "hull",
    title: "Reinforced Hull",
    description: "+2 max hull, repair 2.",
    available: (player) => player.maxHp < 22,
    apply: (player) => {
      player.maxHp += 2;
      player.hp = Math.min(player.maxHp, player.hp + 2);
    },
  },
  {
    id: "damage",
    title: "Plasma Cannons",
    description: "+1 damage per shot.",
    available: (player) => player.damage < 8,
    apply: (player) => {
      player.damage += 1;
    },
  },
  {
    id: "thrusters",
    title: "Ion Thrusters",
    description: "+22 flight speed.",
    available: (player) => player.speed < 360,
    apply: (player) => {
      player.speed += 22;
    },
  },
  {
    id: "autoloader",
    title: "Rapid Loader",
    description: "-0.018s fire delay.",
    available: (player) => player.fireInterval > 0.07,
    apply: (player) => {
      player.fireInterval = Math.max(0.07, player.fireInterval - 0.018);
    },
  },
  {
    id: "wing-cannons",
    title: "Wing Cannons",
    description: "Add 2 angled side shots.",
    available: (player) => player.spreadLevel < 2,
    apply: (player) => {
      player.spreadLevel += 1;
    },
  },
  {
    id: "piercing",
    title: "Piercing Rounds",
    description: "Shots pierce +1 target.",
    available: (player) => player.pierce < 3,
    apply: (player) => {
      player.pierce += 1;
    },
  },
  {
    id: "shield",
    title: "Shield Matrix",
    description: "Gain 1 shield charge.",
    available: (player) => player.shield < 4,
    apply: (player) => {
      player.shield += 1;
    },
  },
  {
    id: "repair",
    title: "Nano Repair",
    description: "Repair 3 hull or +1 max.",
    available: () => true,
    apply: (player) => {
      if (player.hp >= player.maxHp) {
        player.maxHp += 1;
        player.hp = player.maxHp;
        return;
      }
      player.hp = Math.min(player.maxHp, player.hp + 3);
    },
  },
  {
    id: "rail",
    title: "Rail Slugs",
    description: "+55 shot velocity.",
    available: (player) => player.projectileSpeed < 520,
    apply: (player) => {
      player.projectileSpeed += 55;
    },
  },
];

function createStars(count) {
  return Array.from({ length: count }, () => ({
    x: rand(0, WIDTH),
    y: rand(0, HEIGHT),
    speed: rand(20, 90),
    size: Math.random() > 0.7 ? 2 : 1,
    alpha: rand(0.35, 0.95),
  }));
}

function createClouds(count) {
  const colors = [
    "rgba(77, 127, 247, 0.10)",
    "rgba(255, 129, 67, 0.08)",
    "rgba(95, 209, 255, 0.06)",
  ];

  return Array.from({ length: count }, (_, index) => ({
    x: rand(-20, WIDTH - 60),
    y: rand(0, HEIGHT),
    w: rand(80, 140),
    h: rand(40, 90),
    speed: 10 + index * 6,
    color: colors[index % colors.length],
  }));
}

function getLevelXpRequirement(level) {
  return LEVEL_XP_BASE + (level - 1) * LEVEL_XP_STEP;
}

function createRunState() {
  return {
    running: false,
    gameOver: false,
    gameOverReason: "",
    elapsed: 0,
    lastFrame: 0,
    scroll: 0,
    score: 0,
    sessionBest: 0,
    bossTimer: 60,
    enemyTimer: 1.15,
    ringTimer: 2.5,
    gateTimer: 12,
    toast: "Mission ready",
    toastTimer: 999,
    flash: 0,
    shake: 0,
    level: 1,
    xp: 0,
    xpToNext: getLevelXpRequirement(1),
    pendingLevelUps: 0,
    levelUpChoices: [],
    kills: 0,
    bossesDefeated: 0,
    shipBuild: [],
    playerBullets: [],
    enemies: [],
    enemyBullets: [],
    rings: [],
    gates: [],
    particles: [],
    stars: createStars(56),
    clouds: createClouds(5),
    boss: null,
    player: createPlayer(),
  };
}

function normalizeLeaderboard(entries) {
  return entries
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value))
    .sort((left, right) => right - left)
    .slice(0, LEADERBOARD_LIMIT);
}

function loadLeaderboard() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LEADERBOARD_KEY) || "[]");
    return normalizeLeaderboard(Array.isArray(saved) ? saved : []);
  } catch (error) {
    return [];
  }
}

function saveLeaderboard() {
  try {
    window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(state.leaderboard));
  } catch (error) {
    // Ignore storage failures so the game still runs in private contexts.
  }
}

function renderLeaderboard() {
  if (!ui.leaderboard) {
    return;
  }

  if (!state.leaderboard.length) {
    ui.leaderboard.innerHTML = '<li class="leaderboard-empty">No scores yet</li>';
    return;
  }

  ui.leaderboard.innerHTML = state.leaderboard
    .map((score, index) => `
      <li class="leaderboard-item">
        <span class="leaderboard-rank">#${index + 1}</span>
        <span class="leaderboard-score">${formatScore(score)}</span>
      </li>
    `)
    .join("");
}

function recordLeaderboardScore(score) {
  if (score <= 0) {
    return;
  }

  const next = normalizeLeaderboard([...state.leaderboard, score]);
  if (
    next.length === state.leaderboard.length &&
    next.every((value, index) => value === state.leaderboard[index])
  ) {
    return;
  }

  state.leaderboard = next;
  saveLeaderboard();
  renderLeaderboard();
}

function changeScore(amount) {
  state.score += amount;

  if (state.score > state.sessionBest) {
    state.sessionBest = Math.floor(state.score);
    recordLeaderboardScore(state.sessionBest);
  }
}

function getDesiredMusicMode() {
  if (!state.running) {
    return "standby";
  }
  return state.boss ? "boss" : "patrol";
}

function syncMusicMode() {
  if (!audioHooks) {
    return;
  }
  audioHooks.setMusicMode(getDesiredMusicMode());
  updateAudioUi();
}

function armAudio() {
  if (!audioHooks) {
    return;
  }

  syncMusicMode();
  void audioHooks.unlock()
    .then(() => {
      syncMusicMode();
      updateAudioUi();
    })
    .catch(() => {
      updateAudioUi();
    });
}

function updateAudioUi() {
  if (!ui.audioButton) {
    return;
  }

  if (!audioHooks) {
    ui.audioButton.disabled = true;
    ui.audioButton.classList.remove("is-muted");
    ui.audioButton.title = "Audio unavailable";
    ui.audioButton.setAttribute("aria-label", "Audio unavailable");
    return;
  }

  const audioState = audioHooks.getState();
  if (!audioState.supported) {
    ui.audioButton.disabled = true;
    ui.audioButton.classList.remove("is-muted");
    ui.audioButton.title = "Audio unavailable";
    ui.audioButton.setAttribute("aria-label", "Audio unavailable");
    return;
  }

  if (!audioState.unlocked) {
    ui.audioButton.disabled = false;
    ui.audioButton.classList.remove("is-muted");
    ui.audioButton.title = "Turn audio on";
    ui.audioButton.setAttribute("aria-label", "Turn audio on");
    return;
  }

  ui.audioButton.disabled = false;
  ui.audioButton.classList.toggle("is-muted", audioState.muted);
  ui.audioButton.title = audioState.muted ? "Unmute audio" : "Mute audio";
  ui.audioButton.setAttribute("aria-label", audioState.muted ? "Unmute audio" : "Mute audio");
}

function showToast(message, duration = 0.9) {
  state.toast = message;
  state.toastTimer = duration;
}

function resetRun() {
  const leaderboard = state.leaderboard;
  nextActorId = 1;
  Object.assign(state, createRunState());
  state.leaderboard = leaderboard;
}

function recordShipUpgrade(upgrade) {
  const existing = state.shipBuild.find((entry) => entry.id === upgrade.id);
  if (existing) {
    existing.count += 1;
    return;
  }

  state.shipBuild.push({
    id: upgrade.id,
    title: upgrade.title,
    count: 1,
  });
}

function rollUpgradeChoices() {
  const available = SHIP_UPGRADES.filter((upgrade) => upgrade.available(state.player));
  const pool = [...available];
  const choices = [];

  while (pool.length && choices.length < 3) {
    const pickIndex = Math.floor(rand(0, pool.length));
    choices.push(pool.splice(pickIndex, 1)[0]);
  }

  return choices;
}

function openNextLevelUp() {
  if (!state.running || state.levelUpChoices.length || state.pendingLevelUps <= 0) {
    return;
  }

  state.pendingLevelUps -= 1;
  state.levelUpChoices = rollUpgradeChoices();
  if (!state.levelUpChoices.length) {
    return;
  }

  showToast(`Level ${String(state.level).padStart(2, "0")} - choose upgrade`, 1.2);
  playSfx("ring");
}

function applyUpgradeChoice(index) {
  const upgrade = state.levelUpChoices[index];
  if (!upgrade) {
    return false;
  }

  upgrade.apply(state.player, state);
  recordShipUpgrade(upgrade);
  state.levelUpChoices = [];
  showToast(`${upgrade.title} online`, 1.1);
  playSfx("start");
  openNextLevelUp();
  return true;
}

function gainExperience(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  state.xp += Math.floor(amount);
  let leveledUp = false;

  while (state.xp >= state.xpToNext) {
    state.xp -= state.xpToNext;
    state.level += 1;
    state.pendingLevelUps += 1;
    state.xpToNext = getLevelXpRequirement(state.level);
    leveledUp = true;
  }

  if (leveledUp) {
    openNextLevelUp();
  }
}

function destroyPlayer(reason = "Hull breached") {
  if (state.gameOver) {
    return;
  }

  addParticles(state.player.x, state.player.y, {
    count: 34,
    colors: ["#fff6d4", "#ff9d4d", "#ff5c57", "#7be3ff"],
    speed: 170,
    life: 1,
    size: 3,
  });
  state.player.hp = 0;
  state.running = false;
  state.gameOver = true;
  state.gameOverReason = reason;
  state.levelUpChoices = [];
  state.pendingLevelUps = 0;
  state.shake = Math.max(state.shake, 10);
  pointer.active = false;
  keys.clear();
  showToast(reason, 1.5);
  playSfx("boss-down");
  syncMusicMode();
}

function takePlayerHit({ hullDamage, scorePenalty, invuln = 0.45, reason = "Hull breached" }) {
  const player = state.player;
  if (!state.running || player.invuln > 0) {
    return "ignored";
  }

  if (player.shield > 0) {
    player.shield -= 1;
    player.invuln = Math.max(player.invuln, 0.25);
    state.flash = Math.max(state.flash, 0.08);
    playSfx("ring");
    return "shielded";
  }

  player.hp = Math.max(0, player.hp - hullDamage);
  player.invuln = Math.max(player.invuln, invuln);
  applyPenalty(scorePenalty);

  if (player.hp <= 0) {
    destroyPlayer(reason);
    return "destroyed";
  }

  return "damaged";
}

function handleAudioToggle() {
  if (!audioHooks) {
    return;
  }

  const audioState = audioHooks.getState();
  if (!audioState.unlocked) {
    syncMusicMode();
    void audioHooks.unlock()
      .then(() => {
        syncMusicMode();
        showToast("Audio armed", 0.8);
        updateAudioUi();
      })
      .catch(() => {
        updateAudioUi();
      });
    return;
  }

  audioHooks.toggleMute();
  const nextState = audioHooks.getState();
  showToast(nextState.muted ? "Audio muted" : "Audio live", 0.8);
  updateAudioUi();
}

function playSfx(name, detail) {
  if (!audioHooks) {
    return;
  }
  audioHooks.playSfx(name, detail);
}

function startGame() {
  if (state.running) {
    return;
  }

  if (state.gameOver) {
    resetRun();
  }

  state.running = true;
  showToast("Engage", 1.1);
  armAudio();
  syncMusicMode();
}

function spawnEnemy() {
  const art = ENEMY_ARTS[Math.floor(rand(0, ENEMY_ARTS.length))];
  const width = spriteWidth(art);
  const height = spriteHeight(art);
  const spawnX = rand(width / 2 + 12, WIDTH - width / 2 - 12);

  state.enemies.push({
    id: nextActorId,
    art,
    x: spawnX,
    y: -height,
    width,
    height,
    scale: art.scale,
    hp: 5,
    anchorX: spawnX,
    time: 0,
    speed: rand(58, 92),
    fireCooldown: rand(1.2, 2.4),
    waveAmp: rand(14, 34),
    waveSpeed: rand(1.2, 2.3),
    phase: rand(0, Math.PI * 2),
  });

  nextActorId += 1;
}

function spawnRing() {
  const radius = rand(12, 17);
  state.rings.push({
    x: rand(radius + 18, WIDTH - radius - 18),
    y: -radius * 2,
    radius,
    innerRadius: radius * 0.62,
    speed: rand(90, 122),
    spin: rand(0, Math.PI * 2),
    collected: false,
  });
}

function spawnGate() {
  const height = 46;
  state.gates.push({
    x: rand(114, WIDTH - 114),
    y: -height,
    height,
    speed: rand(118, 136),
    gapWidth: rand(154, 176),
    minGapWidth: rand(38, 56),
    closeSpeed: rand(32, 40),
    pulse: rand(0, Math.PI * 2),
    hit: false,
    cleared: false,
  });

  showToast("Closing gate ahead", 1.2);
  playSfx("gate-warning");
}

function spawnBoss() {
  const width = spriteWidth(BOSS_ART);
  const height = spriteHeight(BOSS_ART);

  state.gates.length = 0;
  state.boss = {
    id: nextActorId,
    art: BOSS_ART,
    x: WIDTH / 2,
    y: -height,
    width,
    height,
    scale: BOSS_ART.scale,
    hp: 10,
    maxHp: 10,
    fireCooldown: 1.2,
    time: 0,
    targetY: 96,
  };

  nextActorId += 1;

  showToast("Boss incoming", 1.8);
  state.shake = Math.max(state.shake, 6);
  playSfx("boss-incoming");
  syncMusicMode();
}

function firePlayerBullet() {
  const player = state.player;
  const shots = [{ offsetX: 0, offsetY: 0, angleOffset: 0 }];

  if (player.spreadLevel >= 1) {
    shots.push(
      { offsetX: -8, offsetY: 2, angleOffset: -0.18 },
      { offsetX: 8, offsetY: 2, angleOffset: 0.18 }
    );
  }

  if (player.spreadLevel >= 2) {
    shots.push(
      { offsetX: -14, offsetY: 4, angleOffset: -0.33 },
      { offsetX: 14, offsetY: 4, angleOffset: 0.33 }
    );
  }

  for (const shot of shots) {
    const angle = -Math.PI / 2 + shot.angleOffset;
    state.playerBullets.push({
      x: player.x + shot.offsetX,
      y: player.y - player.height / 2 + 4 + shot.offsetY,
      vx: Math.cos(angle) * player.projectileSpeed,
      vy: Math.sin(angle) * player.projectileSpeed,
      radius: player.projectileRadius + Math.floor(player.damage / 4),
      damage: player.damage,
      pierceLeft: player.pierce,
      hitTargets: [],
    });
  }

  playSfx("player-shot");
}

function fireEnemyBullet(enemy, isBoss = false) {
  const targetX = state.player.x;
  const targetY = state.player.y;
  const angle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
  const speed = isBoss ? 135 : 160;
  const spread = isBoss ? 0.22 : 0;
  const patterns = isBoss ? [-spread, 0, spread] : [0];

  for (const offset of patterns) {
    const finalAngle = angle + offset;
    state.enemyBullets.push({
      x: enemy.x + Math.cos(finalAngle) * (isBoss ? 8 : 0),
      y: enemy.y + enemy.height / 2 - 8,
      vx: Math.cos(finalAngle) * speed,
      vy: Math.sin(finalAngle) * speed,
      radius: isBoss ? 8 : 4,
      penalty: isBoss ? 45 : 18,
      boss: isBoss,
    });
  }

  playSfx("enemy-shot", { boss: isBoss });
}

function addParticles(x, y, options = {}) {
  const {
    count = 10,
    colors = ["#fff6d4", "#ff9d4d", "#78d9ff"],
    speed = 90,
    life = 0.6,
    size = 2,
  } = options;

  for (let index = 0; index < count; index += 1) {
    const angle = rand(0, Math.PI * 2);
    const velocity = rand(speed * 0.35, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: rand(life * 0.6, life),
      maxLife: life,
      size: Math.random() > 0.65 ? size + 1 : size,
      color: colors[index % colors.length],
    });
  }
}

function applyPenalty(amount) {
  changeScore(-amount);
  state.flash = Math.max(state.flash, 0.18);
  state.shake = Math.max(state.shake, 4);
  playSfx("penalty", { amount });
}

function update(dt) {
  updateBackdrop(dt);
  updateParticles(dt);

  if (state.flash > 0) {
    state.flash = Math.max(0, state.flash - dt);
  }

  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 22);
  }

  if (state.toastTimer > 0) {
    state.toastTimer = Math.max(0, state.toastTimer - dt);
  }

  if (!state.running) {
    syncHud();
    return;
  }

  if (state.levelUpChoices.length) {
    syncHud();
    return;
  }

  state.elapsed += dt;
  updatePlayer(dt);
  updateGates(dt);
  updateRings(dt);
  updateEnemies(dt);
  updateBoss(dt);
  updatePlayerBullets(dt);
  updateEnemyBullets(dt);
  syncHud();
}

function updateBackdrop(dt) {
  state.scroll += dt;

  for (const star of state.stars) {
    star.y += star.speed * dt;
    if (star.y > HEIGHT + 4) {
      star.y = -4;
      star.x = rand(0, WIDTH);
    }
  }

  for (const cloud of state.clouds) {
    cloud.y += cloud.speed * dt;
    if (cloud.y > HEIGHT + 60) {
      cloud.y = -cloud.h;
      cloud.x = rand(-20, WIDTH - cloud.w + 20);
    }
  }
}

function updateParticles(dt) {
  for (let index = state.particles.length - 1; index >= 0; index -= 1) {
    const particle = state.particles[index];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;

    if (particle.life <= 0) {
      state.particles.splice(index, 1);
    }
  }
}

function updatePlayer(dt) {
  const player = state.player;

  if (player.invuln > 0) {
    player.invuln = Math.max(0, player.invuln - dt);
  }

  const moveX = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) -
    (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
  const moveY = (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0) -
    (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0);

  player.x += moveX * player.speed * dt;
  player.y += moveY * player.speed * dt;

  if (pointer.active) {
    player.x += (pointer.x - player.x) * Math.min(1, dt * 12);
    player.y += (pointer.y - player.y) * Math.min(1, dt * 12);
  }

  const marginX = player.width / 2 + 12;
  const marginY = player.height / 2 + 10;

  player.x = clamp(player.x, marginX, WIDTH - marginX);
  player.y = clamp(player.y, HEIGHT * 0.48, HEIGHT - marginY);

  player.fireCooldown -= dt;
  const wantsFire = pointer.active || keys.has("Space") || keys.has("KeyZ");
  if (wantsFire && player.fireCooldown <= 0) {
    firePlayerBullet();
    player.fireCooldown = player.fireInterval;
  }
}

function updateRings(dt) {
  if (!state.boss && !state.gates.length) {
    state.ringTimer -= dt;
    if (state.ringTimer <= 0) {
      spawnRing();
      state.ringTimer = rand(3.1, 4.8);
    }
  }

  for (let index = state.rings.length - 1; index >= 0; index -= 1) {
    const ring = state.rings[index];
    ring.y += ring.speed * dt;
    ring.spin += dt * 2.4;

    const distance = Math.hypot(state.player.x - ring.x, state.player.y - ring.y);
    if (!ring.collected && distance < ring.innerRadius) {
      ring.collected = true;
      changeScore(90);
      showToast("Ring bonus +90", 0.9);
      addParticles(ring.x, ring.y, {
        count: 18,
        colors: ["#fff6d4", "#ffd36a", "#ff9f54"],
        speed: 80,
        life: 0.7,
      });
      playSfx("ring");
      state.rings.splice(index, 1);
      continue;
    }

    if (ring.y - ring.radius > HEIGHT + 24) {
      state.rings.splice(index, 1);
    }
  }
}

function updateGates(dt) {
  if (!state.boss && !state.gates.length) {
    state.gateTimer -= dt;
    if (state.gateTimer <= 0) {
      spawnGate();
      state.gateTimer = rand(18, 26);
    }
  }

  for (let index = state.gates.length - 1; index >= 0; index -= 1) {
    const gate = state.gates[index];
    gate.y += gate.speed * dt;
    gate.gapWidth = Math.max(gate.minGapWidth, gate.gapWidth - gate.closeSpeed * dt);
    gate.pulse += dt * 5.5;

    if (!gate.hit && gateHitPlayer(gate, state.player)) {
      gate.hit = true;
      state.player.y = clamp(
        gate.y + gate.height / 2 + state.player.height / 2 + 10,
        HEIGHT * 0.48,
        HEIGHT - state.player.height / 2 - 10
      );
      addParticles(state.player.x, gate.y, {
        count: 24,
        colors: ["#fff6d4", "#ffcb68", "#ff7a36"],
        speed: 120,
        life: 0.8,
        size: 2,
      });
      const hitResult = takePlayerHit({
        hullDamage: 2,
        scorePenalty: 120,
        invuln: 0.8,
        reason: "Ship crushed",
      });
      showToast(hitResult === "shielded" ? "Shield blocked gate" : "Gate crush -120", 1.2);
      playSfx("gate-crush");
    }

    if (!gate.cleared && gate.y - gate.height / 2 > state.player.y + state.player.height / 2 + 10) {
      gate.cleared = true;
      if (!gate.hit) {
        showToast("Gate cleared", 0.9);
      }
    }

    if (gate.y - gate.height / 2 > HEIGHT + 36) {
      state.gates.splice(index, 1);
    }
  }
}

function updateEnemies(dt) {
  if (!state.boss && !state.gates.length) {
    state.enemyTimer -= dt;
    if (state.enemyTimer <= 0) {
      spawnEnemy();
      state.enemyTimer = rand(0.9, 1.6);
    }
  }

  for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = state.enemies[index];
    enemy.time += dt;
    enemy.y += enemy.speed * dt;
    enemy.x = enemy.anchorX + Math.sin(enemy.time * enemy.waveSpeed + enemy.phase) * enemy.waveAmp;
    enemy.x = clamp(enemy.x, enemy.width / 2 + 8, WIDTH - enemy.width / 2 - 8);

    enemy.fireCooldown -= dt;
    if (enemy.fireCooldown <= 0) {
      fireEnemyBullet(enemy, false);
      enemy.fireCooldown = rand(1.5, 2.7);
    }

    if (rectHit(state.player, enemy, 0.58, 0.62)) {
      state.enemies.splice(index, 1);
      addParticles(enemy.x, enemy.y, {
        count: 14,
        colors: ["#ff8f57", "#ffd36a", "#a23c57"],
        speed: 110,
      });
      takePlayerHit({
        hullDamage: 2,
        scorePenalty: 30,
        invuln: 0.55,
        reason: "Hull breached",
      });
      continue;
    }

    if (enemy.y - enemy.height / 2 > HEIGHT + 20) {
      state.enemies.splice(index, 1);
      applyPenalty(70);
    }
  }
}

function updateBoss(dt) {
  if (!state.boss) {
    state.bossTimer -= dt;
    if (state.bossTimer <= 0) {
      spawnBoss();
      state.bossTimer = 60;
    }
    return;
  }

  const boss = state.boss;
  boss.time += dt;

  if (boss.y < boss.targetY) {
    boss.y += 72 * dt;
  } else {
    boss.x = WIDTH / 2 + Math.sin(boss.time * 0.95) * 84;
  }

  boss.fireCooldown -= dt;
  if (boss.fireCooldown <= 0 && boss.y >= boss.targetY) {
    fireEnemyBullet(boss, true);
    boss.fireCooldown = 1.28;
  }

  if (rectHit(state.player, boss, 0.55, 0.42) && state.player.invuln <= 0) {
    takePlayerHit({
      hullDamage: 2,
      scorePenalty: 45,
      invuln: 0.7,
      reason: "Boss impact",
    });
  }
}

function updatePlayerBullets(dt) {
  for (let bulletIndex = state.playerBullets.length - 1; bulletIndex >= 0; bulletIndex -= 1) {
    const bullet = state.playerBullets[bulletIndex];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    let consumed = false;

    if (
      state.boss &&
      !bullet.hitTargets.includes(state.boss.id) &&
      circleRectHit(bullet, state.boss, 0.72, 0.6)
    ) {
      consumed = true;
      bullet.hitTargets.push(state.boss.id);
      state.boss.hp -= bullet.damage;
      addParticles(bullet.x, bullet.y, {
        count: 8,
        colors: ["#d5e9ff", "#83d7ff", "#6e7cff"],
        speed: 70,
        life: 0.35,
        size: 1,
      });
      playSfx("boss-hit");

      if (state.boss.hp <= 0) {
        addParticles(state.boss.x, state.boss.y, {
          count: 42,
          colors: ["#fff6d4", "#ff9d4d", "#ff5c57", "#7be3ff"],
          speed: 160,
          life: 1.1,
          size: 3,
        });
        state.bossesDefeated += 1;
        changeScore(1000);
        gainExperience(120);
        showToast("Boss down +1000", 1.4);
        state.shake = 10;
        state.boss = null;
        playSfx("boss-down");
        syncMusicMode();
      }
    }

    if (!consumed) {
      for (let enemyIndex = state.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = state.enemies[enemyIndex];
        if (
          bullet.hitTargets.includes(enemy.id) ||
          !circleRectHit(bullet, enemy, 0.78, 0.7)
        ) {
          continue;
        }

        bullet.hitTargets.push(enemy.id);
        enemy.hp -= bullet.damage;
        addParticles(bullet.x, bullet.y, {
          count: 5,
          colors: ["#d5e9ff", "#83d7ff", "#6e7cff"],
          speed: 62,
          life: 0.28,
          size: 1,
        });

        if (enemy.hp <= 0) {
          state.enemies.splice(enemyIndex, 1);
          state.kills += 1;
          changeScore(140);
          gainExperience(30);
          addParticles(enemy.x, enemy.y, {
            count: 18,
            colors: ["#fff6d4", "#ff9d4d", "#ff5c57"],
            speed: 130,
            life: 0.85,
            size: 2,
          });
          playSfx("enemy-down");
        } else {
          playSfx("enemy-hit");
        }

        if (bullet.pierceLeft <= 0) {
          consumed = true;
          break;
        }

        bullet.pierceLeft -= 1;
      }
    }

    if (
      consumed ||
      bullet.y < -12 ||
      bullet.y > HEIGHT + 12 ||
      bullet.x < -12 ||
      bullet.x > WIDTH + 12
    ) {
      state.playerBullets.splice(bulletIndex, 1);
    }
  }
}

function updateEnemyBullets(dt) {
  for (let index = state.enemyBullets.length - 1; index >= 0; index -= 1) {
    const bullet = state.enemyBullets[index];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    if (circleRectHit(bullet, state.player, 0.48, 0.46)) {
      state.enemyBullets.splice(index, 1);
      addParticles(bullet.x, bullet.y, {
        count: bullet.boss ? 14 : 8,
        colors: bullet.boss
          ? ["#fff6d4", "#ffb04f", "#ff5c57"]
          : ["#ffd36a", "#ff9d4d", "#a23c57"],
        speed: bullet.boss ? 125 : 90,
        life: bullet.boss ? 0.7 : 0.45,
      });

      takePlayerHit({
        hullDamage: bullet.boss ? 2 : 1,
        scorePenalty: bullet.penalty,
        invuln: bullet.boss ? 0.65 : 0.4,
        reason: bullet.boss ? "Boss barrage" : "Hull breached",
      });
      continue;
    }

    if (
      bullet.y < -20 ||
      bullet.y > HEIGHT + 20 ||
      bullet.x < -20 ||
      bullet.x > WIDTH + 20
    ) {
      state.enemyBullets.splice(index, 1);
    }
  }
}

function syncHud() {
  ui.score.textContent = formatScore(state.score);
  ui.phase.textContent = !state.running
    ? state.gameOver
      ? "Debrief"
      : "Stand By"
    : state.levelUpChoices.length
      ? "Upgrade Bay"
      : state.boss
        ? "Boss Assault"
        : state.gates.length
          ? "Gate Run"
          : `Sector ${String(Math.floor(state.elapsed / 20) + 1).padStart(2, "0")}`;
  ui.boss.textContent = state.boss
    ? `${state.boss.hp}/${state.boss.maxHp} HP`
    : state.levelUpChoices.length
      ? `Lv ${String(state.level).padStart(2, "0")}`
      : state.gameOver
        ? "Retry"
        : formatClock(state.bossTimer);
}

function draw() {
  const shakeX = state.shake > 0 ? rand(-state.shake, state.shake) : 0;
  const shakeY = state.shake > 0 ? rand(-state.shake, state.shake) : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawBackdrop();
  drawRings();
  drawShips();
  drawGates();
  drawBullets();
  drawParticlesLayer();
  drawCanvasHud();

  if (state.levelUpChoices.length) {
    drawLevelUpOverlay();
  } else if (!state.running) {
    drawOverlay();
  }

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255, 214, 110, ${state.flash * 0.35})`;
    ctx.fillRect(-16, -16, WIDTH + 32, HEIGHT + 32);
  }

  ctx.restore();
}

function drawBackdrop() {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#0d1022");
  sky.addColorStop(0.45, "#091223");
  sky.addColorStop(1, "#04060d");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (const cloud of state.clouds) {
    ctx.fillStyle = cloud.color;
    ctx.beginPath();
    ctx.ellipse(cloud.x + cloud.w / 2, cloud.y + cloud.h / 2, cloud.w / 2, cloud.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(123, 227, 255, 0.12)";
  ctx.lineWidth = 1;
  const scroll = state.scroll * 90;

  for (let line = -2; line < 20; line += 1) {
    const y = ((line * 36 + scroll) % (HEIGHT + 40)) - 40;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y + 18);
    ctx.stroke();
  }

  for (let line = -4; line < 8; line += 1) {
    const x = ((line * 54 + scroll * 0.35) % (WIDTH + 120)) - 60;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 88, HEIGHT);
    ctx.stroke();
  }

  for (const star of state.stars) {
    ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
    ctx.fillRect(Math.round(star.x), Math.round(star.y), star.size, star.size);
  }
}

function drawRings() {
  for (const ring of state.rings) {
    const pulse = 1 + Math.sin(ring.spin * 2) * 0.08;
    drawPixelRing(ring.x, ring.y, ring.radius * pulse, ring.spin);
  }
}

function drawGates() {
  for (const gate of state.gates) {
    const gateTop = gate.y - gate.height / 2;
    const gapLeft = gate.x - gate.gapWidth / 2;
    const gapRight = gate.x + gate.gapWidth / 2;
    const pulse = 0.65 + (Math.sin(gate.pulse) + 1) * 0.18;

    drawGateSegment(0, gateTop, gapLeft, gate.height, pulse, gate.hit);
    drawGateSegment(gapRight, gateTop, WIDTH - gapRight, gate.height, pulse, gate.hit);

    ctx.fillStyle = gate.hit ? "#ff7a36" : "#ffd36a";
    ctx.fillRect(Math.round(gapLeft - 4), Math.round(gateTop), 4, gate.height);
    ctx.fillRect(Math.round(gapRight), Math.round(gateTop), 4, gate.height);

    ctx.fillStyle = `rgba(255, 211, 106, ${pulse * 0.3})`;
    ctx.fillRect(Math.round(gapLeft + 4), Math.round(gateTop + 6), Math.max(0, gate.gapWidth - 8), 4);
    ctx.fillRect(Math.round(gapLeft + 4), Math.round(gateTop + gate.height - 10), Math.max(0, gate.gapWidth - 8), 4);
  }
}

function drawShips() {
  for (const enemy of state.enemies) {
    drawThruster(enemy.x, enemy.y + enemy.height / 2 - 1, 4, enemy.art.thruster, 4);
    drawPixelSprite(enemy.art.sprite, enemy.art.palette, enemy.x - enemy.width / 2, enemy.y - enemy.height / 2, enemy.scale);
  }

  if (state.boss) {
    drawThruster(state.boss.x - 18, state.boss.y + state.boss.height / 2 - 4, 9, state.boss.art.thruster, 6);
    drawThruster(state.boss.x + 18, state.boss.y + state.boss.height / 2 - 4, 9, state.boss.art.thruster, 6);
    drawPixelSprite(state.boss.art.sprite, state.boss.art.palette, state.boss.x - state.boss.width / 2, state.boss.y - state.boss.height / 2, state.boss.scale);
  }

  if (state.player.invuln <= 0 || Math.floor(state.player.invuln * 18) % 2 === 0) {
    drawThruster(state.player.x, state.player.y + state.player.height / 2 - 1, 6, state.player.art.thruster, 5);
    drawPixelSprite(state.player.art.sprite, state.player.art.palette, state.player.x - state.player.width / 2, state.player.y - state.player.height / 2, state.player.scale);
  }
}

function drawBullets() {
  for (const bullet of state.playerBullets) {
    drawPixelOrb(bullet.x, bullet.y, bullet.radius, {
      outer: "#8e9db5",
      mid: "#6b86ff",
      core: "#eef7ff",
    });
  }

  for (const bullet of state.enemyBullets) {
    drawPixelOrb(bullet.x, bullet.y, bullet.radius, bullet.boss
      ? { outer: "#8b2335", mid: "#ff8f32", core: "#fff0a8" }
      : { outer: "#71243c", mid: "#ff7a36", core: "#ffe088" });
  }
}

function drawParticlesLayer() {
  for (const particle of state.particles) {
    ctx.globalAlpha = particle.life / particle.maxLife;
    ctx.fillStyle = particle.color;
    ctx.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function drawCanvasHud() {
  ctx.textAlign = "left";
  const hullBarW = 74;
  const hullBarFill = (state.player.hp / state.player.maxHp) * hullBarW;

  ctx.fillStyle = "rgba(3, 7, 16, 0.72)";
  ctx.fillRect(8, 8, 80, 40);
  ctx.fillStyle = "#fff6d4";
  ctx.font = '10px "Lucida Console", monospace';
  ctx.fillText(`HULL ${state.player.hp}/${state.player.maxHp}`, 12, 20);
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.fillRect(11, 25, hullBarW, 8);
  ctx.fillStyle = "#7be3ff";
  ctx.fillRect(11, 25, hullBarFill, 8);
  ctx.strokeStyle = "#fff6d4";
  ctx.strokeRect(11.5, 25.5, hullBarW - 1, 7);

  if (state.player.shield > 0) {
    ctx.fillStyle = "#9cecff";
    ctx.fillText("SHD", 12, 43);
    for (let index = 0; index < state.player.shield; index += 1) {
      ctx.fillRect(35 + index * 9, 37, 6, 6);
    }
  }

  if (state.boss) {
    const barX = 94;
    const barY = 10;
    const barW = 132;
    const barH = 12;
    const fill = (state.boss.hp / state.boss.maxHp) * barW;

    ctx.fillStyle = "rgba(3, 7, 16, 0.72)";
    ctx.fillRect(barX - 10, barY - 4, barW + 20, barH + 14);
    ctx.fillStyle = "#fff6d4";
    ctx.font = '10px "Lucida Console", monospace';
    ctx.textAlign = "center";
    ctx.fillText("BOSS", WIDTH / 2, barY + 4);
    ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
    ctx.fillRect(barX, barY + 8, barW, barH);
    ctx.fillStyle = "#ff8f32";
    ctx.fillRect(barX, barY + 8, fill, barH);
    ctx.strokeStyle = "#fff6d4";
    ctx.strokeRect(barX + 0.5, barY + 8.5, barW - 1, barH - 1);
    ctx.textAlign = "left";
  }

  const xpBarX = 12;
  const xpBarY = HEIGHT - 18;
  const xpBarW = WIDTH - 24;
  const xpFill = (state.xp / state.xpToNext) * xpBarW;

  ctx.fillStyle = "rgba(3, 7, 16, 0.72)";
  ctx.fillRect(xpBarX - 4, xpBarY - 18, xpBarW + 8, 24);
  ctx.fillStyle = "#fff6d4";
  ctx.fillText(`LV ${String(state.level).padStart(2, "0")}`, xpBarX, xpBarY - 8);
  ctx.textAlign = "right";
  ctx.fillText(`${state.xp}/${state.xpToNext} XP`, xpBarX + xpBarW, xpBarY - 8);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(xpBarX, xpBarY, xpBarW, 8);
  ctx.fillStyle = "#ffd36a";
  ctx.fillRect(xpBarX, xpBarY, xpFill, 8);
  ctx.strokeStyle = "#fff6d4";
  ctx.strokeRect(xpBarX + 0.5, xpBarY + 0.5, xpBarW - 1, 7);

  if (state.toast && state.toastTimer > 0) {
    ctx.fillStyle = "rgba(3, 7, 16, 0.72)";
    ctx.fillRect(40, HEIGHT - 62, WIDTH - 80, 24);
    ctx.fillStyle = "#ffd36a";
    ctx.textAlign = "center";
    ctx.fillText(state.toast.toUpperCase(), WIDTH / 2, HEIGHT - 46);
    ctx.textAlign = "left";
  }
}

function drawOverlay() {
  if (state.gameOver) {
    drawGameOverOverlay();
    return;
  }

  ctx.fillStyle = "rgba(4, 7, 14, 0.74)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const cardX = 20;
  const cardY = 108;
  const cardW = WIDTH - 40;
  const cardH = 350;

  ctx.fillStyle = "rgba(7, 17, 30, 0.92)";
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.strokeStyle = "#e6be59";
  ctx.lineWidth = 2;
  ctx.strokeRect(cardX + 1, cardY + 1, cardW - 2, cardH - 2);

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff6d4";
  ctx.font = '22px "Impact", sans-serif';
  ctx.fillText("MISSION BRIEF", WIDTH / 2, cardY + 34);

  ctx.font = '11px "Lucida Console", monospace';
  const lines = [
    "Destroy enemies for score and XP.",
    "Full XP bar = pick 1 of 3 upgrades.",
    "Upgrade ideas: hull, damage, speed.",
    "Also: fire rate, wing cannons,",
    "piercing rounds, shields, rail slugs.",
    "If hull hits zero, the run ends.",
    "",
    "Move: Arrows / WASD / drag",
    "Fire: Space / Z / hold touch",
    "Upgrade: 1 / 2 / 3 or tap card",
    "Mute: top-right icon or M key",
    "",
    "Press move, fire, or touch to begin.",
  ];

  lines.forEach((line, index) => {
    ctx.fillStyle = line.startsWith("Move:") || line.startsWith("Fire:") || line.startsWith("Mute:") || line.startsWith("Upgrade:")
      ? "#7be3ff"
      : "#eef5ff";
    if (!line) {
      return;
    }
    ctx.fillText(line, WIDTH / 2, cardY + 72 + index * 20);
  });
  ctx.textAlign = "left";
}

function drawGameOverOverlay() {
  ctx.fillStyle = "rgba(4, 7, 14, 0.78)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const cardX = 24;
  const cardY = 114;
  const cardW = WIDTH - 48;
  const cardH = 340;

  ctx.fillStyle = "rgba(7, 17, 30, 0.94)";
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.strokeStyle = "#e6be59";
  ctx.lineWidth = 2;
  ctx.strokeRect(cardX + 1, cardY + 1, cardW - 2, cardH - 2);

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff6d4";
  ctx.font = '22px "Impact", sans-serif';
  ctx.fillText("RUN OVER", WIDTH / 2, cardY + 34);
  ctx.font = '10px "Lucida Console", monospace';
  ctx.fillStyle = "#ffb04f";
  ctx.fillText(state.gameOverReason.toUpperCase(), WIDTH / 2, cardY + 54);

  const summary = [
    `Score ${formatScore(state.score)}`,
    `Level ${String(state.level).padStart(2, "0")}`,
    `Kills ${String(state.kills).padStart(2, "0")}`,
    `Bosses ${String(state.bossesDefeated).padStart(2, "0")}`,
  ];

  summary.forEach((line, index) => {
    ctx.fillStyle = "#eef5ff";
    ctx.fillText(line, WIDTH / 2, cardY + 90 + index * 20);
  });

  ctx.fillStyle = "#7be3ff";
  ctx.fillText("SHIP BUILD", WIDTH / 2, cardY + 184);

  const buildLines = state.shipBuild.length
    ? state.shipBuild
      .slice(0, 5)
      .map((entry) => `${entry.title} x${entry.count}`)
    : ["Base frame only"];

  buildLines.forEach((line, index) => {
    ctx.fillStyle = "#eef5ff";
    ctx.fillText(line, WIDTH / 2, cardY + 210 + index * 20);
  });

  ctx.fillStyle = "#ffd36a";
  ctx.fillText("Press move, fire, or touch to relaunch.", WIDTH / 2, cardY + cardH - 22);
  ctx.textAlign = "left";
}

function getUpgradeCardRects() {
  const width = 82;
  const height = 130;
  const gap = 8;
  const total = width * 3 + gap * 2;
  const startX = Math.round((WIDTH - total) / 2);
  const y = 248;

  return Array.from({ length: 3 }, (_, index) => ({
    x: startX + index * (width + gap),
    y,
    width,
    height,
  }));
}

function drawLevelUpOverlay() {
  ctx.fillStyle = "rgba(4, 7, 14, 0.78)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const cardX = 18;
  const cardY = 154;
  const cardW = WIDTH - 36;
  const cardH = 264;

  ctx.fillStyle = "rgba(7, 17, 30, 0.94)";
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.strokeStyle = "#e6be59";
  ctx.lineWidth = 2;
  ctx.strokeRect(cardX + 1, cardY + 1, cardW - 2, cardH - 2);

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff6d4";
  ctx.font = '22px "Impact", sans-serif';
  ctx.fillText(`LEVEL ${String(state.level).padStart(2, "0")}`, WIDTH / 2, cardY + 34);
  ctx.font = '10px "Lucida Console", monospace';
  ctx.fillStyle = "#7be3ff";
  ctx.fillText("Choose one ship upgrade", WIDTH / 2, cardY + 54);

  const rects = getUpgradeCardRects();
  state.levelUpChoices.forEach((upgrade, index) => {
    drawUpgradeChoiceCard(upgrade, rects[index], index);
  });

  ctx.fillStyle = "#ffd36a";
  ctx.fillText("Press 1, 2, 3 or tap a card", WIDTH / 2, cardY + cardH - 18);
  ctx.textAlign = "left";
}

function drawUpgradeChoiceCard(upgrade, rect, index) {
  ctx.fillStyle = "rgba(10, 21, 35, 0.96)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = index === 0 ? "#ffd36a" : "#7be3ff";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);

  ctx.fillStyle = "#ffd36a";
  ctx.font = '11px "Lucida Console", monospace';
  ctx.fillText(String(index + 1), rect.x + 8, rect.y + 14);

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff6d4";
  ctx.font = '12px "Impact", sans-serif';
  drawWrappedText(upgrade.title.toUpperCase(), rect.x + rect.width / 2, rect.y + 28, rect.width - 14, 14, 2, "center");

  ctx.fillStyle = "#eef5ff";
  ctx.font = '9px "Lucida Console", monospace';
  drawWrappedText(upgrade.description, rect.x + 7, rect.y + 78, rect.width - 14, 12, 4, "left");
  ctx.textAlign = "left";
}

function drawWrappedText(text, x, y, maxWidth, lineHeight, maxLines = Infinity, align = "left") {
  const words = text.split(" ");
  let line = "";
  let lineCount = 0;

  ctx.textAlign = align;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth || !line) {
      line = testLine;
      continue;
    }

    ctx.fillText(line, x, y + lineCount * lineHeight);
    lineCount += 1;
    if (lineCount >= maxLines) {
      return lineCount;
    }
    line = word;
  }

  if (line && lineCount < maxLines) {
    ctx.fillText(line, x, y + lineCount * lineHeight);
    lineCount += 1;
  }

  return lineCount;
}

function drawPixelSprite(sprite, palette, x, y, scale) {
  for (let row = 0; row < sprite.length; row += 1) {
    for (let col = 0; col < sprite[row].length; col += 1) {
      const pixel = sprite[row][col];
      if (pixel === ".") {
        continue;
      }

      ctx.fillStyle = palette[pixel];
      ctx.fillRect(Math.round(x + col * scale), Math.round(y + row * scale), scale, scale);
    }
  }
}

function drawThruster(x, y, length, colors, width = 4) {
  const flicker = 0.75 + Math.random() * 0.5;
  const outerWidth = Math.max(2, width);
  const innerWidth = Math.max(1, Math.floor(width * 0.5));
  ctx.fillStyle = colors[0];
  ctx.fillRect(Math.round(x - outerWidth / 2), Math.round(y), outerWidth, Math.round(length * flicker));
  ctx.fillStyle = colors[1];
  ctx.fillRect(Math.round(x - innerWidth / 2), Math.round(y + 1), innerWidth, Math.round(length * 0.7 * flicker));
}

function drawGateSegment(x, y, width, height, pulse, damaged) {
  if (width <= 0) {
    return;
  }

  ctx.fillStyle = damaged ? "#6f253c" : "#2d3c63";
  ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(width), height);

  ctx.fillStyle = damaged ? "#ff7a36" : "#5f78c2";
  ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(width), 6);
  ctx.fillRect(Math.round(x), Math.round(y + height - 6), Math.ceil(width), 6);

  for (let stripe = -height; stripe < width + height; stripe += 14) {
    ctx.fillStyle = stripe % 28 === 0 ? `rgba(255, 211, 106, ${pulse})` : "rgba(7, 17, 30, 0.64)";
    ctx.beginPath();
    ctx.moveTo(x + stripe, y + height);
    ctx.lineTo(x + stripe + 8, y + height);
    ctx.lineTo(x + stripe + height + 8, y);
    ctx.lineTo(x + stripe + height, y);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  for (let bolt = 8; bolt < width - 6; bolt += 18) {
    ctx.fillRect(Math.round(x + bolt), Math.round(y + 10), 3, 3);
    ctx.fillRect(Math.round(x + bolt), Math.round(y + height - 13), 3, 3);
  }
}

function drawPixelRing(x, y, radius, spin) {
  const steps = 28;
  for (let step = 0; step < steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2 + spin * 0.16;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius * 0.96;
    const topHalf = py < y;
    ctx.fillStyle = topHalf ? "#fff4bf" : step % 2 === 0 ? "#ffcb68" : "#d67d32";
    ctx.fillRect(Math.round(px - 1), Math.round(py - 1), 3, 3);
  }

  ctx.fillStyle = "rgba(255, 245, 189, 0.32)";
  ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4);
}

function drawPixelOrb(x, y, radius, colors) {
  const extent = Math.ceil(radius);
  for (let py = -extent; py <= extent; py += 1) {
    for (let px = -extent; px <= extent; px += 1) {
      const distance = Math.hypot(px, py);
      if (distance > radius) {
        continue;
      }

      if (distance < radius * 0.38) {
        ctx.fillStyle = colors.core;
      } else if (distance < radius * 0.72) {
        ctx.fillStyle = colors.mid;
      } else {
        ctx.fillStyle = colors.outer;
      }

      ctx.fillRect(Math.round(x + px), Math.round(y + py), 1, 1);
    }
  }
}

function circleRectHit(circle, rect, widthFactor = 1, heightFactor = 1) {
  const halfWidth = (rect.width * widthFactor) / 2;
  const halfHeight = (rect.height * heightFactor) / 2;
  const dx = Math.abs(circle.x - rect.x);
  const dy = Math.abs(circle.y - rect.y);

  if (dx > halfWidth + circle.radius || dy > halfHeight + circle.radius) {
    return false;
  }

  if (dx <= halfWidth || dy <= halfHeight) {
    return true;
  }

  const cornerDistanceSq = (dx - halfWidth) ** 2 + (dy - halfHeight) ** 2;
  return cornerDistanceSq <= circle.radius ** 2;
}

function rectHit(a, b, widthFactor = 1, heightFactor = 1) {
  return (
    Math.abs(a.x - b.x) < (a.width * widthFactor) / 2 + (b.width * widthFactor) / 2 &&
    Math.abs(a.y - b.y) < (a.height * heightFactor) / 2 + (b.height * heightFactor) / 2
  );
}

function gateHitPlayer(gate, player) {
  const playerWidth = player.width * 0.56;
  const playerHeight = player.height * 0.58;
  const playerLeft = player.x - playerWidth / 2;
  const playerRight = player.x + playerWidth / 2;
  const playerTop = player.y - playerHeight / 2;
  const playerBottom = player.y + playerHeight / 2;
  const gateTop = gate.y - gate.height / 2;
  const gateBottom = gate.y + gate.height / 2;
  const gapLeft = gate.x - gate.gapWidth / 2;
  const gapRight = gate.x + gate.gapWidth / 2;

  if (playerBottom < gateTop || playerTop > gateBottom) {
    return false;
  }

  return playerLeft < gapLeft || playerRight > gapRight;
}

function formatClock(timeSeconds) {
  const seconds = Math.max(0, Math.ceil(timeSeconds));
  const minutes = Math.floor(seconds / 60);
  const secondsPart = String(seconds % 60).padStart(2, "0");
  return `${String(minutes).padStart(2, "0")}:${secondsPart}`;
}

function formatScore(score) {
  if (score >= 0) {
    return String(Math.floor(score)).padStart(6, "0");
  }
  return `-${String(Math.abs(Math.floor(score))).padStart(5, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function syncPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * WIDTH;
  pointer.y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
}

function wantsToStart(code) {
  return [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyZ",
    "Space",
  ].includes(code);
}

function getUpgradeIndexFromCode(code) {
  switch (code) {
    case "Digit1":
    case "Numpad1":
      return 0;
    case "Digit2":
    case "Numpad2":
      return 1;
    case "Digit3":
    case "Numpad3":
      return 2;
    default:
      return null;
  }
}

function tryPointerUpgradeChoice(x, y) {
  const rects = getUpgradeCardRects();
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index];
    const insideX = x >= rect.x && x <= rect.x + rect.width;
    const insideY = y >= rect.y && y <= rect.y + rect.height;
    if (insideX && insideY) {
      return applyUpgradeChoice(index);
    }
  }

  return false;
}

document.addEventListener("keydown", (event) => {
  if (event.code === "KeyM" && !event.repeat) {
    event.preventDefault();
    handleAudioToggle();
    return;
  }

  if (state.levelUpChoices.length) {
    const choiceIndex = getUpgradeIndexFromCode(event.code);
    if (choiceIndex !== null) {
      event.preventDefault();
      applyUpgradeChoice(choiceIndex);
    }
    return;
  }

  if (wantsToStart(event.code)) {
    event.preventDefault();
    startGame();
  }
  keys.add(event.code);
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

canvas.addEventListener("pointerdown", (event) => {
  syncPointerPosition(event);
  if (state.levelUpChoices.length) {
    tryPointerUpgradeChoice(pointer.x, pointer.y);
    return;
  }
  pointer.active = true;
  startGame();
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointer.active) {
    return;
  }
  syncPointerPosition(event);
});

window.addEventListener("pointerup", () => {
  pointer.active = false;
});

window.addEventListener("pointercancel", () => {
  pointer.active = false;
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    state.lastFrame = 0;
    pointer.active = false;
    if (audioHooks) {
      void audioHooks.suspend();
    }
    return;
  }

  if (audioHooks) {
    void audioHooks.resume()
      .then(() => {
        syncMusicMode();
        updateAudioUi();
      })
      .catch(() => {
        updateAudioUi();
      });
  }
});

function frame(timestamp) {
  if (!state.lastFrame) {
    state.lastFrame = timestamp;
  }

  const dt = Math.min(0.05, (timestamp - state.lastFrame) / 1000);
  state.lastFrame = timestamp;

  update(dt);
  draw();

  window.requestAnimationFrame(frame);
}

syncHud();
renderLeaderboard();
updateAudioUi();
window.requestAnimationFrame(frame);
