
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const TEACHER_PIN = process.env.TEACHER_PIN || "1234";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/", (req, res, next) => {
  res.sendFile(path.join(__dirname, "public", "index.html"), (err) => {
    if (err) next(err);
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/ai/generate-background", async (req, res) => {
  try {
    const input = req.body || {};
    let warning = null;
    let background = null;

    try {
      background = await tryGenerateBackgroundWithOpenAI(input);
    } catch (err) {
      warning = err?.message || "AI generation failed";
    }

    if (!background) background = generateBackgroundVariant(input);

    res.json({
      ok: true,
      aiEnabled: !!OPENAI_API_KEY,
      background,
      warning
    });
  } catch (err) {
    console.error("AI endpoint error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

const STAGES = [
  { key: "welcome", type: "intro", title: "Старт", task: false },
  { key: "choose", type: "task", title: "Выбор препятствия", task: true },
  { key: "design_intro", type: "intro", title: "Направление: Дизайн", task: false },
  { key: "design_task", type: "task", title: "Этап 1 — Дизайн", task: true },
  { key: "ai_intro", type: "intro", title: "Направление: Нейросети", task: false },
  { key: "ai_task", type: "task", title: "Этап 2 — Нейросети", task: true },
  { key: "code_intro", type: "intro", title: "Направление: Программирование", task: false },
  { key: "code_task", type: "task", title: "Этап 3 — Python", task: true },
  { key: "final_intro", type: "intro", title: "Финал", task: false },
  { key: "final_game", type: "game", title: "Общая 2D игра", task: false }
];

const OBSTACLES = [
  { type: "trampoline", name: "Батут", icon: "🟢", defaultParams: { jump_power: 24 }, codeTemplate: "jump_power = 24", hints: ["Высота прыжка", "Диапазон 12–50"], varDefs: [{ key: "jump_power", min: 12, max: 50 }] },
  { type: "pendulum", name: "Маятник-молот", icon: "🔨", defaultParams: { swing_speed: 2.4, swing_angle: 45 }, codeTemplate: "swing_speed = 2.4\nswing_angle = 45", hints: ["Скорость и угол качания"], varDefs: [{ key: "swing_speed", min: 0.8, max: 6 }, { key: "swing_angle", min: 20, max: 80 }] },
  { type: "plant", name: "Растение-ловушка", icon: "🌿", defaultParams: { open_speed: 2.0, bite_damage: 20 }, codeTemplate: "open_speed = 2.0\nbite_damage = 20", hints: ["Скорость раскрытия и урон"], varDefs: [{ key: "open_speed", min: 0.5, max: 6 }, { key: "bite_damage", min: 5, max: 60 }] },
  { type: "cloud", name: "Убивающая тучка", icon: "⛈️", defaultParams: { drop_size: 1.4, rain_damage: 10 }, codeTemplate: "drop_size = 1.4\nrain_damage = 10", hints: ["Размер капель и урон"], varDefs: [{ key: "drop_size", min: 0.6, max: 3 }, { key: "rain_damage", min: 5, max: 50 }] },
  { type: "laser", name: "Лазерные ворота", icon: "🚧", defaultParams: { laser_on_time: 1.2, laser_off_time: 1.0 }, codeTemplate: "laser_on_time = 1.2\nlaser_off_time = 1.0", hints: ["Вкл/выкл таймер"], varDefs: [{ key: "laser_on_time", min: 0.4, max: 3 }, { key: "laser_off_time", min: 0.4, max: 3 }] },
  { type: "falling", name: "Падающая платформа", icon: "🟧", defaultParams: { fall_delay: 0.8, respawn_time: 2.0 }, codeTemplate: "fall_delay = 0.8\nrespawn_time = 2.0", hints: ["Задержка падения и возврат"], varDefs: [{ key: "fall_delay", min: 0.2, max: 2 }, { key: "respawn_time", min: 1, max: 6 }] },
  { type: "fan", name: "Вентилятор", icon: "🌀", defaultParams: { wind_force: 5.5, wind_duration: 1.4 }, codeTemplate: "wind_force = 5.5\nwind_duration = 1.4", hints: ["Сила и длительность порыва"], varDefs: [{ key: "wind_force", min: 1, max: 12 }, { key: "wind_duration", min: 0.5, max: 3 }] },
  { type: "spikes", name: "Шипы", icon: "🗡️", defaultParams: { spike_speed: 2.2, spike_damage: 25 }, codeTemplate: "spike_speed = 2.2\nspike_damage = 25", hints: ["Скорость и урон"], varDefs: [{ key: "spike_speed", min: 0.6, max: 5 }, { key: "spike_damage", min: 5, max: 60 }] },
  { type: "slime", name: "Липкая слизь", icon: "🧪", defaultParams: { slow_percent: 40, slow_time: 1.5 }, codeTemplate: "slow_percent = 40\nslow_time = 1.5", hints: ["Замедление % и время"], varDefs: [{ key: "slow_percent", min: 10, max: 80 }, { key: "slow_time", min: 0.5, max: 4 }] },
  { type: "electric", name: "Электрошар", icon: "⚡", defaultParams: { zap_radius: 36, zap_damage: 20 }, codeTemplate: "zap_radius = 36\nzap_damage = 20", hints: ["Радиус и урон"], varDefs: [{ key: "zap_radius", min: 20, max: 90 }, { key: "zap_damage", min: 5, max: 60 }] }
];

function randomColor() {
  const colors = ["#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#84cc16","#f97316","#14b8a6"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function buildDefaultDesign() {
  const stickers = ["★","⚡","✦","◆","⬢","☁️","🔥","❄️"];
  return {
    primary: ["#60a5fa","#f87171","#34d399","#fbbf24","#a78bfa"][Math.floor(Math.random()*5)],
    secondary: ["#bfdbfe","#fecaca","#a7f3d0","#fde68a","#ddd6fe"][Math.floor(Math.random()*5)],
    shape: ["Круг","Квадрат","Шестигранник","Кристалл"][Math.floor(Math.random()*4)],
    sticker: stickers[Math.floor(Math.random()*stickers.length)],
    size: ["S","M","L"][Math.floor(Math.random()*3)]
  };
}

function generateBackgroundVariant(input = {}) {
  const palettes = {
    "Неон": ["#0f172a","#7c3aed","#22d3ee"],
    "Космос": ["#03045e","#7209b7","#f72585"],
    "Лава": ["#2b0f0a","#9d0208","#ffba08"],
    "Лёд": ["#0a2540","#00b4d8","#caf0f8"],
    "Джунгли": ["#052e16","#1b4332","#95d5b2"],
    "Город": ["#111827","#374151","#60a5fa"],
    "Конфеты": ["#fff7ed","#fb7185","#f59e0b"]
  };
  const theme = input.theme || "Неон";
  const motifs = Array.isArray(input.motifs) && input.motifs.length ? input.motifs.slice(0,3) : ["линии"];
  const palette = palettes[theme] || palettes["Неон"];
  return {
    theme,
    motifs,
    palette,
    label: `${theme} • ${motifs.join(", ")}`,
    source: "fallback",
    imageDataUrl: null,
    promptSummary: input.promptSummary || ""
  };
}

async function tryGenerateBackgroundWithOpenAI(input = {}) {
  if (!OPENAI_API_KEY) return null;

  const theme = input.theme || "Неон";
  const motifs = Array.isArray(input.motifs) ? input.motifs.slice(0, 3) : [];
  const colorWord = input.colorWord || "bright playful";
  const prompt = [
    "Create a clean colorful 2D side-scroller game background for kids aged 10-13.",
    `Theme: ${theme}.`,
    motifs.length ? `Motifs: ${motifs.join(", ")}.` : "",
    `Colors: ${colorWord}.`,
    "No characters, no text, no interface, no foreground obstacles.",
    "Wide background, readable and playful."
  ].filter(Boolean).join(" ");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-5",
      input: prompt,
      tools: [{ type: "image_generation", size: "1536x1024", quality: "medium" }]
    })
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`OpenAI ${response.status}: ${txt.slice(0,200)}`);
  }

  const data = await response.json();
  const imageCall = (Array.isArray(data.output) ? data.output : []).find(
    (x) => x && x.type === "image_generation_call" && x.result
  );
  if (!imageCall?.result) throw new Error("No image returned");

  const local = generateBackgroundVariant(input);
  return {
    ...local,
    source: "openai",
    imageDataUrl: `data:image/png;base64,${imageCall.result}`,
    promptSummary: input.promptSummary || prompt
  };
}

function normalizeObstacleConfig(o, student) {
  const meta = OBSTACLES.find((x) => x.type === o.type);
  const params = { ...(meta?.defaultParams || {}), ...(student?.codeData?.params || {}) };
  const design = student?.designData || buildDefaultDesign();
  return {
    ...o,
    params,
    design,
    ownerName: student?.name || "Авто"
  };
}

const state = {
  currentStageIndex: 0,
  paused: false,
  teacherSocketId: null,
  transitionMode: "manual", // manual | all | majority
  majorityPercent: 80,
  students: {},           // socketId -> user state
  selections: {},         // obstacleType -> socketId
  stageCompletedBy: {},   // stageKey -> {socketId:true}
  finalGame: {
    running: false,
    tick: 0,
    startedAt: null
  }
};

function currentStage() {
  return STAGES[state.currentStageIndex] || STAGES[0];
}
function currentStageKey() {
  return currentStage().key;
}
function ensureStageMap(key) {
  if (!state.stageCompletedBy[key]) state.stageCompletedBy[key] = {};
  return state.stageCompletedBy[key];
}
function users() {
  return Object.values(state.students);
}
function studentUsers() {
  return users().filter((u) => u.role === "student");
}
function obstacleCatalog() {
  return OBSTACLES.map((o) => ({ ...o, takenBy: state.selections[o.type] || null }));
}
function completionStats() {
  const map = state.stageCompletedBy[currentStageKey()] || {};
  const students = studentUsers();
  const total = students.length;
  const done = students.filter((s) => !!map[s.socketId]).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}
function publicStateFor(socketId) {
  return {
    stages: STAGES,
    currentStageIndex: state.currentStageIndex,
    paused: state.paused,
    transitionMode: state.transitionMode,
    majorityPercent: state.majorityPercent,
    teacherSocketId: state.teacherSocketId,
    me: state.students[socketId] || null,
    students: users().map((u) => ({
      socketId: u.socketId,
      role: u.role,
      name: u.name,
      color: u.color,
      obstacleType: u.obstacleType || null,
      stageDone: !!((state.stageCompletedBy[currentStageKey()] || {})[u.socketId])
    })),
    obstacleCatalog: obstacleCatalog(),
    completion: completionStats(),
    finalGame: { ...state.finalGame }
  };
}
function broadcastState() {
  for (const id of io.sockets.sockets.keys()) {
    io.to(id).emit("state:update", publicStateFor(id));
  }
}
function markComplete(socketId, done = true) {
  const map = ensureStageMap(currentStageKey());
  if (done) map[socketId] = true;
  else delete map[socketId];
}
function nextStage() {
  if (state.currentStageIndex < STAGES.length - 1) {
    state.currentStageIndex += 1;
    state.paused = false;
    broadcastState();
  }
}
function prevStage() {
  if (state.currentStageIndex > 0) {
    state.currentStageIndex -= 1;
    state.paused = false;
    broadcastState();
  }
}
function tryAutoAdvance() {
  const st = currentStage();
  if (!st.task) return;
  const c = completionStats();
  if (!c.total) return;
  if (state.transitionMode === "all" && c.done >= c.total) nextStage();
  if (state.transitionMode === "majority" && c.percent >= state.majorityPercent) nextStage();
}

function parsePythonParams(obstacleType, codeText) {
  const ob = OBSTACLES.find((x) => x.type === obstacleType);
  if (!ob) return { ok: false, errors: ["Неизвестное препятствие"] };

  const params = {};
  const lines = String(codeText || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const rx = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)$/;
  for (const line of lines) {
    const m = line.match(rx);
    if (!m) {
      return { ok: false, errors: [`Неверный формат строки: "${line}"`] };
    }
    params[m[1]] = Number(m[2]);
  }

  const errors = [];
  for (const v of ob.varDefs) {
    if (!(v.key in params)) errors.push(`Нужно указать ${v.key}`);
    else if (params[v.key] < v.min || params[v.key] > v.max) {
      errors.push(`${v.key}: значение вне диапазона (${v.min}–${v.max})`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, params };
}

function buildObstacleRoute() {
  return OBSTACLES.map((o) => {
    const ownerId = state.selections[o.type];
    const student = ownerId ? state.students[ownerId] : null;
    return normalizeObstacleConfig(o, student);
  });
}

function defaultBackgrounds() {
  return [
    generateBackgroundVariant({ theme: "Неон", motifs: ["линии"] }),
    generateBackgroundVariant({ theme: "Космос", motifs: ["звезды"] }),
    generateBackgroundVariant({ theme: "Лава", motifs: ["скалы"] }),
    generateBackgroundVariant({ theme: "Джунгли", motifs: ["лианы"] })
  ];
}

function gameSnapshot() {
  const backgrounds = studentUsers()
    .map((s) => s.aiData?.background)
    .filter(Boolean);

  return {
    running: state.finalGame.running,
    tick: state.finalGame.tick,
    backgrounds: backgrounds.length ? backgrounds : defaultBackgrounds(),
    route: buildObstacleRoute(),
    players: studentUsers().map((s) => ({
      socketId: s.socketId,
      name: s.name,
      color: s.color,
      x: s.game?.x ?? 20,
      y: s.game?.y ?? 0,
      vx: s.game?.vx ?? 0,
      vy: s.game?.vy ?? 0,
      onGround: !!s.game?.onGround,
      checkpoint: s.game?.checkpoint ?? 0,
      finished: !!s.game?.finished
    }))
  };
}

// simple server-side simulation
setInterval(() => {
  if (!state.finalGame.running) return;

  state.finalGame.tick += 1;
  const now = Date.now();
  const dt = 0.05;
  const route = buildObstacleRoute();
  const checkpointXs = route.map((_, i) => 140 + i * 220);

  for (const s of studentUsers()) {
    if (!s.game) continue;
    const g = s.game;

    let maxSpeed = 130;
    if (g.effects?.slowUntil && g.effects.slowUntil > now) maxSpeed *= 0.5;

    if (g.input?.right) g.vx = maxSpeed;
    else if (g.input?.left) g.vx = -maxSpeed * 0.75;
    else g.vx *= 0.82;

    if (g.input?.jump && g.onGround) {
      g.vy = -320;
      g.onGround = false;
    }

    g.vy += 800 * dt;

    g.x += g.vx * dt;
    g.y += g.vy * dt;

    if (g.y > 0) {
      g.y = 0;
      g.vy = 0;
      g.onGround = true;
    }

    for (let i = 0; i < route.length; i++) {
      const ob = route[i];
      const cx = checkpointXs[i];

      if (g.x > cx + 20) g.checkpoint = Math.max(g.checkpoint || 0, i);
      if (g.x < cx - 55 || g.x > cx + 55) continue;

      const t = now / 1000;
      let hit = false;

      switch (ob.type) {
        case "trampoline":
          if (g.onGround && !g.flags?.trampolineCooldown) {
            g.vy = -Math.max(170, Number(ob.params.jump_power || 24) * 12);
            g.onGround = false;
            g.flags = g.flags || {};
            g.flags.trampolineCooldown = true;
            setTimeout(() => { if (s.game) s.game.flags.trampolineCooldown = false; }, 650);
          }
          break;

        case "pendulum": {
          const ang = Math.sin(t * Number(ob.params.swing_speed || 2.4)) * (Number(ob.params.swing_angle || 45) * Math.PI / 180);
          const hx = cx + Math.sin(ang) * 45;
          const hy = -88 + Math.cos(ang) * 18;
          const dx = g.x - hx;
          const dy = (g.y - 36) - hy;
          if (dx * dx + dy * dy < 24 * 24) hit = true;
          break;
        }

        case "plant": {
          const open = ((Math.sin(t * Number(ob.params.open_speed || 2)) + 1) / 2) > 0.55;
          if (open && g.onGround) hit = true;
          break;
        }

        case "cloud": {
          const pulse = (t % 0.7);
          if (pulse > 0.38 && pulse < 0.5) hit = true;
          break;
        }

        case "laser": {
          const onT = Number(ob.params.laser_on_time || 1.2);
          const offT = Number(ob.params.laser_off_time || 1.0);
          if ((t % (onT + offT)) < onT) hit = true;
          break;
        }

        case "falling": {
          const delay = Number(ob.params.fall_delay || 0.8);
          const respawn = Number(ob.params.respawn_time || 2);
          if ((t % (delay + respawn)) >= delay && g.onGround) hit = true;
          break;
        }

        case "fan": {
          const cycle = Math.max(0.2, Number(ob.params.wind_duration || 1.4));
          const burst = ((Math.sin(t * 2 * Math.PI / cycle) + 1) / 2) > 0.5;
          if (burst) {
            g.vx += Number(ob.params.wind_force || 5.5) * 12 * dt;
            if (g.onGround) g.vy -= 100 * dt;
          }
          break;
        }

        case "spikes": {
          const up = ((Math.sin(t * Number(ob.params.spike_speed || 2.2)) + 1) / 2) > 0.5;
          if (up && g.onGround) hit = true;
          break;
        }

        case "slime":
          g.effects = g.effects || {};
          g.effects.slowUntil = now + Number(ob.params.slow_time || 1.5) * 1000;
          break;

        case "electric": {
          const pulse = ((Math.sin(t * 3) + 1) / 2) > 0.88;
          if (pulse) hit = true;
          break;
        }
      }

      if (hit) {
        const cpIndex = Math.max(0, g.checkpoint || 0);
        g.x = cpIndex > 0 ? checkpointXs[cpIndex - 1] + 30 : 20;
        g.y = 0;
        g.vx = 0;
        g.vy = 0;
        g.onGround = true;
      }
    }

    const finishX = checkpointXs[checkpointXs.length - 1] + 190;
    if (g.x >= finishX) {
      g.finished = true;
      g.x = finishX;
      g.vx = 0;
    }
  }

  io.emit("game:snapshot", gameSnapshot());
}, 50);

io.on("connection", (socket) => {
  socket.emit("state:update", publicStateFor(socket.id));
  socket.emit("catalog:obstacles", OBSTACLES);

  socket.on("join", (payload = {}) => {
    const role = payload.role === "teacher" ? "teacher" : "student";
    const nameRaw = String(payload.name || "").trim().slice(0, 24);
    const name = nameRaw || (role === "teacher" ? "Преподаватель" : "Ученик");

    if (role === "teacher") {
      if (String(payload.pin || "") !== TEACHER_PIN) {
        socket.emit("join:error", { message: "Неверный PIN преподавателя" });
        return;
      }
      state.teacherSocketId = socket.id;
      state.students[socket.id] = {
        socketId: socket.id,
        role,
        name,
        color: "#111827",
        obstacleType: null,
        designData: null,
        aiData: null,
        codeData: null,
        game: {}
      };
    } else {
      state.students[socket.id] = {
        socketId: socket.id,
        role,
        name,
        color: randomColor(),
        obstacleType: null,
        designData: null,
        aiData: null,
        codeData: null,
        game: {
          x: 20, y: 0, vx: 0, vy: 0,
          onGround: true, input: {},
          checkpoint: 0, finished: false,
          effects: {}, flags: {}
        }
      };
    }

    broadcastState();
    if (state.finalGame.running) io.emit("game:snapshot", gameSnapshot());
  });

  socket.on("teacher:control", (msg = {}) => {
    if (socket.id !== state.teacherSocketId) return;
    const action = msg.action;

    if (action === "nextStage") nextStage();
    else if (action === "prevStage") prevStage();
    else if (action === "setTransitionMode") {
      const mode = msg.mode;
      if (["manual","all","majority"].includes(mode)) state.transitionMode = mode;
      if (msg.majorityPercent != null) {
        state.majorityPercent = Math.max(50, Math.min(100, Number(msg.majorityPercent) || 80));
      }
      broadcastState();
    }
    else if (action === "startGame") {
      state.finalGame.running = true;
      state.finalGame.startedAt = Date.now();
      state.finalGame.tick = 0;

      for (const s of studentUsers()) {
        s.game = {
          x: 20, y: 0, vx: 0, vy: 0,
          onGround: true, input: {},
          checkpoint: 0, finished: false,
          effects: {}, flags: {}
        };
      }

      io.emit("game:snapshot", gameSnapshot());
      broadcastState();
    }
    else if (action === "stopGame") {
      state.finalGame.running = false;
      io.emit("game:snapshot", gameSnapshot());
      broadcastState();
    }
  });

  socket.on("student:chooseObstacle", ({ obstacleType }) => {
    const s = state.students[socket.id];
    if (!s || s.role !== "student") return;
    if (currentStageKey() !== "choose") return;
    if (!OBSTACLES.some((o) => o.type === obstacleType)) return;

    const occupiedBy = state.selections[obstacleType];
    if (occupiedBy && occupiedBy !== socket.id) {
      socket.emit("toast", { type: "error", text: "Это препятствие уже выбрано" });
      return;
    }

    if (s.obstacleType && state.selections[s.obstacleType] === socket.id) {
      delete state.selections[s.obstacleType];
    }

    s.obstacleType = obstacleType;
    state.selections[obstacleType] = socket.id;
    markComplete(socket.id, true);
    tryAutoAdvance();
    broadcastState();
  });

  socket.on("student:saveDesign", ({ designData }) => {
    const s = state.students[socket.id];
    if (!s || s.role !== "student") return;
    s.designData = designData || buildDefaultDesign();
    markComplete(socket.id, true);
    tryAutoAdvance();
    broadcastState();
  });

  socket.on("student:aiGenerateBackground", async (payload = {}) => {
    const s = state.students[socket.id];
    if (!s || s.role !== "student") return;

    let warning = null;
    let bg = null;

    try {
      bg = await tryGenerateBackgroundWithOpenAI(payload);
    } catch (err) {
      warning = err?.message || "AI generation failed";
    }
    if (!bg) bg = generateBackgroundVariant(payload);

    s.aiData = s.aiData || {};
    s.aiData.background = bg;

    socket.emit("student:aiGenerated", { background: bg, warning, aiEnabled: !!OPENAI_API_KEY });

    markComplete(socket.id, true);
    tryAutoAdvance();
    broadcastState();
  });

  socket.on("student:saveCode", ({ codeText }) => {
    const s = state.students[socket.id];
    if (!s || s.role !== "student") return;

    if (!s.obstacleType) {
      socket.emit("student:codeValidated", { ok: false, errors: ["Сначала выбери препятствие"] });
      return;
    }

    const parsed = parsePythonParams(s.obstacleType, codeText);
    if (parsed.ok) {
      s.codeData = { codeText, params: parsed.params };
      markComplete(socket.id, true);
      tryAutoAdvance();
      broadcastState();
    }

    socket.emit("student:codeValidated", parsed);
  });

  socket.on("student:markStageDone", () => {
    const s = state.students[socket.id];
    if (!s || s.role !== "student") return;
    markComplete(socket.id, true);
    tryAutoAdvance();
    broadcastState();
  });

  socket.on("student:unmarkStageDone", () => {
    const s = state.students[socket.id];
    if (!s || s.role !== "student") return;
    markComplete(socket.id, false);
    broadcastState();
  });

  socket.on("game:input", (input = {}) => {
    const s = state.students[socket.id];
    if (!s || s.role !== "student" || !s.game) return;
    s.game.input = {
      left: !!input.left,
      right: !!input.right,
      jump: !!input.jump
    };
  });

  socket.on("disconnect", () => {
    const s = state.students[socket.id];
    if (s?.obstacleType && state.selections[s.obstacleType] === socket.id) {
      delete state.selections[s.obstacleType];
    }
    delete state.students[socket.id];
    if (state.teacherSocketId === socket.id) state.teacherSocketId = null;

    for (const k of Object.keys(state.stageCompletedBy)) {
      if (state.stageCompletedBy[k]) delete state.stageCompletedBy[k][socket.id];
    }

    broadcastState();
  });
});

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sync Obby Lab started on http://localhost:${PORT}`);
});
