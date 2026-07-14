(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const shell = document.querySelector(".game-shell");

  const VIEW_W = 1280;
  const VIEW_H = 720;
  const WORLD_W = 8600;
  const GROUND_Y = 616;
  const SURFACE_Y = GROUND_Y - 30;
  const TILE = 64;
  const GRAVITY = 2200;
  const MOVE_ACCEL = 2700;
  const MAX_SPEED = 430;
  const FRICTION = 2600;
  const JUMP_SPEED = 1020;
  const SOCCER_KICK_SPEED = 760;
  const HOTDOG_SHOT_SPEED = 420;
  const HOTDOG_SHOT_RANGE = 700;
  const HOTDOG_SHOT_INTERVAL = 2.6;
  const KICKED_MONSTER_DURATION = 1.35;
  const KICKED_MONSTER_FADE_START = 0.88;
  const FRAME_DT = 1 / 60;
  const PLAYER_START_X = 128;
  const PLAYER_W = 72;
  const PLAYER_H = 112;
  const PLAYER_VISUAL_HEIGHT = 138;
  const PLAYER_POWER_SCALE = 1.5;
  const PLAYER_CROUCH_HEIGHT_SCALE = 0.82;
  const SHOW_PARTICLE_SPLASHES = false;
  const BUILD_ID = "mobile-joystick-2026-07-14-16";
  const FRAME_ASSET_VERSION = BUILD_ID;
  const ART_ROOT = "extracted_game_art_elements";
  const LEVEL_BACKDROP_FILE = "assets/level_backdrop.png";
  const SHOW_CHARACTER_SELECTOR = true;
  const SHOW_RESPONSE_LABEL = false;
  const TEMP_HIDDEN_CHARACTER_IDS = new Set(["pilot"]);
  const PENALTY_PAGE = "penaltykick.html?from=runner";
  const PENALTY_RESULT_KEY = "dpaiPenaltyResult";
  const PENALTY_RUNNER_SCORE_KEY = "dpaiRunnerScore";
  const PENALTY_RUNNER_STATE_KEY = "dpaiRunnerState";
  const PENALTY_RETURN_KEY = "dpaiPenaltyReturn";
  const AUTOSAVE_KEY = "dpaiRunnerAutosave";
  let selectedCharacterIndex = 0;
  let resetConfirmReturnMode = null;
  const assetStatus = new Map();

  const state = {
    mode: "title",
    cameraX: 0,
    score: 0,
    lives: 3,
    timer: 300,
    balls: 0,
    lattes: 0,
    totalBalls: 0,
    totalLattes: 0,
    message: "",
    messageTimer: 0,
    portalEntered: false,
    portalChoiceDismissed: false,
    endTitle: "",
    endSubtitle: "",
    elapsed: 0,
    player: null,
    blocks: [],
    collectibles: [],
    enemies: [],
    enemyProjectiles: [],
    launchedBricks: [],
    particles: [],
    pipe: null,
  };

  const input = {
    left: false,
    right: false,
    jump: false,
    down: false,
    jumpBuffer: 0,
  };

  const SUPER_JUMP_TAP_WINDOW_MS = 300;
  let lastJumpTapTime = -Infinity;
  let superJumpRequest = false;

  function noteJumpTap() {
    const now = performance.now();
    if (now - lastJumpTapTime < SUPER_JUMP_TAP_WINDOW_MS) {
      superJumpRequest = true;
    }
    lastJumpTapTime = now;
  }

  function triggerSuperJump(player) {
    // Aim for a total apex of 1.5-2x the normal jump height, measured from takeoff.
    // Height scales with vy^2/(2g), and a mid-air boost must subtract height already gained.
    const heightFactor = 1.5 + Math.random() * 0.5;
    const normalHeight = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
    const risen = player.onGround || !(player.jumpStartY >= 0) ? 0 : Math.max(0, player.jumpStartY - player.y);
    const remaining = Math.max(normalHeight * 0.5, heightFactor * normalHeight - risen);
    player.vy = -Math.sqrt(2 * GRAVITY * remaining);
    player.jumpStartedAt = state.elapsed;
    toast(`Super jump! x${heightFactor.toFixed(1)}`);
    burst(player.x + player.w * 0.5, player.y + player.h, "#ffd54a", 18);
  }

  function buildFrameSources(character) {
    const folder = character.folder;
    return Array.from({ length: 20 }, (_, index) => {
      const frameNumber = String(index).padStart(3, "0");
      if (character.frameFileStyle === "numbered") {
        return assetUrl(`${folder}/frame_${frameNumber}.png`);
      }
      const stamp = (index / 10).toFixed(1);
      return assetUrl(`${folder}/frame_${frameNumber}_t${stamp}s.png`);
    });
  }

  const originalFrameCrops = [
    { x: 36, y: 164, w: 124, h: 205 },
    { x: 36, y: 165, w: 122, h: 205 },
    { x: 44, y: 164, w: 109, h: 210 },
    { x: 50, y: 164, w: 97, h: 211 },
    { x: 56, y: 164, w: 92, h: 213 },
    { x: 59, y: 164, w: 98, h: 213 },
    { x: 52, y: 121, w: 109, h: 229 },
    { x: 51, y: 102, w: 112, h: 231 },
    { x: 32, y: 86, w: 124, h: 230 },
    { x: 32, y: 84, w: 121, h: 230 },
    { x: 22, y: 90, w: 134, h: 231 },
    { x: 22, y: 102, w: 137, h: 230 },
    { x: 20, y: 111, w: 133, h: 240 },
    { x: 22, y: 122, w: 126, h: 248 },
    { x: 22, y: 132, w: 124, h: 241 },
    { x: 23, y: 153, w: 119, h: 224 },
    { x: 23, y: 159, w: 124, h: 218 },
    { x: 22, y: 158, w: 122, h: 219 },
    { x: 22, y: 161, w: 117, h: 213 },
    { x: 24, y: 163, w: 123, h: 209 },
  ];

  const allCharacterSets = [
    {
      id: "pilot",
      name: "Pilot White",
      folder: "extracted_frames",
      crops: originalFrameCrops,
      frames: [],
      loadedFrames: 0,
      poses: {},
    },
    {
      id: "yellow",
      name: "Yellow Runner",
      folder: `${ART_ROOT}/characters/yellow`,
      frameFileStyle: "numbered",
      crops: [],
      frames: [],
      loadedFrames: 0,
      poses: {},
    },
    {
      id: "scout",
      name: "White Scout",
      folder: `${ART_ROOT}/characters/scout`,
      frameFileStyle: "numbered",
      crops: [],
      frames: [],
      loadedFrames: 0,
      poses: {},
    },
  ];
  const characterSets = allCharacterSets.filter((character) => !TEMP_HIDDEN_CHARACTER_IDS.has(character.id));

  const art = loadArt({
    brickBlock: "brick_block_cluster_left.png",
    bushCenter: "bush_center.png",
    bushRight: "bush_right.png",
    cloudLargeLeft: "cloud_large_left.png",
    cloudLargeRight: "cloud_large_right.png",
    cloudSmallLeft: "cloud_small_left.png",
    downtownSign: "downtown_la_sign.png",
    groundTile: "ground_tile_sample.png",
    instructionPanel: "instruction_panel_full.png",
    laRoadSign: "la_road_sign.png",
    logo: "logo_dp_ai.png",
    matchaBlockLeft: "matcha_latte_block_left.png",
    matchaBlockRight: "matcha_latte_block_right.png",
    matchaBlockTopLeft: "matcha_latte_block_top_left.png",
    matchaBlockTopRight: "matcha_latte_block_top_right.png",
    playerCharacter: "player_character.png",
    purplePipe: "purple_pipe.png",
    questionBlock: "question_block.png",
    soccerBall: "soccer_ball_world_object.png",
    latteCup: "tutorial_matcha_cup_icon.png",
    star: "tutorial_star_icon.png",
    veniceSign: "venice_beach_sign.png",
  });

  const levelBackdrop = new Image();
  trackImage(levelBackdrop, LEVEL_BACKDROP_FILE);

  const OPTIONAL_POSE_FILES_BY_CHARACTER = {
    yellow: {
      kick: "kickball.png",
      jump: "jump.png",
      kneel: "singleknee.png",
    },
    scout: {
      kick: "kickball.png",
      jump: "jump.png",
      kneel: "singleknee.png",
    },
  };

  function computeAlphaCrop(img) {
    try {
      const scratch = document.createElement("canvas");
      scratch.width = img.naturalWidth;
      scratch.height = img.naturalHeight;
      const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
      scratchCtx.drawImage(img, 0, 0);
      const data = scratchCtx.getImageData(0, 0, scratch.width, scratch.height).data;
      let minX = scratch.width;
      let minY = scratch.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < scratch.height; y += 1) {
        for (let x = 0; x < scratch.width; x += 1) {
          if (data[(y * scratch.width + x) * 4 + 3] > 16) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) {
        return null;
      }
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    } catch {
      return null;
    }
  }

  function loadCharacterSet(character) {
    character.frames = buildFrameSources(character).map((src) => {
      const img = new Image();
      img.addEventListener("load", () => {
        character.loadedFrames += 1;
        img.alphaCrop = computeAlphaCrop(img);
      });
      img.addEventListener("error", () => {
        character.loadedFrames += 1;
      });
      trackImage(img, src);
      return img;
    });
    character.poses = {};
    const optionalPoseFiles = OPTIONAL_POSE_FILES_BY_CHARACTER[character.id] || {};
    for (const [pose, file] of Object.entries(optionalPoseFiles)) {
      const img = new Image();
      img.addEventListener("load", () => {
        img.alphaCrop = computeAlphaCrop(img);
        img.trimCrop = img.alphaCrop;
      });
      trackImage(img, `${character.folder}/${file}`);
      character.poses[pose] = img;
    }
  }

  function loadArt(sources) {
    return Object.fromEntries(
      Object.entries(sources).map(([key, file]) => {
        const img = new Image();
        trackImage(img, `${ART_ROOT}/${file}`);
        return [key, img];
      }),
    );
  }

  function assetUrl(path) {
    return `${path}?v=${FRAME_ASSET_VERSION}`;
  }

  function assetKey(src) {
    return src.split("?")[0];
  }

  function trackImage(img, src) {
    const key = assetKey(src);
    img.assetPath = key;
    assetStatus.set(key, "loading");
    img.addEventListener("load", () => {
      assetStatus.set(key, "loaded");
    });
    img.addEventListener("error", () => {
      assetStatus.set(key, "error");
      console.error(`Failed to load game asset: ${key}`);
    });
    img.src = src.includes("?") ? src : assetUrl(src);
  }

  function imageAssetState(img) {
    return img && img.assetPath ? assetStatus.get(img.assetPath) || "loading" : "loading";
  }

  function characterMissingFrameAssets(character) {
    return character.frames.filter((img) => imageAssetState(img) === "error").map((img) => img.assetPath);
  }

  function characterPendingFrameCount(character) {
    return character.frames.filter((img) => imageAssetState(img) === "loading").length;
  }

  function characterFramesReady(character) {
    return character.frames.length > 0 && character.frames.every((img) => img.complete && img.naturalWidth > 0);
  }

  function characterCanRender(character) {
    return characterFramesReady(character) || isArtReady("playerCharacter");
  }

  function characterLoadPrompt(character, readyText) {
    const missing = characterMissingFrameAssets(character);
    if (missing.length > 0 && !isArtReady("playerCharacter")) {
      return `Missing sprites: ${missing[0].replace(`${ART_ROOT}/`, "")}`;
    }
    const pending = characterPendingFrameCount(character);
    if (pending > 0) {
      return `Loading character... ${character.frames.length - pending}/${character.frames.length}`;
    }
    return characterCanRender(character) ? readyText : "Character sprites unavailable";
  }

  function missingAssets() {
    return Array.from(assetStatus.entries())
      .filter(([, status]) => status === "error")
      .map(([path]) => path);
  }

  function isArtReady(name) {
    const img = art[name];
    return Boolean(img && img.complete && img.naturalWidth > 0);
  }

  function isLevelBackdropReady() {
    return Boolean(levelBackdrop.complete && levelBackdrop.naturalWidth > 0);
  }

  function drawArt(name, x, y, w, h) {
    if (!isArtReady(name)) {
      return false;
    }
    ctx.drawImage(art[name], x, y, w, h);
    return true;
  }

  function drawArtCrop(name, sx, sy, sw, sh, x, y, w, h) {
    if (!isArtReady(name)) {
      return false;
    }
    ctx.drawImage(art[name], sx, sy, sw, sh, x, y, w, h);
    return true;
  }

  function drawArtCentered(name, x, y, w, h, rotation = 0) {
    if (!isArtReady(name)) {
      return false;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.drawImage(art[name], -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }

  characterSets.forEach(loadCharacterSet);

  function currentCharacter() {
    return characterSets[selectedCharacterIndex] || characterSets[0];
  }

  function selectCharacter(direction) {
    selectedCharacterIndex = (selectedCharacterIndex + direction + characterSets.length) % characterSets.length;
  }

  function currentFrames() {
    return currentCharacter().frames;
  }

  function currentCrops() {
    return currentCharacter().crops;
  }

  function resetGame(mode = "title") {
    const level = createLevel();
    state.mode = mode;
    state.cameraX = 0;
    state.score = 0;
    state.lives = 3;
    state.timer = 600;
    state.balls = 0;
    state.lattes = 0;
    state.totalBalls = level.totalBalls;
    state.totalLattes = level.totalLattes;
    state.message = "";
    state.messageTimer = 0;
    state.portalEntered = false;
    state.portalChoiceDismissed = false;
    state.endTitle = "";
    state.endSubtitle = "";
    state.elapsed = 0;
    state.player = {
      x: PLAYER_START_X,
      y: SURFACE_Y - PLAYER_H,
      prevX: PLAYER_START_X,
      prevY: SURFACE_Y - PLAYER_H,
      w: PLAYER_W,
      h: PLAYER_H,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      invulnerable: 0,
      anim: 0,
      kickTimer: 0,
      landTimer: 0,
      jumpStartedAt: -1,
      jumpStartY: -1,
      checkpointX: PLAYER_START_X,
      poweredUp: false,
      crouching: false,
    };
    state.blocks = level.blocks;
    state.collectibles = level.collectibles;
    state.enemies = level.enemies;
    state.enemyProjectiles = [];
    state.launchedBricks = [];
    state.pipe = level.pipe;
    state.particles = [];
    state.cameraX = clampCameraX(cameraTargetX());
  }

  function createLevel() {
    const blocks = [];
    const collectibles = [];
    const enemies = [];
    const JUMP_HIT_BLOCK_Y = 340;
    const STEP_BLOCK_Y = 402;
    const HIGH_REWARD_BLOCK_Y = 240;
    const HIGH_REWARD_PICKUP_Y = 196;
    const JUMP_HIT_PICKUP_Y = 296;

    function block(x, y, type = "brick", content = null) {
      const item = { x, y: y - TILE, w: TILE, h: TILE, type, content, hit: false, bump: 0, powerLatte: false };
      blocks.push(item);
      return item;
    }

    function latte(x, y, source = "field") {
      collectibles.push({ x, y, w: 42, h: 42, type: "latte", source, taken: false, bob: Math.random() * 10 });
    }

    const FOOD_MONSTER_KINDS = ["burger", "hotdog", "fries"];
    let monsterIndex = 0;

    function monster(x, left, right) {
      const sequenceIndex = monsterIndex;
      const kind = FOOD_MONSTER_KINDS[sequenceIndex % FOOD_MONSTER_KINDS.length];
      monsterIndex += 1;
      enemies.push({
        x,
        y: SURFACE_Y - 56,
        w: 56,
        h: 56,
        left,
        right,
        vx: 86,
        alive: true,
        stomped: 0,
        defeatType: null,
        defeatTimer: 0,
        roll: 0,
        knockbackVx: 0,
        knockbackVy: 0,
        kickBounces: 0,
        kind,
        shootCooldown: kind === "hotdog" ? 0.9 + (sequenceIndex % 3) * 0.35 : 0,
      });
    }

    function buildSection(offset) {
      const powerLatteCandidates = [];
      powerLatteCandidates.push(block(624 + offset, JUMP_HIT_BLOCK_Y, "question", "latte"));
      block(840 + offset, STEP_BLOCK_Y, "brick");
      block(960 + offset, HIGH_REWARD_BLOCK_Y, "brick");
      block(1024 + offset, HIGH_REWARD_BLOCK_Y, "question", "ball");
      block(1088 + offset, HIGH_REWARD_BLOCK_Y, "brick");
      powerLatteCandidates.push(block(1210 + offset, JUMP_HIT_BLOCK_Y, "question", "latte"));
      block(1392 + offset, STEP_BLOCK_Y, "brick");
      block(1528 + offset, HIGH_REWARD_BLOCK_Y, "latteBlock");
      block(1592 + offset, HIGH_REWARD_BLOCK_Y, "latteBlock");
      block(1764 + offset, HIGH_REWARD_BLOCK_Y, "question", "ball");
      block(1936 + offset, STEP_BLOCK_Y, "brick");
      powerLatteCandidates.push(block(2092 + offset, 386, "question", "latte"));
      block(2156 + offset, 386, "brick");
      block(2220 + offset, 386, "brick");
      block(2490 + offset, 320, "brick");
      powerLatteCandidates.push(block(2554 + offset, 320, "question", "latte"));
      block(2618 + offset, 320, "brick");
      block(2788 + offset, STEP_BLOCK_Y, "brick");
      block(2960 + offset, HIGH_REWARD_BLOCK_Y, "latteBlock");
      block(3060 + offset, 360, "question", "ball");
      block(3124 + offset, 360, "brick");
      block(3188 + offset, 360, "brick");
      block(3392 + offset, STEP_BLOCK_Y, "brick");
      powerLatteCandidates.push(block(3512 + offset, HIGH_REWARD_BLOCK_Y, "question", "latte"));

      const powerLatteBlock = powerLatteCandidates[Math.floor(Math.random() * powerLatteCandidates.length)];
      powerLatteBlock.powerLatte = true;

      latte(712 + offset, JUMP_HIT_PICKUP_Y);
      latte(1616 + offset, HIGH_REWARD_PICKUP_Y);
      latte(2340 + offset, SURFACE_Y - 118);
      latte(3010 + offset, HIGH_REWARD_PICKUP_Y);
      latte(3660 + offset, SURFACE_Y - 112);

      monster(1500 + offset, 1390 + offset, 1660 + offset);
      monster(1590 + offset, 1390 + offset, 1660 + offset);
      monster(2020 + offset, 1900 + offset, 2260 + offset);
      monster(2150 + offset, 1900 + offset, 2260 + offset);
      monster(2750 + offset, 2650 + offset, 3010 + offset);
      monster(2890 + offset, 2650 + offset, 3010 + offset);
      monster(3440 + offset, 3290 + offset, 3660 + offset);
      monster(3570 + offset, 3290 + offset, 3660 + offset);
    }

    const SECTION_SPAN = 4300;
    buildSection(0);
    buildSection(SECTION_SPAN);

    return {
      blocks,
      collectibles,
      enemies,
      pipe: { x: 3890 + SECTION_SPAN, y: SURFACE_Y - 190, w: 154, h: 190 },
      totalBalls: collectibles.filter((item) => item.type === "ball").length + blocks.filter((item) => item.content === "ball").length,
      totalLattes: collectibles.filter((item) => item.type === "latte").length + blocks.filter((item) => item.content === "latte").length,
    };
  }

  resetGame("title");
  if (!applyPenaltyResult()) {
    applyAutosaveResume();
  }

  function startGame() {
    if (!characterCanRender(currentCharacter())) {
      return;
    }
    clearRunStorage();
    resetInputState();
    resetGame("playing");
    toast("Level 1: Los Angeles");
  }

  function resetToInitialState() {
    resetConfirmReturnMode = null;
    clearRunStorage();
    resetInputState();
    selectedCharacterIndex = 0;
    resetGame("title");
  }

  function requestResetConfirmation() {
    if (state.mode === "resetConfirm") {
      return;
    }
    resetConfirmReturnMode = state.mode;
    resetInputState();
    state.mode = "resetConfirm";
    state.message = "";
    state.messageTimer = 0;
  }

  function cancelResetConfirmation() {
    if (state.mode !== "resetConfirm") {
      return;
    }
    state.mode = resetConfirmReturnMode || "playing";
    resetConfirmReturnMode = null;
  }

  function confirmReset() {
    if (state.mode !== "resetConfirm") {
      return;
    }
    resetToInitialState();
  }

  function resetInputState() {
    input.left = false;
    input.right = false;
    input.jump = false;
    input.down = false;
    input.jumpBuffer = 0;
    lastJumpTapTime = -Infinity;
    superJumpRequest = false;
  }

  function isRunActive() {
    return state.mode === "playing" || state.mode === "paused" || state.mode === "portalChoice";
  }

  function saveAutosave() {
    if (!isRunActive()) {
      return;
    }
    writeStorage(AUTOSAVE_KEY, JSON.stringify(createRunnerSnapshot()));
  }

  function clearAutosave() {
    removeStorage(AUTOSAVE_KEY);
  }

  function clearRunStorage() {
    clearAutosave();
    removeStorage(PENALTY_RESULT_KEY);
    removeStorage(PENALTY_RUNNER_SCORE_KEY);
    removeStorage(PENALTY_RUNNER_STATE_KEY);
    removeStorage(PENALTY_RETURN_KEY);
  }

  function applyAutosaveResume() {
    const snapshot = parseRunnerSnapshot(readStorage(AUTOSAVE_KEY));
    if (!snapshot) {
      return false;
    }
    restoreRunnerSnapshot(snapshot);
    state.mode = "playing";
    toast("Resumed your saved run");
    return true;
  }

  function toast(message) {
    state.message = message;
    state.messageTimer = 2.4;
  }

  function update(dt) {
    state.elapsed += dt;
    updateParticles(dt);

    if (state.mode !== "playing") {
      return;
    }

    state.timer = Math.max(0, state.timer - dt);
    if (state.timer <= 0) {
      state.mode = "lost";
      state.message = "Time up";
      clearAutosave();
      return;
    }

    if (state.messageTimer > 0) {
      state.messageTimer = Math.max(0, state.messageTimer - dt);
    }

    updatePlayer(dt);
    updateEnemies(dt);
    updateEnemyProjectiles(dt);
    updateSoccerBalls(dt);
    collectItems();
    checkSoccerEnemyContact();
    checkEnemyContact();
    checkPipe();

    if (state.player.y > VIEW_H + 220) {
      hurtPlayer({ resetPosition: true });
    }

    state.cameraX = clampCameraX(cameraTargetX());
  }

  function cameraTargetX(player = state.player) {
    return player.x + player.w * 0.5 - VIEW_W * cameraAnchorRatio();
  }

  function clampCameraX(value) {
    return clamp(value, cameraMinX(), cameraMaxX());
  }

  function cameraMinX() {
    if (!isPhoneViewport()) {
      return 0;
    }
    return PLAYER_START_X + PLAYER_W * 0.5 - VIEW_W * 0.5;
  }

  function cameraMaxX() {
    if (!isPhoneViewport()) {
      return WORLD_W - VIEW_W;
    }
    const visible = phoneVisibleCanvasRect();
    return Math.max(cameraMinX(), WORLD_W - (visible.x + visible.w));
  }

  function cameraAnchorRatio() {
    return isPhoneViewport() ? 0.5 : 0.42;
  }

  function isPhoneViewport() {
    return window.matchMedia("(hover: none) and (pointer: coarse) and (max-width: 1024px)").matches;
  }

  function updatePlayer(dt) {
    const player = state.player;
    const wasOnGround = player.onGround;
    player.prevX = player.x;
    player.prevY = player.y;
    updatePlayerCrouch(player);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.kickTimer = Math.max(0, player.kickTimer - dt);
    player.landTimer = Math.max(0, player.landTimer - dt);
    input.jumpBuffer = Math.max(0, input.jumpBuffer - dt);

    const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (move !== 0) {
      player.vx += move * MOVE_ACCEL * dt;
      player.vx = clamp(player.vx, -MAX_SPEED, MAX_SPEED);
      player.facing = move;
    } else {
      player.vx = approach(player.vx, 0, FRICTION * dt);
    }

    if (input.jumpBuffer > 0 && player.onGround) {
      player.jumpStartY = player.y;
      if (superJumpRequest) {
        triggerSuperJump(player);
      } else {
        player.vy = -JUMP_SPEED;
        player.jumpStartedAt = state.elapsed;
        burst(player.x + player.w * 0.5, player.y + player.h, "#fff4a8", 8);
      }
      player.onGround = false;
      input.jumpBuffer = 0;
      superJumpRequest = false;
    } else if (superJumpRequest) {
      // Second tap lands just after takeoff: boost the in-progress jump.
      if (!player.onGround && player.vy < 0 && state.elapsed - player.jumpStartedAt < 0.35) {
        triggerSuperJump(player);
      }
      superJumpRequest = false;
    }

    player.vy += GRAVITY * dt;
    player.vy = Math.min(player.vy, 1180);

    player.x += player.vx * dt;
    resolveHorizontal(player);
    resolvePipeHorizontal(player);

    const fallSpeed = player.vy;
    player.y += player.vy * dt;
    player.onGround = false;
    resolveVertical(player);
    resolvePipeVertical(player);

    if (!wasOnGround && player.onGround && fallSpeed > 460) {
      player.landTimer = 0.18;
    }

    if (Math.abs(player.vx) > 8 && player.onGround) {
      player.anim += dt * (9 + Math.abs(player.vx) / 85);
    } else {
      player.anim += dt * 2.5;
    }
  }

  function updatePlayerCrouch(player) {
    const wantsToCrouch = input.down && player.onGround;
    if (wantsToCrouch && !player.crouching) {
      setPlayerCrouching(true);
    } else if (!wantsToCrouch && player.crouching && canSetPlayerCrouching(false)) {
      setPlayerCrouching(false);
    }
  }

  function resolveHorizontal(player) {
    player.x = clamp(player.x, 8, WORLD_W - player.w - 8);
    for (const item of state.blocks) {
      if (!aabb(player, item)) {
        continue;
      }
      const wasAbove = player.prevY + player.h <= item.y + 8;
      if (wasAbove && player.vy >= 0) {
        continue;
      }
      if (player.vx > 0) {
        player.x = item.x - player.w;
      } else if (player.vx < 0) {
        player.x = item.x + item.w;
      }
      player.vx = 0;
    }
  }

  function resolveVertical(player) {
    if (player.y + player.h >= SURFACE_Y) {
      player.y = SURFACE_Y - player.h;
      player.vy = 0;
      player.onGround = true;
    }

    for (const item of state.blocks) {
      if (!aabb(player, item)) {
        continue;
      }

      if (player.vy > 0 && player.prevY + player.h <= item.y + 18) {
        player.y = item.y - player.h;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0 && player.prevY >= item.y + item.h - 18) {
        player.y = item.y + item.h;
        player.vy = 80;
        if (hitBlock(item)) {
          state.blocks = state.blocks.filter((block) => block !== item);
          break;
        }
      }
    }
  }

  function pipeSolidBounds() {
    const pipe = state.pipe;
    return {
      x: pipe.x + 12,
      y: pipe.y,
      w: pipe.w - 24,
      h: pipe.h,
    };
  }

  function resolvePipeHorizontal(player) {
    const pipe = pipeSolidBounds();
    if (!aabb(player, pipe)) {
      return;
    }

    const wasAbove = player.prevY + player.h <= pipe.y + 18;
    if (wasAbove && player.vy >= 0) {
      return;
    }

    if (player.vx > 0 || player.prevX + player.w <= pipe.x) {
      player.x = pipe.x - player.w;
    } else if (player.vx < 0 || player.prevX >= pipe.x + pipe.w) {
      player.x = pipe.x + pipe.w;
    }
    player.vx = 0;
  }

  function resolvePipeVertical(player) {
    const pipe = pipeSolidBounds();
    if (!aabb(player, pipe)) {
      return;
    }

    if (player.vy > 0 && player.prevY + player.h <= pipe.y + 18) {
      player.y = pipe.y - player.h;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0 && player.prevY >= pipe.y + pipe.h - 18) {
      player.y = pipe.y + pipe.h;
      player.vy = 80;
    }
  }

  function hitBlock(item) {
    item.bump = 0.18;
    if (item.type === "question" && !item.hit) {
      item.hit = true;
      state.score += 50;
      if (item.content) {
        spawnFromBlock(item);
      }
    } else if (item.type === "brick" && state.player.poweredUp) {
      state.score += 100;
      launchBrick(item);
      toast("Brick smashed");
      return true;
    } else if (item.type === "brick") {
      burst(item.x + item.w / 2, item.y + item.h / 2, "#bd651f", 10);
    }
    return false;
  }

  function launchBrick(item) {
    const playerCenter = state.player.x + state.player.w * 0.5;
    const brickCenter = item.x + item.w * 0.5;
    state.launchedBricks.push({
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      vx: brickCenter < playerCenter ? -36 : 36,
      vy: -480,
      rotation: 0,
      spin: brickCenter < playerCenter ? -0.9 : 0.9,
      age: 0,
      duration: 0.9,
    });
  }

  function spawnFromBlock(item) {
    const spawned = {
      x: item.x + 10,
      y: item.y - 52,
      w: item.content === "ball" ? 44 : 42,
      h: item.content === "ball" ? 44 : 42,
      type: item.content,
      source: "block",
      taken: false,
      vx: 0,
      vy: 0,
      kicked: false,
      counted: false,
      spin: 0,
      bob: 0,
      emerging: 0.32,
      powerUp: Boolean(item.powerLatte),
    };
    state.collectibles.push(spawned);
    burst(item.x + item.w / 2, item.y, item.content === "ball" ? "#f7f7f7" : "#bde87d", 12);
  }

  function updateEnemies(dt) {
    const playerCenter = state.player.x + state.player.w / 2;
    for (const enemy of state.enemies) {
      if (!enemy.alive) {
        if (enemy.defeatType === "kicked") {
          updateKickedMonster(enemy, dt);
        } else {
          enemy.stomped += dt;
        }
        continue;
      }
      enemy.x += enemy.vx * dt;
      if (enemy.x <= enemy.left || enemy.x + enemy.w >= enemy.right) {
        enemy.vx *= -1;
        enemy.x = clamp(enemy.x, enemy.left, enemy.right - enemy.w);
      }

      if (enemy.kind !== "hotdog") {
        continue;
      }
      const enemyCenter = enemy.x + enemy.w / 2;
      if (Math.abs(playerCenter - enemyCenter) > HOTDOG_SHOT_RANGE) {
        continue;
      }
      enemy.shootCooldown = Math.max(0, (enemy.shootCooldown || 0) - dt);
      if (enemy.shootCooldown <= 0) {
        fireSausage(enemy, playerCenter < enemyCenter ? -1 : 1);
        enemy.shootCooldown = HOTDOG_SHOT_INTERVAL;
      }
    }
  }

  function updateKickedMonster(enemy, dt) {
    enemy.defeatTimer = (enemy.defeatTimer || 0) + dt;
    enemy.knockbackVy = (enemy.knockbackVy || 0) + GRAVITY * 0.85 * dt;
    enemy.x += (enemy.knockbackVx || 0) * dt;
    enemy.y += enemy.knockbackVy * dt;
    enemy.roll = (enemy.roll || 0) + ((enemy.knockbackVx || 0) / (enemy.w * 0.38)) * dt;

    if (enemy.y + enemy.h < SURFACE_Y) {
      return;
    }

    enemy.y = SURFACE_Y - enemy.h;
    if (enemy.knockbackVy > 180 && (enemy.kickBounces || 0) < 1) {
      enemy.knockbackVy *= -0.36;
      enemy.kickBounces = (enemy.kickBounces || 0) + 1;
      return;
    }

    enemy.knockbackVy = 0;
    enemy.knockbackVx = approach(enemy.knockbackVx || 0, 0, 190 * dt);
  }

  function fireSausage(enemy, direction) {
    const w = 38;
    const h = 16;
    state.enemyProjectiles.push({
      x: enemy.x + enemy.w / 2 + direction * 24 - w / 2,
      y: enemy.y + 20,
      w,
      h,
      vx: direction * HOTDOG_SHOT_SPEED,
      life: 2.5,
      active: true,
    });
  }

  function updateEnemyProjectiles(dt) {
    for (const projectile of state.enemyProjectiles) {
      if (!projectile.active) {
        continue;
      }
      projectile.x += projectile.vx * dt;
      projectile.life -= dt;
      if (projectile.life <= 0 || projectile.x + projectile.w < 0 || projectile.x > WORLD_W) {
        projectile.active = false;
        continue;
      }
      if (aabb(projectile, state.player)) {
        projectile.active = false;
        burst(projectile.x + projectile.w / 2, projectile.y + projectile.h / 2, "#ffb035", 12);
        hurtPlayer();
      }
    }
    state.enemyProjectiles = state.enemyProjectiles.filter((projectile) => projectile.active);
  }

  function updateSoccerBalls(dt) {
    for (const item of state.collectibles) {
      if (item.taken || item.type !== "ball") {
        continue;
      }
      item.kickCooldown = Math.max(0, (item.kickCooldown || 0) - dt);
      if (!item.kicked) {
        continue;
      }

      item.vy += GRAVITY * 0.72 * dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.spin += item.vx * dt * 0.035;

      if (item.y + item.h >= SURFACE_Y) {
        item.y = SURFACE_Y - item.h;
        if (item.vy > 260) {
          item.vy = -item.vy * 0.28;
        } else {
          item.vy = 0;
        }
        item.vx = approach(item.vx, 0, 80 * dt);
      }

      if (item.x < 0 || item.x + item.w > WORLD_W) {
        item.x = clamp(item.x, 0, WORLD_W - item.w);
        item.vx *= -0.45;
      }

      if (Math.abs(item.vx) < 12 && Math.abs(item.vy) < 12 && item.y + item.h >= SURFACE_Y - 1) {
        item.vx = 0;
        item.vy = 0;
        item.kicked = false;
      }
    }
  }

  function collectItems() {
    const player = state.player;
    for (const item of state.collectibles) {
      if (item.taken) {
        continue;
      }
      if (item.emerging) {
        item.emerging = Math.max(0, item.emerging - FRAME_DT);
      }
      if (aabb(player, item)) {
        if (item.type === "ball") {
          kickSoccerBall(item, player);
        } else {
          item.taken = true;
          state.lattes += 1;
          state.score += 150;
          if (item.powerUp) {
            setPlayerPoweredUp(true);
            toast("Latte power: 1.5x size");
            burst(item.x + item.w / 2, item.y + item.h / 2, "#ffd84a", 28);
          } else {
            toast("Matcha latte collected");
            burst(item.x + item.w / 2, item.y + item.h / 2, "#c3f06e", 16);
          }
        }
      }
    }
  }

  function kickSoccerBall(item, player) {
    if ((item.kickCooldown || 0) > 0 || item.emerging) {
      return;
    }

    const playerCenter = player.x + player.w / 2;
    const ballCenter = item.x + item.w / 2;
    const dir = playerCenter <= ballCenter ? 1 : -1;
    item.kicked = true;
    item.kickCooldown = 0.28;
    item.vx = dir * (SOCCER_KICK_SPEED + Math.abs(player.vx) * 0.28);
    item.vy = Math.min(item.vy || 0, -260);
    item.bob = 0;
    player.facing = dir;
    player.kickTimer = 0.22;

    if (!item.counted) {
      item.counted = true;
      state.balls += 1;
      state.score += 100;
    }
    toast("Soccer ball kicked");
    burst(item.x + item.w / 2, item.y + item.h / 2, "#f5f5f5", 12);
  }

  function performKick() {
    const player = state.player;
    if (player.kickTimer > 0) {
      return;
    }
    player.kickTimer = 0.22;

    const reach = 64;
    const hitbox = {
      x: player.facing > 0 ? player.x + player.w - 12 : player.x - reach + 12,
      y: player.y + player.h - 78,
      w: reach,
      h: 78,
    };

    for (const enemy of state.enemies) {
      if (!enemy.alive || !aabb(hitbox, enemy)) {
        continue;
      }
      const direction = player.facing > 0 ? 1 : -1;
      enemy.alive = false;
      enemy.stomped = 0;
      enemy.defeatType = "kicked";
      enemy.defeatTimer = 0;
      enemy.roll = 0;
      enemy.knockbackVx = direction * (620 + Math.abs(player.vx) * 0.4);
      enemy.knockbackVy = -460;
      enemy.kickBounces = 0;
      enemy.vx = direction * Math.max(86, Math.abs(enemy.vx || 0));
      state.score += 250;
      toast("Monster kicked out");
      burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, "#ffb035", 24);
    }

    for (const item of state.collectibles) {
      if (item.taken || item.type !== "ball") {
        continue;
      }
      if (aabb(hitbox, item)) {
        kickSoccerBall(item, player);
      }
    }
  }

  function checkSoccerEnemyContact() {
    for (const item of state.collectibles) {
      if (item.taken || item.type !== "ball" || !item.kicked || Math.abs(item.vx) < 120) {
        continue;
      }
      for (const enemy of state.enemies) {
        if (!enemy.alive || !aabb(item, enemy)) {
          continue;
        }
        enemy.alive = false;
        enemy.stomped = 0;
        enemy.defeatType = "ball";
        item.taken = true;
        state.score += 250;
        toast("Monster knocked out");
        burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, "#ffb035", 24);
        burst(item.x + item.w / 2, item.y + item.h / 2, "#f5f5f5", 16);
        break;
      }
    }
  }

  function checkEnemyContact() {
    const player = state.player;
    for (const enemy of state.enemies) {
      if (!enemy.alive || !aabb(player, enemy)) {
        continue;
      }

      const wasAbove = player.prevY + player.h <= enemy.y + 18;
      if (player.vy > 0 && wasAbove) {
        enemy.alive = false;
        enemy.stomped = 0;
        enemy.defeatType = "stomped";
        player.vy = -560;
        player.onGround = false;
        state.score += 200;
        toast("Monster cleared");
        burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, "#ffb035", 20);
      } else {
        hurtPlayer();
      }
    }
  }

  function checkPipe() {
    const player = state.player;
    const pipe = state.pipe;
    const pipeBody = pipeSolidBounds();
    const playerCenter = player.x + player.w / 2;
    const atPipeFront = player.x + player.w >= pipeBody.x - 14 && player.x < pipeBody.x && player.y + player.h >= SURFACE_Y - 4;
    const onPipeTop = playerCenter >= pipeBody.x && playerCenter <= pipeBody.x + pipeBody.w && Math.abs(player.y + player.h - pipeBody.y) <= 3;
    const atPipe = atPipeFront || onPipeTop;
    if (!atPipe) {
      state.portalChoiceDismissed = false;
      return;
    }

    if (!missionComplete()) {
      if (state.messageTimer <= 0.2) {
        toast("Collect every soccer ball and matcha latte first");
      }
      return;
    }

    if (!state.portalChoiceDismissed) {
      openPortalChoice();
    }
  }

  function missionComplete() {
    return state.balls >= state.totalBalls && state.lattes >= state.totalLattes;
  }

  function openPortalChoice() {
    if (state.portalEntered || state.mode !== "playing") {
      return;
    }
    state.mode = "portalChoice";
    state.player.vx = 0;
    state.message = "";
    state.messageTimer = 0;
    burst(state.pipe.x + state.pipe.w / 2, state.pipe.y + state.pipe.h / 2, "#9ef7ff", 18);
  }

  function choosePortal(playPenalty) {
    if (state.mode !== "portalChoice") {
      return;
    }
    if (playPenalty) {
      enterPenaltyPortal();
      return;
    }
    state.mode = "playing";
    state.portalChoiceDismissed = true;
    toast("Penalty skipped. Move away to choose again.");
  }

  function enterPenaltyPortal() {
    if (state.portalEntered) {
      return;
    }
    if (!missionComplete()) {
      state.mode = "playing";
      toast("Collect every soccer ball and matcha latte first");
      return;
    }

    state.portalEntered = true;
    state.mode = "portal";
    state.score += Math.ceil(state.timer) * 10;
    state.message = "Penalty portal open";
    clearAutosave();
    writeStorage(PENALTY_RUNNER_SCORE_KEY, String(state.score));
    writeStorage(PENALTY_RUNNER_STATE_KEY, JSON.stringify(createRunnerSnapshot()));
    writeStorage(PENALTY_RETURN_KEY, "index.html?from=penalty");
    removeStorage(PENALTY_RESULT_KEY);
    burst(state.pipe.x + state.pipe.w / 2, state.pipe.y + state.pipe.h / 2, "#9ef7ff", 34);
    setTimeout(() => {
      window.location.href = PENALTY_PAGE;
    }, 280);
  }

  function applyPenaltyResult() {
    const raw = readStorage(PENALTY_RESULT_KEY);
    if (!raw) {
      return false;
    }
    const savedRunnerRaw = readStorage(PENALTY_RUNNER_STATE_KEY);

    removeStorage(PENALTY_RESULT_KEY);
    removeStorage(PENALTY_RUNNER_SCORE_KEY);
    removeStorage(PENALTY_RUNNER_STATE_KEY);
    removeStorage(PENALTY_RETURN_KEY);

    let result = null;
    try {
      result = JSON.parse(raw);
    } catch {
      return false;
    }

    const savedRunner = parseRunnerSnapshot(savedRunnerRaw);
    if (savedRunner) {
      restoreRunnerSnapshot(savedRunner);
    }

    const runnerScore = savedRunner ? state.score : Math.max(0, Math.floor(Number(result.runnerScore) || 0));
    const bonus = result.win ? Math.max(0, Math.floor(Number(result.bonus) || 0)) : 0;
    const goals = Math.max(0, Math.floor(Number(result.goals) || 0));
    state.score = runnerScore + bonus;
    state.mode = "playing";
    state.portalEntered = true;
    state.endTitle = "";
    state.endSubtitle = "";
    placePlayerAfterPortal();
    state.message = result.win
      ? `Penalty win: ${goals} goal${goals === 1 ? "" : "s"}, +${bonus} points`
      : "Penalty lost: no bonus added this run.";
    state.messageTimer = 3.2;
    return true;
  }

  function createRunnerSnapshot() {
    return {
      version: 8,
      characterIndex: selectedCharacterIndex,
      cameraX: state.cameraX,
      score: state.score,
      lives: state.lives,
      timer: state.timer,
      balls: state.balls,
      lattes: state.lattes,
      totalBalls: state.totalBalls,
      totalLattes: state.totalLattes,
      portalEntered: state.portalEntered,
      elapsed: state.elapsed,
      player: clonePlain(state.player),
      blocks: clonePlain(state.blocks),
      collectibles: clonePlain(state.collectibles),
      enemies: clonePlain(state.enemies),
      enemyProjectiles: clonePlain(state.enemyProjectiles),
      pipe: clonePlain(state.pipe),
    };
  }

  function parseRunnerSnapshot(raw) {
    if (!raw) {
      return null;
    }
    try {
      const snapshot = JSON.parse(raw);
      return snapshot && snapshot.version === 8 ? snapshot : null;
    } catch {
      return null;
    }
  }

  function restoreRunnerSnapshot(snapshot) {
    selectedCharacterIndex = clamp(Math.floor(Number(snapshot.characterIndex) || 0), 0, characterSets.length - 1);
    const restoredCameraX = Number(snapshot.cameraX) || 0;
    state.score = Math.max(0, Math.floor(Number(snapshot.score) || 0));
    state.lives = Math.max(1, Math.floor(Number(snapshot.lives) || 3));
    state.timer = Math.max(0, Number(snapshot.timer) || 0);
    state.balls = Math.max(0, Math.floor(Number(snapshot.balls) || 0));
    state.lattes = Math.max(0, Math.floor(Number(snapshot.lattes) || 0));
    state.totalBalls = Math.max(state.balls, Math.floor(Number(snapshot.totalBalls) || state.totalBalls));
    state.totalLattes = Math.max(state.lattes, Math.floor(Number(snapshot.totalLattes) || state.totalLattes));
    state.portalEntered = Boolean(snapshot.portalEntered);
    state.portalChoiceDismissed = false;
    state.elapsed = Math.max(0, Number(snapshot.elapsed) || 0);
    state.player = normalizePlayer(snapshot.player);
    state.cameraX = clampCameraX(restoredCameraX);
    state.blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : state.blocks;
    state.collectibles = Array.isArray(snapshot.collectibles) ? snapshot.collectibles : state.collectibles;
    state.enemies = Array.isArray(snapshot.enemies) ? snapshot.enemies : state.enemies;
    state.enemyProjectiles = Array.isArray(snapshot.enemyProjectiles) ? snapshot.enemyProjectiles : [];
    state.pipe = snapshot.pipe || state.pipe;
    state.launchedBricks = [];
    state.particles = [];
  }

  function normalizePlayer(player) {
    const restored = player && typeof player === "object" ? player : {};
    const poweredUp = Boolean(restored.poweredUp);
    const crouching = Boolean(restored.crouching);
    const { w, h } = playerBodySize(poweredUp, crouching);
    const x = clamp(Number(restored.x) || 128, 8, WORLD_W - w - 8);
    const y = clamp(Number(restored.y) || SURFACE_Y - h, -VIEW_H, SURFACE_Y - h);
    return {
      x,
      y,
      prevX: x,
      prevY: y,
      w,
      h,
      vx: Number(restored.vx) || 0,
      vy: Number(restored.vy) || 0,
      facing: Number(restored.facing) < 0 ? -1 : 1,
      onGround: Boolean(restored.onGround),
      invulnerable: Math.max(0, Number(restored.invulnerable) || 0),
      anim: Math.max(0, Number(restored.anim) || 0),
      kickTimer: 0,
      landTimer: 0,
      jumpStartedAt: -1,
      jumpStartY: -1,
      checkpointX: Math.max(128, Number(restored.checkpointX) || 128),
      poweredUp,
      crouching,
    };
  }

  function playerBodySize(poweredUp, crouching) {
    const frameScale = poweredUp ? PLAYER_POWER_SCALE : 1;
    return {
      w: PLAYER_W * frameScale,
      h: PLAYER_H * frameScale * (crouching ? PLAYER_CROUCH_HEIGHT_SCALE : 1),
    };
  }

  function setPlayerPoweredUp(poweredUp) {
    const player = state.player;
    const { w: targetW, h: targetH } = playerBodySize(poweredUp, player.crouching);
    const centerX = player.x + player.w * 0.5;
    const bottomY = player.y + player.h;

    player.poweredUp = poweredUp;
    player.w = targetW;
    player.h = targetH;
    player.x = clamp(centerX - targetW * 0.5, 8, WORLD_W - targetW - 8);
    player.y = Math.min(bottomY - targetH, SURFACE_Y - targetH);
    player.prevX = player.x;
    player.prevY = player.y;
  }

  function setPlayerCrouching(crouching) {
    const player = state.player;
    const { w: targetW, h: targetH } = playerBodySize(player.poweredUp, crouching);
    const centerX = player.x + player.w * 0.5;
    const bottomY = player.y + player.h;

    player.crouching = crouching;
    player.w = targetW;
    player.h = targetH;
    player.x = clamp(centerX - targetW * 0.5, 8, WORLD_W - targetW - 8);
    player.y = bottomY - targetH;
    player.prevX = player.x;
    player.prevY = player.y;
  }

  function canSetPlayerCrouching(crouching) {
    const player = state.player;
    const { w, h } = playerBodySize(player.poweredUp, crouching);
    const candidate = {
      x: player.x + (player.w - w) * 0.5,
      y: player.y + player.h - h,
      w,
      h,
    };
    if (candidate.y < -VIEW_H || state.blocks.some((block) => aabb(candidate, block))) {
      return false;
    }
    return !state.pipe || !aabb(candidate, pipeSolidBounds());
  }

  function placePlayerAfterPortal() {
    const player = state.player;
    const pipe = state.pipe;
    player.x = clamp(pipe.x + pipe.w + 28, 8, WORLD_W - player.w - 8);
    player.y = SURFACE_Y - player.h;
    player.prevX = player.x;
    player.prevY = player.y;
    player.vx = 0;
    player.vy = 0;
    player.facing = 1;
    player.onGround = true;
    player.invulnerable = 0;
    player.checkpointX = player.x;
    state.cameraX = clampCameraX(cameraTargetX(player));
  }

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hurtPlayer({ resetPosition = false } = {}) {
    const player = state.player;
    if (player.invulnerable > 0 || state.mode !== "playing") {
      return;
    }
    const absorbedByLatte = player.poweredUp && !resetPosition;
    if (absorbedByLatte) {
      setPlayerPoweredUp(false);
      toast("Latte power lost");
      burst(player.x + player.w / 2, player.y + player.h / 2, "#ffd84a", 26);
    } else {
      state.lives -= 1;
      burst(player.x + player.w / 2, player.y + player.h / 2, "#ff4d59", 22);
      if (state.lives <= 0) {
        state.mode = "lost";
        state.message = "No lives left";
        clearAutosave();
        return;
      }
      toast("Watch out");
    }
    if (resetPosition) {
      player.x = Math.max(PLAYER_START_X, player.checkpointX);
      player.y = SURFACE_Y - player.h;
      player.vx = 0;
      player.vy = 0;
    } else {
      player.vx = -player.facing * 260;
      player.vy = player.onGround ? -260 : Math.min(player.vy, -120);
      player.onGround = false;
    }
    player.invulnerable = 1.6;
    state.cameraX = clampCameraX(cameraTargetX(player));
  }

  function updateParticles(dt) {
    for (const brick of state.launchedBricks) {
      brick.age += dt;
      brick.x += brick.vx * dt;
      brick.y += brick.vy * dt;
      brick.vy -= 120 * dt;
      brick.rotation += brick.spin * dt;
    }
    state.launchedBricks = state.launchedBricks.filter((brick) => brick.age < brick.duration);

    for (const particle of state.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 900 * dt;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
    for (const item of state.blocks) {
      item.bump = Math.max(0, item.bump - dt);
    }
  }

  function burst(x, y, color, count) {
    if (!SHOW_PARTICLE_SPLASHES) {
      return;
    }
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 260;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        size: 3 + Math.random() * 5,
        color,
        life: 0.45 + Math.random() * 0.35,
      });
    }
  }

  function render() {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    drawBackground();
    drawWorld();
    if (state.mode !== "title") {
      drawHud();
    }

    if (state.mode === "title") {
      drawTitle();
    } else if (state.mode === "portalChoice") {
      drawPortalChoice();
    } else if (state.mode === "resetConfirm") {
      drawResetConfirmation();
    } else if (state.mode === "portal") {
      drawEndScreen("PORTAL OPEN", "Loading the penalty kick challenge...");
    } else if (state.mode === "won") {
      drawEndScreen(state.endTitle || "COURSE CLEAR", state.endSubtitle || "You collected every soccer ball and matcha latte.");
    } else if (state.mode === "lost") {
      drawEndScreen("TRY AGAIN", state.message || "The run ended.");
    }
  }

  function drawBackground() {
    if (drawLevelBackdrop()) {
      return;
    }

    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, "#006ff4");
    sky.addColorStop(0.42, "#11a9ff");
    sky.addColorStop(1, "#9be7ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const glow = ctx.createRadialGradient(VIEW_W * 0.53, 100, 20, VIEW_W * 0.53, 100, 430);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.42)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, VIEW_W, GROUND_Y);

    drawCloud(210 - state.cameraX * 0.1, 116, 1.08, "cloudLargeLeft");
    drawCloud(785 - state.cameraX * 0.08, 82, 0.86, "cloudLargeRight");
    drawCloud(1260 - state.cameraX * 0.12, 140, 1.28, "cloudLargeLeft");
    drawCloud(1790 - state.cameraX * 0.09, 106, 1.0, "cloudLargeRight");
    drawCloud(2310 - state.cameraX * 0.1, 138, 0.82, "cloudSmallLeft");

    drawMountains(0.18);
    drawCity(0.34);
    drawHills(0.24);
  }

  function drawLevelBackdrop() {
    if (!isLevelBackdropReady()) {
      return false;
    }

    const zoom = 1.2;
    const drawH = VIEW_H * zoom;
    const drawW = drawH * (levelBackdrop.naturalWidth / levelBackdrop.naturalHeight);
    const maxScroll = Math.max(0, drawW - VIEW_W);
    const worldProgress = clamp(state.cameraX / Math.max(1, WORLD_W - VIEW_W), 0, 1);
    const drawX = -maxScroll * worldProgress;
    const drawY = VIEW_H - drawH;

    ctx.save();
    ctx.drawImage(levelBackdrop, drawX, drawY, drawW, drawH);
    ctx.restore();
    return true;
  }

  function drawCloud(x, y, scale, artName) {
    if (isArtReady(artName)) {
      const img = art[artName];
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const sx = wrapScreenX(x, w);
      drawArt(artName, sx, y, w, h);
      return;
    }

    const sx = wrapScreenX(x, 390 * scale);
    ctx.save();
    ctx.translate(sx, y);
    ctx.scale(scale, scale);
    const cloud = ctx.createLinearGradient(0, -10, 0, 62);
    cloud.addColorStop(0, "rgba(255, 255, 255, 0.98)");
    cloud.addColorStop(0.72, "rgba(241, 249, 255, 0.95)");
    cloud.addColorStop(1, "rgba(199, 228, 255, 0.78)");
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.arc(0, 28, 30, Math.PI, 0);
    ctx.arc(42, 16, 44, Math.PI, 0);
    ctx.arc(86, 24, 34, Math.PI, 0);
    ctx.arc(128, 31, 26, Math.PI, 0);
    ctx.lineTo(155, 54);
    ctx.lineTo(-35, 54);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(154, 207, 248, 0.35)";
    ctx.fillRect(-20, 49, 160, 7);
    ctx.restore();
  }

  function drawMountains(parallax) {
    const offset = -state.cameraX * parallax;
    const mountain = ctx.createLinearGradient(0, 310, 0, 500);
    mountain.addColorStop(0, "#9bccf6");
    mountain.addColorStop(1, "#4f9bd8");
    ctx.fillStyle = mountain;
    ctx.beginPath();
    ctx.moveTo(offset - 100, 478);
    for (let x = -100; x <= WORLD_W + 200; x += 190) {
      ctx.lineTo(offset + x + 95, 328 + ((x / 190) % 3) * 20);
      ctx.lineTo(offset + x + 190, 478);
    }
    ctx.lineTo(VIEW_W + 100, 478);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    for (let x = -40; x < VIEW_W + 80; x += 42) {
      const y = 430 + Math.sin((x + state.cameraX * 0.08) * 0.06) * 26;
      ctx.fillRect(x, y, 5, 5);
      ctx.fillRect(x + 14, y + 18, 4, 4);
    }
  }

  function drawHills(parallax) {
    const offset = -state.cameraX * parallax;
    const hills = ctx.createLinearGradient(0, 390, 0, GROUND_Y);
    hills.addColorStop(0, "rgba(61, 145, 205, 0.72)");
    hills.addColorStop(1, "rgba(27, 95, 161, 0.74)");
    ctx.fillStyle = hills;
    ctx.beginPath();
    ctx.moveTo(0, 480);
    for (let x = -80; x < VIEW_W + 160; x += 90) {
      ctx.quadraticCurveTo(x + 45, 430 + Math.sin(x * 0.02) * 24, x + 90, 480);
    }
    ctx.lineTo(VIEW_W, GROUND_Y);
    ctx.lineTo(0, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(31, 104, 168, 0.26)";
    for (let x = -60; x < VIEW_W + 120; x += 22) {
      const y = 510 + Math.sin((x + state.cameraX * 0.1) * 0.04) * 38;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const signX = 2520 + offset;
    if (signX > -300 && signX < VIEW_W + 300) {
      ctx.save();
      ctx.translate(signX, 335);
      ctx.rotate(-0.035);
      ctx.font = "800 38px Arial, sans-serif";
      ctx.fillStyle = "rgba(239, 248, 255, 0.82)";
      ctx.strokeStyle = "rgba(45, 104, 161, 0.7)";
      ctx.lineWidth = 4;
      ctx.strokeText("HOLLYWOOD", 0, 0);
      ctx.fillText("HOLLYWOOD", 0, 0);
      ctx.restore();
    }
  }

  function drawCity(parallax) {
    const offset = -state.cameraX * parallax;
    const buildings = [
      [870, 360, 58, 175, "#9ee0ff"],
      [950, 322, 54, 213, "#6db6ed"],
      [1020, 330, 42, 205, "#8bd7ff"],
      [1080, 255, 58, 280, "#c7efff"],
      [1158, 214, 38, 321, "#8bd7ff"],
      [1202, 292, 72, 243, "#79c6ff"],
      [1300, 315, 58, 220, "#a6e2ff"],
      [1380, 282, 78, 253, "#6db6ed"],
      [1500, 366, 66, 169, "#afe7ff"],
      [1645, 342, 52, 193, "#92d3ff"],
      [2840, 330, 58, 205, "#89d9ff"],
      [2930, 292, 76, 243, "#72c5fb"],
      [3034, 360, 64, 175, "#b5ebff"],
      [3130, 315, 72, 220, "#8fd8ff"],
      [3236, 282, 84, 253, "#7fc9f2"],
    ];
    for (const [x, y, w, h, color] of buildings) {
      const sx = x + offset;
      if (sx < -w || sx > VIEW_W + w) {
        continue;
      }
      const facade = ctx.createLinearGradient(sx, y, sx + w, y);
      facade.addColorStop(0, color);
      facade.addColorStop(0.5, "#d5f4ff");
      facade.addColorStop(1, "#5aaee6");
      ctx.fillStyle = facade;
      ctx.globalAlpha = 0.78;
      ctx.fillRect(sx, y, w, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(20, 92, 154, 0.16)";
      ctx.fillRect(sx + w - 8, y, 8, h);
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      for (let wy = y + 18; wy < y + h - 12; wy += 28) {
        for (let wx = sx + 9; wx < sx + w - 10; wx += 18) {
          ctx.fillRect(wx, wy, 7, 13);
        }
      }
    }
  }

  function drawWorld() {
    ctx.save();
    ctx.translate(-state.cameraX, 0);
    if (!isLevelBackdropReady()) {
      drawStreetProps();
    }
    drawGround();
    drawBlocks();
    drawLaunchedBricks();
    drawCollectibles();
    drawEnemies();
    drawEnemyProjectiles();
    drawPipe();
    drawPlayer();
    drawParticles();
    ctx.restore();
  }

  function drawStreetProps() {
    drawSideBuilding(-80, GROUND_Y - 372, 210, 372, "left");
    drawSideBuilding(3720, GROUND_Y - 340, 260, 340, "right");
    drawPalm(280, GROUND_Y, 1.1);
    drawTrafficLight(458, GROUND_Y - 214);
    drawPalm(1540, GROUND_Y, 0.82);
    drawPalm(2410, GROUND_Y, 0.9);
    drawPalm(3240, GROUND_Y, 1.0);
    drawPalm(3970, GROUND_Y, 1.24);
    drawLASign(70, GROUND_Y - 250);
    drawRoadSign(28, GROUND_Y - 124, "Downtown LA", "downtownSign", 190);
    drawRoadSign(2510, GROUND_Y - 132, "Venice Beach ->", "veniceSign", 176);
    drawBillboard(3630, GROUND_Y - 286);
    drawShrub(136, GROUND_Y - 86, 1.0, "bushCenter");
    drawShrub(1870, GROUND_Y - 90, 1.15, "bushRight");
    drawShrub(3740, GROUND_Y - 88, 1.05, "bushCenter");
  }

  function drawGround() {
    if (isArtReady("groundTile")) {
      const img = art.groundTile;
      const cropY = 32;
      const cropH = img.naturalHeight - cropY;
      const tileW = 130;
      const tileH = VIEW_H - (GROUND_Y - 30);
      const y = GROUND_Y - 30;
      const startTile = Math.floor(state.cameraX / tileW) - 1;
      const endTile = Math.ceil((state.cameraX + VIEW_W) / tileW) + 1;

      for (let i = startTile; i <= endTile; i += 1) {
        drawArtCrop("groundTile", 0, cropY, img.naturalWidth, cropH, i * tileW, y, tileW, tileH);
      }
      return;
    }

    const startTile = Math.floor(state.cameraX / TILE) - 1;
    const endTile = Math.ceil((state.cameraX + VIEW_W) / TILE) + 1;

    const grass = ctx.createLinearGradient(0, GROUND_Y - 34, 0, GROUND_Y + 10);
    grass.addColorStop(0, "#9dff3c");
    grass.addColorStop(0.45, "#3fc42f");
    grass.addColorStop(1, "#177d1e");
    ctx.fillStyle = grass;
    ctx.fillRect(0, GROUND_Y - 30, WORLD_W, 42);
    ctx.fillStyle = "#0e5c18";
    ctx.fillRect(0, GROUND_Y + 1, WORLD_W, 9);

    for (let i = startTile; i <= endTile; i += 1) {
      const x = i * TILE;
      const dirt = ctx.createLinearGradient(x, GROUND_Y + 10, x + TILE, VIEW_H);
      dirt.addColorStop(0, i % 2 === 0 ? "#c26c1d" : "#ad5819");
      dirt.addColorStop(0.62, i % 2 === 0 ? "#9c4a14" : "#823b12");
      dirt.addColorStop(1, "#5e2a0b");
      ctx.fillStyle = dirt;
      ctx.fillRect(x, GROUND_Y + 10, TILE, VIEW_H - GROUND_Y);
      ctx.strokeStyle = "rgba(60, 26, 8, 0.48)";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 3, GROUND_Y + 16, TILE - 6, 48);
      ctx.strokeRect(x + 6, GROUND_Y + 72, TILE - 12, 45);
      ctx.fillStyle = "rgba(255, 196, 72, 0.18)";
      ctx.fillRect(x + 9, GROUND_Y + 24, 16, 7);
      ctx.fillRect(x + 37, GROUND_Y + 84, 14, 6);
      ctx.fillStyle = "rgba(58, 25, 8, 0.22)";
      ctx.beginPath();
      ctx.arc(x + 21, GROUND_Y + 58, 5, 0, Math.PI * 2);
      ctx.arc(x + 49, GROUND_Y + 39, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#68d43e";
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y - 24);
      ctx.lineTo(x + 18, GROUND_Y - 16);
      ctx.lineTo(x + 33, GROUND_Y - 25);
      ctx.lineTo(x + 51, GROUND_Y - 15);
      ctx.lineTo(x + TILE, GROUND_Y - 24);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(12, 98, 17, 0.58)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawBlocks() {
    for (const block of state.blocks) {
      if (!isVisible(block.x, block.w)) {
        continue;
      }
      const y = block.y - easeOut(block.bump / 0.18) * 10;
      if (block.type === "brick") {
        drawBrick(block.x, y, block.w, block.h);
      } else if (block.type === "question") {
        drawQuestion(block.x, y, block.w, block.h, block.hit);
      } else {
        drawLatteBlock(block.x, y, block.w, block.h);
      }
    }
  }

  function drawLaunchedBricks() {
    for (const brick of state.launchedBricks) {
      if (!isVisible(brick.x, brick.w)) {
        continue;
      }
      const progress = brick.age / brick.duration;
      const fade = progress > 0.62 ? (1 - progress) / 0.38 : 1;
      const scale = 1 + progress * 0.08;
      ctx.save();
      ctx.globalAlpha = clamp(fade, 0, 1);
      ctx.translate(brick.x + brick.w * 0.5, brick.y + brick.h * 0.5);
      ctx.rotate(brick.rotation);
      ctx.scale(scale, scale);
      drawBrick(-brick.w * 0.5, -brick.h * 0.5, brick.w, brick.h);
      ctx.restore();
    }
  }

  function drawBrick(x, y, w, h) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    roundRect(x + 6, y + 8, w, h, 8);
    ctx.fill();
    if (drawArt("brickBlock", x, y, w, h)) {
      return;
    }

    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, "#d17921");
    gradient.addColorStop(0.28, "#b95719");
    gradient.addColorStop(0.7, "#7c3410");
    gradient.addColorStop(1, "#4a1e08");
    ctx.fillStyle = gradient;
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = "#281005";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 206, 99, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + h / 2);
    ctx.lineTo(x + w - 6, y + h / 2);
    ctx.moveTo(x + w / 2, y + 8);
    ctx.lineTo(x + w / 2, y + h / 2 - 4);
    ctx.moveTo(x + w / 3, y + h / 2 + 4);
    ctx.lineTo(x + w / 3, y + h - 8);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 221, 122, 0.32)";
    ctx.fillRect(x + 9, y + 8, w - 18, 5);
  }

  function drawQuestion(x, y, w, h, hit) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
    roundRect(x + 6, y + 8, w, h, 7);
    ctx.fill();
    if (!hit && drawArt("questionBlock", x, y, w, h)) {
      return;
    }

    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, hit ? "#9fa65a" : "#c6df31");
    gradient.addColorStop(0.45, hit ? "#738036" : "#8fbb19");
    gradient.addColorStop(1, hit ? "#4b5728" : "#4f7a10");
    ctx.fillStyle = gradient;
    roundRect(x, y, w, h, 7);
    ctx.fill();
    ctx.strokeStyle = "#14240d";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x + 8, y + 8, w - 16, 8);
    ctx.fillStyle = hit ? "#6f7b3f" : "#d8f05a";
    for (const [cx, cy] of [
      [x + 8, y + 8],
      [x + w - 8, y + 8],
      [x + 8, y + h - 8],
      [x + w - 8, y + h - 8],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = "900 44px Arial Black, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#eefbf0";
    ctx.fillStyle = hit ? "#d3dcc5" : "#f7fff2";
    ctx.strokeText(hit ? "." : "?", x + w / 2, y + h / 2 + 3);
    ctx.fillText(hit ? "." : "?", x + w / 2, y + h / 2 + 3);
  }

  function drawLatteBlock(x, y, w, h) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
    roundRect(x + 6, y + 8, w, h, 8);
    ctx.fill();
    if (drawArt("matchaBlockTopLeft", x - 2, y - 2, w + 4, h + 4)) {
      return;
    }

    const gradient = ctx.createLinearGradient(x, y, x, y + h);
    gradient.addColorStop(0, "#cbd77e");
    gradient.addColorStop(0.55, "#718533");
    gradient.addColorStop(1, "#354618");
    ctx.fillStyle = gradient;
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = "#1b2710";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(x + 8, y + 8, w - 16, 7);
    drawLatteIcon(x + 13, y + 12, 40, 36);
  }

  function drawCollectibles() {
    for (const item of state.collectibles) {
      if (item.taken || !isVisible(item.x, item.w)) {
        continue;
      }
      const bob = item.type === "ball" && item.kicked ? 0 : Math.sin(state.elapsed * 5 + item.bob) * 8;
      const emerge = item.emerging ? item.emerging * 46 : 0;
      ctx.save();
      ctx.translate(item.x + item.w / 2, item.y + item.h / 2 + bob + emerge);
      if (item.type === "ball") {
        drawSoccerBall(0, 0, item.w / 2, item.kicked ? item.spin : state.elapsed * 4);
      } else {
        if (item.powerUp) {
          const pulse = 0.5 + Math.sin(state.elapsed * 7) * 0.5;
          const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 34 + pulse * 8);
          glow.addColorStop(0, "rgba(255, 255, 190, 0.96)");
          glow.addColorStop(0.45, "rgba(255, 216, 74, 0.58)");
          glow.addColorStop(1, "rgba(255, 216, 74, 0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(0, 0, 42, 0, Math.PI * 2);
          ctx.fill();
        }
        drawLatteCup(0, 0, item.w, item.h);
      }
      ctx.restore();
    }
  }

  function drawEnemies() {
    for (const enemy of state.enemies) {
      const kicked = !enemy.alive && enemy.defeatType === "kicked";
      const defeatFinished = kicked ? enemy.defeatTimer >= KICKED_MONSTER_DURATION : !enemy.alive && enemy.stomped > 0.55;
      if (defeatFinished || !isVisible(enemy.x, enemy.w)) {
        continue;
      }
      if (kicked) {
        const fade = enemy.defeatTimer <= KICKED_MONSTER_FADE_START
          ? 1
          : 1 - (enemy.defeatTimer - KICKED_MONSTER_FADE_START) / (KICKED_MONSTER_DURATION - KICKED_MONSTER_FADE_START);
        ctx.save();
        ctx.globalAlpha = clamp(fade, 0, 1);
        ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
        ctx.rotate(enemy.roll || 0);
        ctx.scale((enemy.knockbackVx || enemy.vx) < 0 ? -1 : 1, 1);
        ctx.translate(0, enemy.h / 2);
        drawFoodMonster(enemy.kind, enemy.w, enemy.h, false);
        ctx.restore();
        continue;
      }
      const squash = enemy.alive ? 1 : Math.max(0.2, 1 - enemy.stomped * 2.2);
      ctx.save();
      ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h);
      ctx.scale(enemy.vx < 0 ? -1 : 1, squash);
      drawFoodMonster(enemy.kind, enemy.w, enemy.h);
      ctx.restore();
    }
  }

  function drawEnemyProjectiles() {
    for (const projectile of state.enemyProjectiles) {
      if (!projectile.active || !isVisible(projectile.x, projectile.w)) {
        continue;
      }
      ctx.save();
      ctx.translate(projectile.x + projectile.w / 2, projectile.y + projectile.h / 2);
      if (projectile.vx < 0) {
        ctx.scale(-1, 1);
      }
      ctx.rotate(Math.sin(state.elapsed * 18 + projectile.x * 0.02) * 0.08);
      drawSausageProjectile(projectile.w, projectile.h);
      ctx.restore();
    }
  }

  function drawSausageProjectile(w, h) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.72, w * 0.46, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fillStyle = "#d74620";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#6d1d12";
    ctx.stroke();

    ctx.strokeStyle = "#ffd84a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, 0);
    ctx.lineTo(-w * 0.16, -3);
    ctx.lineTo(0, 3);
    ctx.lineTo(w * 0.16, -3);
    ctx.lineTo(w * 0.32, 0);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
    ctx.beginPath();
    ctx.ellipse(-w * 0.18, -h * 0.22, w * 0.13, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPipe() {
    const pipe = state.pipe;
    if (!isVisible(pipe.x, pipe.w)) {
      return;
    }

    const cx = pipe.x + pipe.w / 2;
    const cy = pipe.y + pipe.h * 0.48;
    const pulse = 0.5 + Math.sin(state.elapsed * 5.2) * 0.5;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.ellipse(cx, pipe.y + pipe.h + 8, pipe.w * 0.58, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, pipe.w * 0.86 + pulse * 22);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.94)");
    glow.addColorStop(0.28, "rgba(112, 245, 255, 0.74)");
    glow.addColorStop(0.62, "rgba(117, 78, 255, 0.48)");
    glow.addColorStop(1, "rgba(117, 78, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx, cy, pipe.w * 0.8 + pulse * 16, pipe.h * 0.56 + pulse * 13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 12;
    ctx.strokeStyle = "#25155d";
    ctx.beginPath();
    ctx.ellipse(cx, cy, pipe.w * 0.43, pipe.h * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#8df8ff";
    ctx.beginPath();
    ctx.ellipse(cx, cy, pipe.w * 0.37, pipe.h * 0.44, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255, 232, 90, 0.78)";
    for (let i = 0; i < 3; i += 1) {
      const spin = state.elapsed * 1.7 + i * 2.1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, pipe.w * (0.18 + i * 0.055), pipe.h * 0.42, spin, 0.35, Math.PI * 1.55);
      ctx.stroke();
    }

    drawSoccerBall(cx, pipe.y + 32, 18, state.elapsed * 3);
    ctx.font = "900 18px Arial Black, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#17133f";
    ctx.fillStyle = "#f7ffad";
    ctx.strokeText("PENALTY", cx, pipe.y - 32);
    ctx.fillText("PENALTY", cx, pipe.y - 32);
    ctx.strokeText("PORTAL", cx, pipe.y - 10);
    ctx.fillText("PORTAL", cx, pipe.y - 10);
    ctx.restore();
  }

  const POSE_VISUAL_SCALE = { kick: 1, jump: 1, kneel: 0.92 };
  const POSE_BASELINE_OFFSET = { kneel: 6 };

  function readyPose(name) {
    const img = currentCharacter().poses[name];
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }

  function drawPlayer() {
    const player = state.player;
    if (player.invulnerable > 0 && Math.floor(state.elapsed * 18) % 2 === 0) {
      return;
    }

    let frame = null;
    let crop = null;
    let visualH = PLAYER_VISUAL_HEIGHT;
    let baselineOffset = 0;

    const pickPose = (name) => {
      const img = readyPose(name);
      if (!img) {
        return false;
      }
      frame = img;
      crop = img.trimCrop || null;
      visualH = PLAYER_VISUAL_HEIGHT * (POSE_VISUAL_SCALE[name] || 1);
      baselineOffset = POSE_BASELINE_OFFSET[name] || 0;
      return true;
    };

    let posed = false;
    if (player.kickTimer > 0) {
      posed = pickPose("kick");
    } else if (player.crouching && state.mode === "playing") {
      posed = pickPose("kneel");
    } else if (player.onGround && player.landTimer > 0 && Math.abs(player.vx) < 60) {
      posed = pickPose("kneel");
    } else if (!player.onGround && player.vy < 0) {
      posed = pickPose("jump");
    }

    if (!posed) {
      const IDLE_FRAME_INDEX = 15;
      let frameIndex = IDLE_FRAME_INDEX;
      if (!player.onGround) {
        frameIndex = player.vy < 0 ? 4 : 14;
      } else if (Math.abs(player.vx) > 14) {
        frameIndex = Math.floor(player.anim) % currentFrames().length;
      }
      frame = currentFrames()[frameIndex];
      crop = currentCrops()[frameIndex];
    }
    if (player.poweredUp) {
      visualH *= PLAYER_POWER_SCALE;
      baselineOffset *= PLAYER_POWER_SCALE;
    }
    ctx.save();
    if (player.facing < 0) {
      ctx.translate(player.x + player.w, player.y);
      ctx.scale(-1, 1);
      drawPlayerFrame(frame, crop, 0, 0, player.w, player.h, visualH, baselineOffset);
    } else {
      drawPlayerFrame(frame, crop, player.x, player.y, player.w, player.h, visualH, baselineOffset);
    }
    ctx.restore();
  }

  function drawPlayerFrame(frame, crop, x, y, w, h, visualH = PLAYER_VISUAL_HEIGHT, baselineOffset = 0) {
    if (frame && frame.complete && frame.naturalWidth > 0) {
      const source = getFrameSource(frame, crop);
      const drawH = visualH;
      const drawW = drawH * (source.w / source.h);
      const drawX = x + w / 2 - drawW / 2;
      const alphaBottom = frame.alphaCrop ? frame.alphaCrop.y + frame.alphaCrop.h : source.y + source.h;
      const bottomPadding = Math.max(0, source.y + source.h - alphaBottom);
      const alphaBaselineOffset = (bottomPadding / source.h) * drawH;
      const drawY = y + h - drawH + baselineOffset + alphaBaselineOffset;
      drawFrameImage(frame, source, drawX, drawY, drawW, drawH);
      return;
    }

    if (isArtReady("playerCharacter")) {
      const fallback = art.playerCharacter;
      const drawH = visualH;
      const drawW = drawH * (fallback.naturalWidth / fallback.naturalHeight);
      const drawX = x + w / 2 - drawW / 2;
      const drawY = y + h - drawH + baselineOffset;
      drawArt("playerCharacter", drawX, drawY, drawW, drawH);
      return;
    }

    ctx.fillStyle = "#fff7ee";
    roundRect(x + 9, y + 10, w - 18, h - 10, 18);
    ctx.fill();
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#181818";
    ctx.fillRect(x + 8, y + 78, 20, 34);
    ctx.fillRect(x + w - 28, y + 78, 20, 34);
  }

  function drawFrameImage(frame, source, x, y, w, h) {
    ctx.drawImage(frame, source.x, source.y, source.w, source.h, x, y, w, h);
  }

  function getFrameSource(frame, crop) {
    if (
      crop &&
      crop.x >= 0 &&
      crop.y >= 0 &&
      crop.w > 0 &&
      crop.h > 0 &&
      crop.x + crop.w <= frame.naturalWidth &&
      crop.y + crop.h <= frame.naturalHeight
    ) {
      return crop;
    }

    return { x: 0, y: 0, w: frame.naturalWidth, h: frame.naturalHeight };
  }

  function drawParticles() {
    for (const particle of state.particles) {
      ctx.globalAlpha = clamp(particle.life / 0.7, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawHud() {
    ctx.save();
    if (isPhoneViewport()) {
      drawPhoneHud();
      ctx.restore();
      return;
    }

    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#12243f";
    ctx.lineJoin = "round";
    ctx.lineWidth = 6;
    ctx.font = "900 28px Arial Black, Arial, sans-serif";

    strokeFillText(`x ${state.lives}`, 84, 36);
    drawPortrait(35, 28);
    drawSoccerBall(65, 104, 24, 0);
    strokeFillText(`x ${pad2(state.balls)}/${pad2(state.totalBalls)}`, 98, 82);
    drawLatteCup(62, 160, 42, 42);
    strokeFillText(`x ${pad2(state.lattes)}/${pad2(state.totalLattes)}`, 98, 143);

    ctx.textAlign = "center";
    ctx.font = "900 28px Arial Black, Arial, sans-serif";
    strokeFillText("TIME", VIEW_W - 250, 32);
    strokeFillText(String(Math.ceil(state.timer)).padStart(3, "0"), VIEW_W - 250, 68);
    strokeFillText("SCORE", VIEW_W - 90, 32);
    strokeFillText(String(state.score).padStart(6, "0"), VIEW_W - 90, 68);

    if (SHOW_RESPONSE_LABEL && state.mode === "playing" && state.messageTimer > 0) {
      ctx.font = "800 24px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(15, 31, 42, 0.74)";
      roundRect(VIEW_W / 2 - 230, 632, 460, 52, 12);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.42)";
      ctx.lineWidth = 4;
      strokeFillText(state.message, VIEW_W / 2, 645);
    }

    ctx.restore();
  }

  function drawPhoneHud() {
    const rect = phoneVisibleCanvasRect();
    const x = rect.x + rect.w / 2 - 170;
    const y = rect.y + 16;
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(6, 23, 50, 0.58)";
    roundRect(x, y, 340, 92, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#12243f";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.font = "900 21px Arial Black, Arial, sans-serif";
    ctx.textAlign = "left";
    drawPortrait(x + 14, y + 20);
    strokeFillText(`x ${state.lives}`, x + 74, y + 30);
    drawSoccerBall(x + 142, y + 43, 17, 0);
    strokeFillText(`${pad2(state.balls)}/${pad2(state.totalBalls)}`, x + 166, y + 29);
    drawLatteCup(x + 251, y + 40, 30, 30);
    strokeFillText(`${pad2(state.lattes)}/${pad2(state.totalLattes)}`, x + 275, y + 29);

    ctx.font = "900 17px Arial Black, Arial, sans-serif";
    strokeFillText(`T ${String(Math.ceil(state.timer)).padStart(3, "0")}`, x + 74, y + 66);
    strokeFillText(`S ${String(state.score).padStart(6, "0")}`, x + 178, y + 66);

    if (SHOW_RESPONSE_LABEL && state.mode === "playing" && state.messageTimer > 0) {
      ctx.font = "800 20px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(15, 31, 42, 0.76)";
      roundRect(VIEW_W / 2 - 180, 596, 360, 46, 12);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.42)";
      ctx.lineWidth = 4;
      strokeFillText(state.message, VIEW_W / 2, 608);
    }
  }

  function drawTitle() {
    if (isPhoneViewport()) {
      drawPhoneTitle();
      return;
    }

    ctx.save();
    ctx.fillStyle = "rgba(10, 40, 88, 0.26)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = "center";
    ctx.lineJoin = "round";

    if (!drawArt("logo", VIEW_W / 2 - 222, 44, 444, 158)) {
      ctx.font = "900 116px Arial Black, Arial, sans-serif";
      ctx.lineWidth = 12;
      ctx.fillStyle = "rgba(75, 35, 0, 0.95)";
      ctx.fillText("dp.AI", VIEW_W / 2 + 18, 156);
      ctx.strokeStyle = "#4a2500";
      ctx.fillStyle = "#ffce1b";
      ctx.strokeText("dp.AI", VIEW_W / 2 + 10, 132);
      ctx.fillText("dp.AI", VIEW_W / 2 + 10, 132);
    }

    ctx.font = "900 40px Arial Black, Arial, sans-serif";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#10223b";
    ctx.fillStyle = "#ffffff";
    ctx.strokeText("LEVEL 1", VIEW_W / 2, 190);
    ctx.fillText("LEVEL 1", VIEW_W / 2, 190);
    ctx.strokeText("LOS ANGELES", VIEW_W / 2, 236);
    ctx.fillText("LOS ANGELES", VIEW_W / 2, 236);

    if (SHOW_CHARACTER_SELECTOR) {
      drawCharacterSelector();
    }

    const panelY = SHOW_CHARACTER_SELECTOR ? 491 : 370;
    const fallbackPanelY = panelY + 10;
    if (!drawArt("instructionPanel", VIEW_W / 2 - 310, panelY, 621, 103)) {
      ctx.fillStyle = "rgba(17, 24, 38, 0.82)";
      roundRect(VIEW_W / 2 - 332, fallbackPanelY, 664, 126, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.font = "800 26px Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    if (!isArtReady("instructionPanel")) {
      ctx.fillText("Kick soccer balls, collect matcha lattes, then reach the portal.", VIEW_W / 2, fallbackPanelY + 27);
    }
    ctx.font = "700 22px Arial, sans-serif";
    ctx.fillText("Move: A/D or Arrows    Jump: W / Up / Space (double-tap: super)    Kick: K", VIEW_W / 2, panelY + 119);
    ctx.fillText("Portal opens the penalty game after collection    F fullscreen", VIEW_W / 2, panelY + 147);
    ctx.fillStyle = "#ffd83d";
    ctx.font = "900 24px Arial Black, Arial, sans-serif";
    const active = currentCharacter();
    ctx.fillText(characterLoadPrompt(active, "Press Enter or Space to start"), VIEW_W / 2, panelY + 184);
    ctx.restore();
  }

  function drawPhoneTitle() {
    const rect = phoneVisibleCanvasRect();
    const landscape = window.matchMedia("(orientation: landscape)").matches;
    const cx = rect.x + rect.w / 2;
    const contentW = Math.min(430, rect.w - 24);
    const scale = landscape ? 0.72 : clamp(contentW / 430, 0.72, 1);
    const controlsTop = phoneControlsTopY();
    const bottomLimit = Math.min(rect.y + rect.h - 18, controlsTop - 12);
    const logoW = landscape ? 210 : Math.min(contentW * 0.9, 306);
    const logoH = logoW * (158 / 444);
    const logoY = rect.y + (landscape ? 10 : 30);

    ctx.save();
    ctx.fillStyle = "rgba(10, 36, 76, 0.3)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";

    if (!drawArt("logo", cx - logoW / 2, logoY, logoW, logoH)) {
      ctx.font = `900 ${Math.round(72 * scale)}px Arial Black, Arial, sans-serif`;
      ctx.lineWidth = Math.max(6, 9 * scale);
      ctx.strokeStyle = "#4a2500";
      ctx.fillStyle = "#ffce1b";
      ctx.strokeText("dp.AI", cx, logoY + 4);
      ctx.fillText("dp.AI", cx, logoY + 4);
    }

    ctx.font = `900 ${landscape ? 22 : Math.round(31 * scale)}px Arial Black, Arial, sans-serif`;
    ctx.lineWidth = Math.max(4, 6 * scale);
    ctx.strokeStyle = "#10223b";
    ctx.fillStyle = "#ffffff";
    strokeFillText("LEVEL 1", cx, logoY + logoH + (landscape ? 4 : 12));
    strokeFillText("LOS ANGELES", cx, logoY + logoH + (landscape ? 32 : 48 * scale));

    const selectorY = logoY + logoH + (landscape ? 80 : 105 * scale);
    if (SHOW_CHARACTER_SELECTOR) {
      drawPhoneCharacterSelector(cx, selectorY, contentW, scale);
    }

    const panelH = landscape ? 58 : 74 * scale;
    const panelGap = SHOW_CHARACTER_SELECTOR ? 38 : 106;
    const panelY = landscape && SHOW_CHARACTER_SELECTOR
      ? selectorY + 112
      : bottomLimit - panelH - panelGap * scale;
    ctx.fillStyle = "rgba(17, 24, 38, 0.78)";
    roundRect(cx - contentW / 2, panelY, contentW, panelH, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.34)";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 3;
    ctx.font = `900 ${landscape ? 16 : Math.round(22 * scale)}px Arial Black, Arial, sans-serif`;
    strokeFillText("Collect soccer balls", cx, panelY + (landscape ? 8 : 11 * scale));
    ctx.font = `800 ${landscape ? 14 : Math.round(19 * scale)}px Arial, sans-serif`;
    strokeFillText("and matcha lattes", cx, panelY + (landscape ? 31 : 40 * scale));

    ctx.fillStyle = "#ffd83d";
    ctx.strokeStyle = "#10223b";
    ctx.lineWidth = 4;
    ctx.font = `900 ${landscape ? 16 : Math.round(20 * scale)}px Arial Black, Arial, sans-serif`;
    const active = currentCharacter();
    strokeFillText(characterLoadPrompt(active, "Tap Start or Jump"), cx, bottomLimit - (landscape ? 22 : 27 * scale));
    ctx.restore();
  }

  function drawPhoneCharacterSelector(centerX, y, contentW, scale) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `900 ${Math.round(19 * scale)}px Arial Black, Arial, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#10223b";
    ctx.lineWidth = Math.max(3, 4 * scale);
    strokeFillText("CHOOSE CHARACTER", centerX, y - 28 * scale);

    const gap = 8 * scale;
    const cardW = (contentW - gap * 2) / characterSets.length;
    const cardH = Math.min(142 * scale, Math.max(112 * scale, cardW * 1.18));
    const startX = centerX - contentW / 2;
    for (let i = 0; i < characterSets.length; i += 1) {
      const character = characterSets[i];
      const x = startX + i * (cardW + gap);
      const selected = i === selectedCharacterIndex;
      ctx.fillStyle = selected ? "rgba(255, 216, 61, 0.92)" : "rgba(15, 31, 42, 0.76)";
      roundRect(x, y, cardW, cardH, 10);
      ctx.fill();
      ctx.strokeStyle = selected ? "#4a2500" : "rgba(255,255,255,0.42)";
      ctx.lineWidth = selected ? 4 : 2.5;
      ctx.stroke();

      drawCharacterPreview(character, x + cardW / 2, y + 10 * scale, Math.min(72 * scale, cardH * 0.48));
      ctx.font = `800 ${Math.round(12 * scale)}px Arial, sans-serif`;
      ctx.fillStyle = selected ? "#12243f" : "#ffffff";
      ctx.fillText(character.name, x + cardW / 2, y + cardH - 34 * scale);
      ctx.font = `700 ${Math.round(11 * scale)}px Arial, sans-serif`;
      ctx.fillText(selected ? "Selected" : "Switch", x + cardW / 2, y + cardH - 17 * scale);
    }
    ctx.restore();
  }

  function phoneVisibleCanvasRect() {
    const viewportW = Math.max(1, window.innerWidth || document.documentElement.clientWidth || VIEW_W);
    const viewportH = Math.max(1, window.innerHeight || document.documentElement.clientHeight || VIEW_H);
    const scale = Math.max(viewportW / VIEW_W, viewportH / VIEW_H);
    const w = viewportW / scale;
    const h = viewportH / scale;
    return {
      x: (VIEW_W - w) / 2,
      y: VIEW_H - h,
      w,
      h,
    };
  }

  function phoneControlsTopY() {
    const viewportW = Math.max(1, window.innerWidth || document.documentElement.clientWidth || VIEW_W);
    const viewportH = Math.max(1, window.innerHeight || document.documentElement.clientHeight || VIEW_H);
    const scale = Math.max(viewportW / VIEW_W, viewportH / VIEW_H);
    const controls = document.querySelector(".mobile-controls");
    if (!controls || getComputedStyle(controls).display === "none") {
      return VIEW_H;
    }
    const controlSurfaces = controls.querySelectorAll(".virtual-joystick, .mobile-actions");
    const top = Math.min(...Array.from(controlSurfaces, (element) => element.getBoundingClientRect().top));
    return Number.isFinite(top) ? VIEW_H - (viewportH - top) / scale : VIEW_H;
  }

  function drawCharacterSelector() {
    const centerX = VIEW_W / 2;
    const y = 286;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "900 22px Arial Black, Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#10223b";
    ctx.lineWidth = 5;
    strokeFillText("CHOOSE CHARACTER", centerX, y - 34);

    const cardW = 136;
    const cardH = 164;
    const gap = 18;
    const startX = centerX - (characterSets.length * cardW + (characterSets.length - 1) * gap) / 2;
    for (let i = 0; i < characterSets.length; i += 1) {
      const character = characterSets[i];
      const x = startX + i * (cardW + gap);
      const selected = i === selectedCharacterIndex;
      ctx.fillStyle = selected ? "rgba(255, 216, 61, 0.92)" : "rgba(15, 31, 42, 0.78)";
      roundRect(x, y, cardW, cardH, 10);
      ctx.fill();
      ctx.strokeStyle = selected ? "#4a2500" : "rgba(255,255,255,0.42)";
      ctx.lineWidth = selected ? 5 : 3;
      ctx.stroke();

      drawCharacterPreview(character, x + cardW / 2, y + 16, 88);
      ctx.font = "800 15px Arial, sans-serif";
      ctx.fillStyle = selected ? "#12243f" : "#ffffff";
      ctx.fillText(character.name, x + cardW / 2, y + 125);
      ctx.font = "700 13px Arial, sans-serif";
      ctx.fillText(selected ? "Selected" : "Switch", x + cardW / 2, y + 146);
    }

    ctx.font = "900 30px Arial Black, Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#10223b";
    ctx.lineWidth = 6;
    strokeFillText("<", startX - 26, y + 58);
    strokeFillText(">", startX + characterSets.length * cardW + (characterSets.length - 1) * gap + 26, y + 58);
    ctx.restore();
  }

  function drawCharacterPreview(character, centerX, y, height) {
    const frame = character.frames[0];
    if (frame && frame.complete && frame.naturalWidth > 0) {
      const source = getFrameSource(frame, character.crops[0]);
      const width = height * (source.w / source.h);
      drawFrameImage(frame, source, centerX - width / 2, y, width, height);
      return;
    }

    if (isArtReady("playerCharacter")) {
      const fallback = art.playerCharacter;
      const width = height * (fallback.naturalWidth / fallback.naturalHeight);
      drawArt("playerCharacter", centerX - width / 2, y, width, height);
      return;
    }

    ctx.fillStyle = "#fff7ee";
    roundRect(centerX - 24, y + 10, 48, height - 12, 14);
    ctx.fill();
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function drawPortalChoice() {
    const phone = isPhoneViewport();
    const rect = phone ? phoneVisibleCanvasRect() : { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
    const controlsTop = phone ? phoneControlsTopY() : VIEW_H;
    const panelW = Math.min(phone ? rect.w - 30 : 620, 620);
    const panelH = phone ? 188 : 210;
    const x = rect.x + rect.w / 2 - panelW / 2;
    const y = phone ? Math.max(rect.y + 150, controlsTop - panelH - 28) : 240;

    ctx.save();
    ctx.fillStyle = "rgba(8, 20, 38, 0.34)";
    ctx.fillRect(rect.x, rect.y, rect.w, Math.min(rect.h, controlsTop - rect.y));
    ctx.fillStyle = "rgba(8, 22, 46, 0.84)";
    roundRect(x, y, panelW, panelH, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(155, 247, 255, 0.78)";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#10223b";
    ctx.fillStyle = "#f7ffad";
    ctx.lineWidth = phone ? 5 : 7;
    ctx.font = `900 ${phone ? 28 : 42}px Arial Black, Arial, sans-serif`;
    strokeFillText("PLAY PENALTY KICK?", x + panelW / 2, y + (phone ? 18 : 22));

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 4;
    ctx.font = `800 ${phone ? 17 : 24}px Arial, sans-serif`;
    strokeFillText("Collection complete. Add your run score,", x + panelW / 2, y + (phone ? 65 : 84));
    strokeFillText("then try for penalty bonus points.", x + panelW / 2, y + (phone ? 91 : 116));

    const playText = phone ? "Start / Jump: Play" : "Enter / Space / Y: Play";
    const skipText = phone ? "Down: Skip" : "Esc / Down / N: Skip";
    ctx.font = `900 ${phone ? 18 : 24}px Arial Black, Arial, sans-serif`;
    ctx.fillStyle = "#ffd83d";
    ctx.strokeStyle = "#10223b";
    ctx.lineWidth = 4;
    strokeFillText(playText, x + panelW / 2, y + panelH - (phone ? 62 : 64));
    ctx.fillStyle = "#ffffff";
    strokeFillText(skipText, x + panelW / 2, y + panelH - (phone ? 34 : 32));
    ctx.restore();
  }

  function drawResetConfirmation() {
    const phone = isPhoneViewport();
    const rect = phone ? phoneVisibleCanvasRect() : { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
    const controlsTop = phone ? phoneControlsTopY() : VIEW_H;
    const panelW = Math.min(phone ? rect.w - 30 : 560, 560);
    const panelH = phone ? 178 : 196;
    const x = rect.x + rect.w / 2 - panelW / 2;
    const y = phone ? Math.max(rect.y + 154, controlsTop - panelH - 30) : 252;

    ctx.save();
    ctx.fillStyle = "rgba(8, 20, 38, 0.46)";
    ctx.fillRect(rect.x, rect.y, rect.w, Math.min(rect.h, controlsTop - rect.y));
    ctx.fillStyle = "rgba(8, 22, 46, 0.9)";
    roundRect(x, y, panelW, panelH, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 216, 61, 0.82)";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#10223b";
    ctx.fillStyle = "#ffd83d";
    ctx.lineWidth = phone ? 5 : 7;
    ctx.font = `900 ${phone ? 28 : 40}px Arial Black, Arial, sans-serif`;
    strokeFillText("RESTART RUN?", x + panelW / 2, y + (phone ? 18 : 22));

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 4;
    ctx.font = `800 ${phone ? 17 : 23}px Arial, sans-serif`;
    strokeFillText("This will return to character select", x + panelW / 2, y + (phone ? 65 : 80));
    strokeFillText("and clear the current run.", x + panelW / 2, y + (phone ? 91 : 111));

    const confirmText = phone ? "Start / Jump: Confirm" : "Enter / Space / Y: Confirm";
    const cancelText = phone ? "Down / Left: Cancel" : "Esc / Down / N: Cancel";
    ctx.font = `900 ${phone ? 18 : 23}px Arial Black, Arial, sans-serif`;
    ctx.fillStyle = "#ffd83d";
    ctx.strokeStyle = "#10223b";
    ctx.lineWidth = 4;
    strokeFillText(confirmText, x + panelW / 2, y + panelH - (phone ? 56 : 58));
    ctx.fillStyle = "#ffffff";
    strokeFillText(cancelText, x + panelW / 2, y + panelH - (phone ? 30 : 30));
    ctx.restore();
  }

  function drawEndScreen(title, subtitle) {
    ctx.save();
    ctx.fillStyle = "rgba(8, 21, 39, 0.58)";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.font = "900 74px Arial Black, Arial, sans-serif";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#101b2d";
    ctx.fillStyle = title === "TRY AGAIN" ? "#ffffff" : "#ffdf38";
    ctx.strokeText(title, VIEW_W / 2, 255);
    ctx.fillText(title, VIEW_W / 2, 255);
    ctx.font = "800 28px Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(subtitle, VIEW_W / 2, 316);
    ctx.fillText(`Score ${String(state.score).padStart(6, "0")}`, VIEW_W / 2, 360);
    ctx.fillStyle = "#ffd83d";
    ctx.font = "900 26px Arial Black, Arial, sans-serif";
    ctx.fillText("Press Enter to play again or R to reset", VIEW_W / 2, 426);
    ctx.restore();
  }

  function drawPortrait(x, y) {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    roundRect(x, y, 52, 52, 13);
    ctx.fill();
    ctx.clip();
    const character = currentCharacter();
    const frame = character.frames[0];
    if (frame && frame.complete && frame.naturalWidth > 0) {
      const crop = getFrameSource(frame, character.crops[0]);
      const portraitH = 58;
      const portraitW = portraitH * (crop.w / crop.h);
      drawFrameImage(frame, crop, x + 26 - portraitW / 2, y + 1, portraitW, portraitH);
    } else {
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(x + 26, y + 25, 19, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = "#072249";
    ctx.lineWidth = 4;
    roundRect(x, y, 52, 52, 13);
    ctx.stroke();
  }

  function drawSideBuilding(x, y, w, h, side) {
    ctx.save();
    ctx.translate(x, y);
    const facade = ctx.createLinearGradient(0, 0, w, 0);
    facade.addColorStop(0, side === "left" ? "#f3d5b1" : "#9b6f56");
    facade.addColorStop(0.52, side === "left" ? "#d7a779" : "#6c4637");
    facade.addColorStop(1, side === "left" ? "#91654f" : "#3f2c2c");
    ctx.fillStyle = facade;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(side === "left" ? w - 36 : 0, 0, 36, h);
    ctx.strokeStyle = "rgba(75, 45, 32, 0.55)";
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, w, h);

    for (let floor = 22; floor < h - 40; floor += 74) {
      ctx.fillStyle = "rgba(51, 103, 132, 0.72)";
      roundRect(36, floor, 54, 42, 4);
      ctx.fill();
      roundRect(w - 92, floor + 8, 48, 38, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(250, 235, 205, 0.42)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
      ctx.fillRect(43, floor + 7, 14, 28);
      ctx.fillRect(w - 84, floor + 14, 12, 24);
    }

    ctx.fillStyle = side === "left" ? "#d2864b" : "#2f3d57";
    ctx.beginPath();
    ctx.moveTo(0, h - 72);
    ctx.lineTo(w, h - 100);
    ctx.lineTo(w, h - 72);
    ctx.lineTo(0, h - 42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTrafficLight(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#253245";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 158);
    ctx.lineTo(0, 34);
    ctx.quadraticCurveTo(26, 10, 58, 18);
    ctx.lineTo(88, 18);
    ctx.stroke();
    ctx.fillStyle = "#263447";
    roundRect(70, 0, 34, 94, 8);
    ctx.fill();
    ctx.strokeStyle = "#111928";
    ctx.lineWidth = 3;
    ctx.stroke();
    const lights = [
      ["#ef2e2e", 18],
      ["#ffd33d", 47],
      ["#3fcf4f", 76],
    ];
    for (const [color, cy] of lights) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(87, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.36)";
      ctx.beginPath();
      ctx.arc(84, cy - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawShrub(x, y, scale, artName = "bushCenter") {
    if (isArtReady(artName)) {
      const img = art[artName];
      drawArt(artName, x, y, img.naturalWidth * scale, img.naturalHeight * scale);
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const colors = ["#45b52e", "#65d438", "#2b8f22", "#77e144"];
    for (let i = 0; i < 18; i += 1) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc((i % 6) * 20 + Math.sin(i) * 7, 25 - Math.floor(i / 6) * 12, 18 + (i % 3) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPalm(x, groundY, scale) {
    ctx.save();
    ctx.translate(x, groundY);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#74451b";
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.quadraticCurveTo(-5, -70, 2, -154);
    ctx.quadraticCurveTo(19, -74, 13, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(35,20,10,0.45)";
    ctx.lineWidth = 3;
    for (let y = -132; y < -15; y += 22) {
      ctx.beginPath();
      ctx.moveTo(-7, y);
      ctx.lineTo(12, y + 10);
      ctx.stroke();
    }
    ctx.translate(2, -158);
    for (let i = 0; i < 9; i += 1) {
      ctx.rotate((Math.PI * 2) / 9);
      const grad = ctx.createLinearGradient(0, 0, 90, 0);
      grad.addColorStop(0, "#245b1d");
      grad.addColorStop(1, "#5fc434");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(54, -22, 112, 7);
      ctx.quadraticCurveTo(54, 18, 0, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLASign(x, y) {
    ctx.save();
    ctx.translate(x, y);
    if (isArtReady("laRoadSign")) {
      ctx.fillStyle = "#29384a";
      ctx.fillRect(57, 118, 12, 138);
      ctx.fillRect(5, 249, 120, 10);
      drawArt("laRoadSign", 0, 0, 129, 138);
      ctx.restore();
      return;
    }

    ctx.fillStyle = "#29384a";
    ctx.fillRect(54, 92, 12, 160);
    ctx.fillRect(2, 248, 120, 10);
    ctx.fillStyle = "#195ba9";
    roundRect(0, 0, 118, 92, 8);
    ctx.fill();
    ctx.strokeStyle = "#f6fbff";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 48px Arial Black, Arial, sans-serif";
    ctx.fillText("LA", 24, 50);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(28, 70);
    ctx.lineTo(84, 70);
    ctx.moveTo(84, 70);
    ctx.lineTo(68, 55);
    ctx.moveTo(84, 70);
    ctx.lineTo(68, 85);
    ctx.stroke();
    ctx.restore();
  }

  function drawRoadSign(x, y, text, artName, width) {
    ctx.save();
    ctx.translate(x, y);
    if (artName && isArtReady(artName)) {
      const img = art[artName];
      const signW = width;
      const signH = signW * (img.naturalHeight / img.naturalWidth);
      ctx.fillStyle = "#223d31";
      ctx.fillRect(15, signH - 2, 8, 92);
      ctx.fillRect(signW - 23, signH - 2, 8, 92);
      drawArt(artName, 0, 0, signW, signH);
      ctx.restore();
      return;
    }

    ctx.fillStyle = "#223d31";
    ctx.fillRect(12, 38, 8, 70);
    ctx.fillRect(136, 38, 8, 70);
    ctx.fillStyle = "#238446";
    roundRect(0, 0, 156, 42, 6);
    ctx.fill();
    ctx.strokeStyle = "#d7f5e1";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#f4fff7";
    ctx.font = "700 18px Arial, sans-serif";
    ctx.fillText(text, 14, 26);
    ctx.restore();
  }

  function drawBillboard(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#493c34";
    ctx.fillRect(18, 112, 8, 176);
    ctx.fillRect(102, 112, 8, 176);
    ctx.fillStyle = "#ead6bd";
    roundRect(0, 0, 128, 112, 8);
    ctx.fill();
    ctx.strokeStyle = "#9c7d5f";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#2d2119";
    ctx.font = "800 20px Arial, sans-serif";
    ctx.fillText("Dream", 22, 34);
    ctx.fillText("Big.", 22, 59);
    ctx.fillText("Play.", 22, 84);
    ctx.restore();
  }

  const FOOD_MONSTER_EMOJI = { burger: "\u{1F354}", hotdog: "\u{1F32D}", fries: "\u{1F35F}" };

  (function warmFoodMonsterEmojiFont() {
    ctx.save();
    ctx.font = `${64}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    Object.values(FOOD_MONSTER_EMOJI).forEach((emoji) => ctx.fillText(emoji, -500, -500));
    ctx.restore();
  })();

  function drawFoodMonster(kind, w, h, showShadow = true) {
    const emoji = FOOD_MONSTER_EMOJI[kind] || FOOD_MONSTER_EMOJI.burger;
    const size = Math.round(h * 1.15);
    ctx.save();
    if (showShadow) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.beginPath();
      ctx.ellipse(0, 2, w * 0.42, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.fillText(emoji, 0, 4);
    ctx.restore();
  }

  function drawSoccerBall(x, y, r, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    if (drawArtCentered("soccerBall", 0, 0, r * 2.18, r * 2.12)) {
      ctx.restore();
      return;
    }

    ctx.fillStyle = "#fbfbfb";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#111";
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.stroke();
    ctx.fillStyle = "#141414";
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const px = Math.cos(angle) * r * 0.34;
      const py = Math.sin(angle) * r * 0.34;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * r * 0.42, Math.sin(angle) * r * 0.42);
      ctx.lineTo(Math.cos(angle) * r * 0.9, Math.sin(angle) * r * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLatteCup(x, y, w, h) {
    ctx.save();
    ctx.translate(x, y);
    drawLatteIcon(-w / 2 + 2, -h / 2 + 7, w - 8, h - 12);
    ctx.restore();
  }

  function drawLatteIcon(x, y, w, h) {
    ctx.save();
    if (drawArt("latteCup", x, y, w, h)) {
      ctx.restore();
      return;
    }

    ctx.strokeStyle = "#385117";
    ctx.lineWidth = 4;
    ctx.fillStyle = "#eef7c5";
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.12, w * 0.48, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const cupGradient = ctx.createLinearGradient(x, y, x, y + h);
    cupGradient.addColorStop(0, "#f7f0c4");
    cupGradient.addColorStop(1, "#7b9b32");
    ctx.fillStyle = cupGradient;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.14, y + h * 0.14);
    ctx.lineTo(x + w * 0.86, y + h * 0.14);
    ctx.lineTo(x + w * 0.73, y + h * 0.86);
    ctx.quadraticCurveTo(x + w * 0.5, y + h, x + w * 0.27, y + h * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#d8f4a0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y + h * 0.3);
    ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.44, x + w * 0.47, y + h * 0.65);
    ctx.moveTo(x + w * 0.5, y + h * 0.3);
    ctx.quadraticCurveTo(x + w * 0.7, y + h * 0.44, x + w * 0.53, y + h * 0.65);
    ctx.stroke();
    ctx.restore();
  }

  function strokeFillText(text, x, y) {
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function isVisible(x, w) {
    return x + w >= state.cameraX - 80 && x <= state.cameraX + VIEW_W + 80;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function approach(value, target, amount) {
    if (value < target) {
      return Math.min(value + amount, target);
    }
    return Math.max(value - amount, target);
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  }

  function wrapScreenX(x, width) {
    let wrapped = x;
    const span = VIEW_W + width * 2;
    while (wrapped < -width) {
      wrapped += span;
    }
    while (wrapped > VIEW_W + width) {
      wrapped -= span;
    }
    return wrapped;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // The portal still works without score carryover if storage is blocked.
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  function handleKeyDown(event) {
    const code = event.code;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(code)) {
      event.preventDefault();
    }

    if (state.mode === "resetConfirm") {
      if (code === "Enter" || code === "Space" || code === "ArrowUp" || code === "KeyW" || code === "KeyY") {
        confirmReset();
      } else if (code === "Escape" || code === "ArrowDown" || code === "KeyS" || code === "KeyN") {
        cancelResetConfirmation();
      }
      return;
    }

    if (state.mode === "portalChoice") {
      if (code === "Enter" || code === "Space" || code === "ArrowUp" || code === "KeyW" || code === "KeyY") {
        choosePortal(true);
      } else if (code === "Escape" || code === "ArrowDown" || code === "KeyS" || code === "KeyN") {
        choosePortal(false);
      }
      return;
    }

    if (SHOW_CHARACTER_SELECTOR && (state.mode === "title" || state.mode === "won" || state.mode === "lost")) {
      if (code === "ArrowLeft" || code === "KeyQ") {
        selectCharacter(-1);
        return;
      }
      if (code === "ArrowRight" || code === "KeyE") {
        selectCharacter(1);
        return;
      }
    }
    if (!SHOW_CHARACTER_SELECTOR && (state.mode === "title" || state.mode === "won" || state.mode === "lost")) {
      if (code === "ArrowLeft" || code === "KeyA" || code === "KeyQ" || code === "ArrowRight" || code === "KeyD" || code === "KeyE") {
        return;
      }
    }

    if (code === "ArrowLeft" || code === "KeyA") input.left = true;
    if (code === "ArrowRight" || code === "KeyD") input.right = true;
    if (code === "ArrowDown" || code === "KeyS") input.down = true;
    if (code === "ArrowUp" || code === "KeyW" || code === "Space") {
      if (!input.jump) {
        input.jumpBuffer = 0.14;
        if (state.mode === "playing") {
          noteJumpTap();
        }
      }
      input.jump = true;
      if (state.mode === "title") {
        startGame();
      }
    }
    if (code === "Enter") {
      if (state.mode === "title" || state.mode === "won" || state.mode === "lost") {
        startGame();
      }
    }
    if (code === "KeyK" && state.mode === "playing") {
      performKick();
    }
    if (code === "KeyR") {
      requestResetConfirmation();
    }
    if (code === "KeyF") {
      toggleFullscreen();
    }
    if (code === "KeyP" && (state.mode === "playing" || state.mode === "paused")) {
      state.mode = state.mode === "playing" ? "paused" : "playing";
      if (state.mode === "paused") {
        saveAutosave();
        toast("Paused — progress saved. Press P to resume.");
      }
    }
  }

  function handleKeyUp(event) {
    const code = event.code;
    if (code === "ArrowLeft" || code === "KeyA") input.left = false;
    if (code === "ArrowRight" || code === "KeyD") input.right = false;
    if (code === "ArrowDown" || code === "KeyS") input.down = false;
    if (code === "ArrowUp" || code === "KeyW" || code === "Space") input.jump = false;
  }

  function pressTouchControl(control) {
    if (control === "reset") {
      requestResetConfirmation();
      return;
    }
    if (state.mode === "resetConfirm") {
      if (control === "start" || control === "jump") {
        confirmReset();
      } else if (control === "down" || control === "left") {
        cancelResetConfirmation();
      }
      return;
    }
    if (state.mode === "portalChoice") {
      if (control === "start" || control === "jump") {
        choosePortal(true);
      } else if (control === "down" || control === "left") {
        choosePortal(false);
      }
      return;
    }

    if (control === "left") {
      if (SHOW_CHARACTER_SELECTOR && (state.mode === "title" || state.mode === "won" || state.mode === "lost")) {
        selectCharacter(-1);
      } else if (state.mode === "title" || state.mode === "won" || state.mode === "lost") {
        return;
      } else {
        input.left = true;
      }
    } else if (control === "right") {
      if (SHOW_CHARACTER_SELECTOR && (state.mode === "title" || state.mode === "won" || state.mode === "lost")) {
        selectCharacter(1);
      } else if (state.mode === "title" || state.mode === "won" || state.mode === "lost") {
        return;
      } else {
        input.right = true;
      }
    } else if (control === "down") {
      input.down = true;
    } else if (control === "jump") {
      if (!input.jump) {
        input.jumpBuffer = 0.14;
        if (state.mode === "playing") {
          noteJumpTap();
        }
      }
      input.jump = true;
      if (state.mode === "title") {
        startGame();
      }
    } else if (control === "start") {
      if (state.mode === "title" || state.mode === "won" || state.mode === "lost") {
        startGame();
      }
    } else if (control === "kick" && state.mode === "playing") {
      performKick();
    }
  }

  function releaseTouchControl(control) {
    if (control === "left") input.left = false;
    if (control === "right") input.right = false;
    if (control === "down") input.down = false;
    if (control === "jump") input.jump = false;
  }

  function bindTouchControls() {
    for (const button of document.querySelectorAll("[data-control]")) {
      const control = button.dataset.control;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        try {
          button.setPointerCapture?.(event.pointerId);
        } catch {
          // Some synthetic or older touch events cannot be captured, but the control still works.
        }
        button.classList.add("is-pressed");
        pressTouchControl(control);
      });
      const release = (event) => {
        event.preventDefault();
        button.classList.remove("is-pressed");
        releaseTouchControl(control);
      };
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", () => {
        button.classList.remove("is-pressed");
        releaseTouchControl(control);
      });
    }
  }

  function bindTouchJoystick() {
    const joystick = document.querySelector("[data-joystick]");
    const knob = joystick?.querySelector(".virtual-joystick__knob");
    if (!joystick || !knob) {
      return;
    }

    let pointerId = null;
    const activeControls = new Set();

    const setActiveControls = (nextControls) => {
      for (const control of activeControls) {
        if (!nextControls.has(control)) {
          releaseTouchControl(control);
          activeControls.delete(control);
        }
      }
      for (const control of nextControls) {
        if (!activeControls.has(control)) {
          activeControls.add(control);
          pressTouchControl(control);
        }
      }
    };

    const updateJoystick = (event) => {
      const rect = joystick.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxTravel = rect.width * 0.29;
      const rawX = event.clientX - centerX;
      const rawY = event.clientY - centerY;
      const distance = Math.hypot(rawX, rawY);
      const scale = distance > maxTravel ? maxTravel / distance : 1;
      const x = rawX * scale;
      const y = rawY * scale;
      const normalizedX = x / maxTravel;
      const normalizedY = y / maxTravel;
      knob.style.setProperty("--stick-x", `${x.toFixed(1)}px`);
      knob.style.setProperty("--stick-y", `${y.toFixed(1)}px`);

      const nextControls = new Set();
      if (normalizedX < -0.28) nextControls.add("left");
      if (normalizedX > 0.28) nextControls.add("right");
      if (normalizedY > 0.48) nextControls.add("down");
      setActiveControls(nextControls);
    };

    const releaseJoystick = (event) => {
      if (pointerId === null || event.pointerId !== pointerId) {
        return;
      }
      pointerId = null;
      joystick.classList.remove("is-active");
      knob.style.setProperty("--stick-x", "0px");
      knob.style.setProperty("--stick-y", "0px");
      setActiveControls(new Set());
    };

    joystick.addEventListener("pointerdown", (event) => {
      if (pointerId !== null) {
        return;
      }
      event.preventDefault();
      pointerId = event.pointerId;
      joystick.classList.add("is-active");
      try {
        joystick.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is optional; document-level pointer events still release the stick.
      }
      updateJoystick(event);
    });
    joystick.addEventListener("pointermove", (event) => {
      if (event.pointerId === pointerId) {
        event.preventDefault();
        updateJoystick(event);
      }
    });
    joystick.addEventListener("pointerup", releaseJoystick);
    joystick.addEventListener("pointercancel", releaseJoystick);
    joystick.addEventListener("lostpointercapture", releaseJoystick);
    window.addEventListener("pointerup", releaseJoystick);
    window.addEventListener("pointercancel", releaseJoystick);
    window.addEventListener("blur", () => {
      if (pointerId !== null) {
        releaseJoystick({ pointerId });
      }
    });
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      (shell || canvas).requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      saveAutosave();
    }
  });
  window.addEventListener("pagehide", saveAutosave);
  bindTouchControls();
  bindTouchJoystick();

  function renderGameToText() {
    const camera = state.cameraX;
    const visibleCollectibles = state.collectibles
      .filter((item) => !item.taken && item.x + item.w >= camera && item.x <= camera + VIEW_W)
      .slice(0, 12)
      .map((item) => ({
        type: item.type,
        x: Math.round(item.x),
        y: Math.round(item.y),
        powerUp: item.type === "latte" ? Boolean(item.powerUp) : undefined,
        kicked: item.type === "ball" ? Boolean(item.kicked) : undefined,
        vx: item.type === "ball" ? Math.round(item.vx || 0) : undefined,
      }));
    const visibleEnemies = state.enemies
      .filter((enemy) => {
        const defeatVisible = enemy.defeatType === "kicked"
          ? enemy.defeatTimer < KICKED_MONSTER_DURATION
          : enemy.stomped <= 0.55;
        return (enemy.alive || defeatVisible) && enemy.x + enemy.w >= camera && enemy.x <= camera + VIEW_W;
      })
      .map((enemy) => ({
        kind: enemy.kind,
        x: Math.round(enemy.x),
        y: Math.round(enemy.y),
        dir: (enemy.defeatType === "kicked" ? enemy.knockbackVx : enemy.vx) < 0 ? "left" : "right",
        state: enemy.alive ? "patrol" : enemy.defeatType || "stomped",
        rotation: enemy.defeatType === "kicked" ? Number((enemy.roll || 0).toFixed(2)) : undefined,
      }));
    const visibleEnemyProjectiles = state.enemyProjectiles
      .filter((projectile) => projectile.active && projectile.x + projectile.w >= camera && projectile.x <= camera + VIEW_W)
      .slice(0, 12)
      .map((projectile) => ({
        type: "sausage",
        x: Math.round(projectile.x),
        y: Math.round(projectile.y),
        dir: projectile.vx < 0 ? "left" : "right",
      }));
    const visibleBlocks = state.blocks
      .filter((block) => block.x + block.w >= camera && block.x <= camera + VIEW_W)
      .slice(0, 18)
      .map((block) => ({
        type: block.type,
        x: block.x,
        y: block.y,
        hit: block.hit,
        powerLatte: Boolean(block.powerLatte),
      }));

    return JSON.stringify({
      buildId: BUILD_ID,
      mode: state.mode,
      coordinateSystem: "canvas/world pixels, origin top-left, x right, y down",
      cameraFraming: isPhoneViewport() ? "phone-centered" : "desktop-forward",
      cameraX: Math.round(state.cameraX),
      player: {
        x: Math.round(state.player.x),
        y: Math.round(state.player.y),
        w: Number(state.player.w.toFixed(2)),
        h: Number(state.player.h.toFixed(2)),
        centerX: Math.round(state.player.x + state.player.w * 0.5),
        bottomY: Math.round(state.player.y + state.player.h),
        vx: Math.round(state.player.vx),
        vy: Math.round(state.player.vy),
        onGround: state.player.onGround,
        facing: state.player.facing > 0 ? "right" : "left",
        character: currentCharacter().id,
        characterName: currentCharacter().name,
        poweredUp: Boolean(state.player.poweredUp),
        crouching: Boolean(state.player.crouching),
        visualScale: state.player.poweredUp ? PLAYER_POWER_SCALE : 1,
      },
      mission: {
        balls: `${state.balls}/${state.totalBalls}`,
        lattes: `${state.lattes}/${state.totalLattes}`,
        pipeUnlocked: missionComplete(),
      },
      score: state.score,
      lives: state.lives,
      time: Math.ceil(state.timer),
      visibleCollectibles,
      visibleEnemies,
      visibleEnemyProjectiles,
      visibleBlocks,
      effects: {
        activeParticles: state.particles.length,
        particleSplashesEnabled: SHOW_PARTICLE_SPLASHES,
        launchedBricks: state.launchedBricks.map((brick) => ({
          x: Math.round(brick.x),
          y: Math.round(brick.y),
          progress: Number((brick.age / brick.duration).toFixed(2)),
        })),
      },
      portal: {
        x: state.pipe.x,
        y: state.pipe.y,
        w: state.pipe.w,
        h: state.pipe.h,
        ready: missionComplete(),
        promptVisible: state.mode === "portalChoice",
        skippedUntilExit: state.portalChoiceDismissed,
      },
      resetConfirmation: {
        promptVisible: state.mode === "resetConfirm",
        returnMode: state.mode === "resetConfirm" ? resetConfirmReturnMode : null,
      },
      assets: {
        missing: missingAssets(),
        characters: characterSets.map((character) => ({
          id: character.id,
          folder: character.folder,
          ready: characterFramesReady(character),
          pendingFrames: characterPendingFrameCount(character),
          missingFrames: characterMissingFrameAssets(character),
        })),
      },
    });
  }

  window.render_game_to_text = renderGameToText;

  let lastManualStepAt = -Infinity;
  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) {
      update(FRAME_DT);
    }
    lastManualStepAt = performance.now();
    render();
  };

  let previous = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - previous) / 1000 || FRAME_DT);
    previous = now;
    if (now - lastManualStepAt > 250) {
      update(dt);
    }
    render();
    requestAnimationFrame(loop);
  }
  console.info(`dp.AI LA Run build ${BUILD_ID}`);
  requestAnimationFrame(loop);
})();
