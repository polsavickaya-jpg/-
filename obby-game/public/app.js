
(() => {
  const socket = io();

  const E = {
    joinScreen: document.getElementById("joinScreen"),
    lessonScreen: document.getElementById("lessonScreen"),
    roleTeacherBtn: document.getElementById("roleTeacherBtn"),
    roleStudentBtn: document.getElementById("roleStudentBtn"),
    nameInput: document.getElementById("nameInput"),
    teacherPinWrap: document.getElementById("teacherPinWrap"),
    teacherPinInput: document.getElementById("teacherPinInput"),
    joinBtn: document.getElementById("joinBtn"),
    joinError: document.getElementById("joinError"),
    meBadge: document.getElementById("meBadge"),
    stagePill: document.getElementById("stagePill"),
    completionPill: document.getElementById("completionPill"),
    teacherPanel: document.getElementById("teacherPanel"),
    stageBody: document.getElementById("stageBody"),
    studentsList: document.getElementById("studentsList"),
    pickedList: document.getElementById("pickedList"),
    hintBox: document.getElementById("hintBox"),
    gameWrap: document.getElementById("gameWrap"),
    gameCanvas: document.getElementById("gameCanvas")
  };

  const S = {
    app: null,
    roleChoice: null,
    catalog: [],
    joining: false,
    toasts: [],
    // local stage drafts
    designDraft: {
      primary: "#60a5fa",
      secondary: "#bfdbfe",
      shape: "Круг",
      sticker: "★",
      size: "M"
    },
    aiDraft: {
      theme: "Неон",
      colorWord: "яркие",
      motifs: ["линии", "звезды"]
    },
    aiPreview: null,
    codeDraft: "",
    codeValidated: null,
    gameSnapshot: null,
    keys: { left:false, right:false, jump:false }
  };

  const OB_MOTIF_SUGGESTIONS = ["линии","звезды","кристаллы","облака","шестерёнки","молнии","пиксели","грибы","лианы","шахматы"];

  function isTeacher() {
    return !!S.app?.me && S.app.me.role === "teacher";
  }
  function stage() {
    if (!S.app?.stages) return null;
    return S.app.stages[S.app.currentStageIndex] || null;
  }
  function esc(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
  function meObstacleMeta() {
    const type = S.app?.me?.obstacleType;
    if (!type) return null;
    return S.catalog.find(o => o.type === type) || S.app?.obstacleCatalog?.find(o => o.type === type) || null;
  }
  function toast(text, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type === "error" ? "error" : type === "success" ? "success" : ""}`.trim();
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function setRoleChoice(role) {
    S.roleChoice = role;
    E.roleTeacherBtn.classList.toggle("active", role === "teacher");
    E.roleStudentBtn.classList.toggle("active", role === "student");
    E.teacherPinWrap.classList.toggle("hidden", role !== "teacher");
    E.joinBtn.disabled = !role;
  }

  E.roleTeacherBtn.addEventListener("click", () => setRoleChoice("teacher"));
  E.roleStudentBtn.addEventListener("click", () => setRoleChoice("student"));
  E.joinBtn.addEventListener("click", () => {
    if (!S.roleChoice || S.joining) return;
    E.joinError.textContent = "";
    S.joining = true;
    E.joinBtn.disabled = true;
    socket.emit("join", {
      role: S.roleChoice,
      name: E.nameInput.value.trim(),
      pin: E.teacherPinInput.value
    });
    setTimeout(() => {
      S.joining = false;
      if (!S.app?.me) E.joinBtn.disabled = !S.roleChoice;
    }, 1200);
  });

  socket.on("join:error", (msg) => {
    E.joinError.textContent = msg?.message || "Ошибка входа";
    S.joining = false;
    E.joinBtn.disabled = !S.roleChoice;
  });

  socket.on("toast", (msg) => {
    if (msg?.text) toast(msg.text, msg.type);
  });

  socket.on("catalog:obstacles", (catalog) => {
    if (Array.isArray(catalog)) S.catalog = catalog;
    render();
  });

  socket.on("state:update", (state) => {
    const prevStage = stage()?.key;
    S.app = state;
    const newStage = stage()?.key;

    // prepare defaults when obstacle chosen
    const meta = meObstacleMeta();
    if (meta && !S.codeDraft) S.codeDraft = meta.codeTemplate || "";

    // reset stage-specific statuses on stage change
    if (prevStage !== newStage) {
      if (newStage === "code_task" && meta) {
        S.codeDraft = (meta.codeTemplate || S.codeDraft || "");
        S.codeValidated = null;
      }
      if (newStage === "ai_task" && !S.aiPreview) {
        S.aiPreview = S.app?.me?.aiData?.background || null;
      }
    }

    render();
  });

  socket.on("student:aiGenerated", ({ background, warning }) => {
    if (background) {
      S.aiPreview = background;
      toast("Фон готов ✨", "success");
    }
    if (warning) toast(`AI недоступен: используем демо-фон`, "error");
    render();
  });

  socket.on("student:codeValidated", (res) => {
    S.codeValidated = res;
    if (res?.ok) toast("Код принят ✅", "success");
    render();
  });

  socket.on("game:snapshot", (snap) => {
    S.gameSnapshot = snap;
    if (stage()?.key === "final_game") drawGame();
  });

  function render() {
    if (!S.app) return;

    const joined = !!S.app.me;
    E.joinScreen.classList.toggle("active", !joined);
    E.joinScreen.classList.toggle("hidden", joined);
    E.lessonScreen.classList.toggle("hidden", !joined);

    if (!joined) return;

    const st = stage();
    E.stagePill.textContent = st ? `Этап: ${st.title}` : "Этап";
    const done = S.app.completion?.done ?? 0;
    const total = S.app.completion?.total ?? 0;
    E.completionPill.textContent = `Готово: ${done}/${total}`;
    E.meBadge.textContent = isTeacher() ? `👩‍🏫 ${S.app.me.name}` : `🧒 ${S.app.me.name}`;

    E.teacherPanel.classList.toggle("hidden", !isTeacher());
    E.gameWrap.classList.toggle("hidden", st?.key !== "final_game");

    renderTeacherPanel();
    renderSidePanel();
    renderStageContent();

    if (st?.key === "final_game") drawGame();
  }

  function renderTeacherPanel() {
    if (!isTeacher()) {
      E.teacherPanel.innerHTML = "";
      return;
    }

    const c = S.app.completion || { done: 0, total: 0, percent: 0 };
    E.teacherPanel.innerHTML = `
      <div class="row">
        <strong>Панель преподавателя</strong>
        <span class="chip">Синхронный режим</span>
        <span class="chip">Готово: ${c.done}/${c.total} (${c.percent || 0}%)</span>
      </div>
      <div class="row">
        <button class="btn small" data-tctrl="prevStage">◀ Назад</button>
        <button class="btn small btn-primary" data-tctrl="nextStage">Следующий этап ▶</button>
        <label>Автопереход:</label>
        <select id="transitionModeSelect">
          <option value="manual">Ручной</option>
          <option value="all">Когда все готовы</option>
          <option value="majority">Когда большинство готовы</option>
        </select>
        <label>Порог %</label>
        <input id="majorityPercentInput" type="number" min="50" max="100" step="5" value="${S.app.majorityPercent || 80}" style="width:80px" />
        <button class="btn small" id="saveTransitionModeBtn">Сохранить</button>
        <button class="btn small btn-success" data-tctrl="startGame">Старт игры</button>
        <button class="btn small btn-danger" data-tctrl="stopGame">Стоп игры</button>
      </div>
    `;

    const modeSelect = document.getElementById("transitionModeSelect");
    if (modeSelect) modeSelect.value = S.app.transitionMode || "manual";

    E.teacherPanel.querySelectorAll("[data-tctrl]").forEach(btn => {
      btn.addEventListener("click", () => {
        socket.emit("teacher:control", { action: btn.dataset.tctrl });
      });
    });

    const saveBtn = document.getElementById("saveTransitionModeBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        socket.emit("teacher:control", {
          action: "setTransitionMode",
          mode: modeSelect.value,
          majorityPercent: Number(document.getElementById("majorityPercentInput").value || 80)
        });
      });
    }
  }

  function renderSidePanel() {
    const students = S.app.students || [];
    if (!students.length) {
      E.studentsList.innerHTML = `<div class="note">Пока никто не подключился</div>`;
    } else {
      E.studentsList.innerHTML = students.map(s => `
        <div class="student-row">
          <div>
            <span class="dot" style="background:${s.color || "#cbd5e1"}"></span>
            ${s.role === "teacher" ? "👩‍🏫" : "🧒"} ${esc(s.name)}
          </div>
          <div class="done-badge ${s.stageDone ? "ok" : ""}">${s.stageDone ? "готов" : "..."}</div>
        </div>
      `).join("");
    }

    const picks = (S.app.obstacleCatalog || []).filter(o => o.takenBy);
    if (!picks.length) {
      E.pickedList.innerHTML = `<div class="note">На этапе выбора здесь появятся препятствия</div>`;
    } else {
      E.pickedList.innerHTML = picks.map(o => {
        const owner = (S.app.students || []).find(s => s.socketId === o.takenBy);
        return `<div class="student-row"><div>${o.icon} ${esc(o.name)}</div><div class="note">${owner ? esc(owner.name) : ""}</div></div>`;
      }).join("");
    }

    const st = stage();
    const hints = {
      welcome: "Сейчас преподаватель объясняет формат урока и что дети создадут в конце.",
      choose: "Каждый ученик выбирает одно препятствие. Повторяться нельзя.",
      design_intro: "Показываем примеры: как из простых форм собрать объект.",
      design_task: "Собираем внешний вид препятствия: цвет, форма, размер, стикер.",
      ai_intro: "Показываем, как нейросеть помогает делать фон игры по идее ученика.",
      ai_task: "Генерируем фон. Если AI недоступен — сайт сам даст красивый демо-фон.",
      code_intro: "Объясняем, что код меняет поведение препятствия (числа = параметры).",
      code_task: "Ученики меняют 1–2 строки Python-подобного кода по подсказкам.",
      final_intro: "Готовимся к общей игре. Всё созданное соберётся в один уровень.",
      final_game: "Играют все вместе. Учитель может перезапускать и переключать этапы."
    };
    E.hintBox.textContent = hints[st?.key] || "Ждите перехода от преподавателя";
  }

  function renderStageContent() {
    const st = stage();
    if (!st) return;

    if (st.type === "intro") return renderIntroStage(st);
    if (st.key === "choose") return renderChooseStage();
    if (st.key === "design_task") return renderDesignStage();
    if (st.key === "ai_task") return renderAiStage();
    if (st.key === "code_task") return renderCodeStage();
    if (st.key === "final_game") return renderFinalGameStage();
    return renderUnknown();
  }

  function renderIntroStage(st) {
    const maps = {
      welcome: {
        title: "Соберём свою мини-игру вместе",
        sub: "Один сайт, 3 направления, 1 финальный результат",
        items: [
          ["🎨 Дизайн", "Выбираем внешний вид своего препятствия: форма, цвет, стикер, размер."],
          ["🤖 Нейросети", "Генерируем фон для игры по своей идее и теме."],
          ["🐍 Программирование", "Меняем 1–2 строки кода и настраиваем поведение препятствия."],
          ["🎮 Общая игра", "Все препятствия собираются в один уровень — и мы играем вместе."]
        ]
      },
      design_intro: {
        title: "Направление: Дизайн",
        sub: "Что изучаем на этом направлении + примеры работ учеников",
        items: [
          ["🧩 Что изучаем", "Формы, цвет, композиция, простые элементы интерфейса и игровых объектов."],
          ["✨ Результат", "Даже из простых деталей можно собрать яркий и узнаваемый объект."],
          ["📁 Примеры проектов", "Объекты для игр, кнопки, иконки, постеры, персонажи из форм."],
          ["🎯 На уроке сейчас", "Собираем дизайн своего препятствия для финальной игры."]
        ]
      },
      ai_intro: {
        title: "Направление: Нейросети",
        sub: "Что изучаем на этом направлении + примеры работ учеников",
        items: [
          ["🤖 Что изучаем", "Как формулировать идею, выбирать стиль и тему для генерации."],
          ["🗣️ Важный навык", "Не просто нажать кнопку, а понять, что именно ты хочешь получить."],
          ["🖼️ Примеры проектов", "Фоны для игр, концепты персонажей, идеи для постеров и сцен."],
          ["🎯 На уроке сейчас", "Генерируем фон уровня, который будет крутиться в финальной игре."]
        ]
      },
      code_intro: {
        title: "Направление: Программирование",
        sub: "Что изучаем на этом направлении + примеры работ учеников",
        items: [
          ["🐍 Что изучаем", "Логику, переменные, параметры, как код меняет поведение объектов."],
          ["🔧 Примеры проектов", "Игры, анимации, интерактивные сцены, мини-симуляторы."],
          ["🧠 Сейчас на уроке", "Меняем числа в коде — и препятствие становится быстрее/сильнее/опаснее."],
          ["✅ Результат", "Ребёнок видит прямую связь: код → поведение объекта в игре."]
        ]
      },
      final_intro: {
        title: "Финал: запускаем общую игру",
        sub: "Сейчас все ваши решения собираются в один уровень",
        items: [
          ["🏁 Что произойдёт", "На трассе будут все 10 препятствий (ваши + автонастройки, если учеников меньше)."],
          ["🌈 Фоны", "Будут меняться каждые несколько секунд из работ учеников."],
          ["👥 Мультиплеер", "Все играют одновременно разными цветами персонажей."],
          ["🎉 Вау-эффект", "Каждый видит свой вклад в финальном уровне."]
        ]
      }
    };

    const conf = maps[st.key] || { title: st.title, sub: "", items: [] };
    E.stageBody.innerHTML = `
      <h2 class="stage-title">${esc(conf.title)}</h2>
      <p class="stage-sub">${esc(conf.sub)}</p>
      <div class="intro-grid">
        ${conf.items.map(([h, p]) => `<div class="intro-item"><h4>${esc(h)}</h4><p>${esc(p)}</p></div>`).join("")}
      </div>
      ${isTeacher() ? `<div class="action-row"><button class="btn btn-primary" data-next-stage>Открыть следующий этап</button></div>` : `<div class="action-row"><div class="inline-info">Ждём перехода от преподавателя…</div></div>`}
    `;

    const nextBtn = E.stageBody.querySelector("[data-next-stage]");
    if (nextBtn) nextBtn.addEventListener("click", () => socket.emit("teacher:control", { action: "nextStage" }));
  }

  function renderChooseStage() {
    const catalog = S.app.obstacleCatalog || [];
    const myType = S.app.me?.obstacleType || null;

    E.stageBody.innerHTML = `
      <h2 class="stage-title">Выбор препятствия</h2>
      <p class="stage-sub">Каждый ученик выбирает своё препятствие. Повторяться нельзя. Учитель потом переключит всех дальше.</p>
      <div class="cards">
        ${catalog.map(ob => {
          const owner = (S.app.students || []).find(s => s.socketId === ob.takenBy);
          const takenByOther = !!ob.takenBy && ob.takenBy !== S.app.me?.socketId;
          const selected = myType === ob.type;
          return `
            <div class="card ${selected ? "selected" : ""}">
              <div class="emoji">${ob.icon}</div>
              <h4>${esc(ob.name)}</h4>
              <p>${esc((ob.hints || [])[0] || "")}</p>
              <div class="meta">${takenByOther ? `Занято: ${esc(owner?.name || "кто-то")}` : selected ? "Ваш выбор" : "Свободно"}</div>
              ${isTeacher() ? "" : `<div class="action-row"><button class="btn small ${selected ? "btn-success" : ""}" ${takenByOther ? "disabled" : ""} data-pick="${ob.type}">${selected ? "Выбрано" : "Выбрать"}</button></div>`}
            </div>
          `;
        }).join("")}
      </div>
      ${isTeacher() ? `<div class="action-row"><button class="btn btn-primary" data-next-stage>Открыть следующий этап</button></div>` : ""}
    `;

    E.stageBody.querySelectorAll("[data-pick]").forEach(btn => {
      btn.addEventListener("click", () => {
        socket.emit("student:chooseObstacle", { obstacleType: btn.dataset.pick });
      });
    });

    const nextBtn = E.stageBody.querySelector("[data-next-stage]");
    if (nextBtn) nextBtn.addEventListener("click", () => socket.emit("teacher:control", { action: "nextStage" }));
  }

  function renderDesignStage() {
    const meta = meObstacleMeta();
    if (!meta && !isTeacher()) {
      E.stageBody.innerHTML = `
        <h2 class="stage-title">Этап 1 — Дизайн</h2>
        <p class="stage-sub">Сначала нужно выбрать препятствие на прошлом этапе.</p>
      `;
      return;
    }

    const d = {
      ...S.designDraft,
      ...(S.app?.me?.designData || {})
    };
    S.designDraft = d;

    E.stageBody.innerHTML = `
      <h2 class="stage-title">Этап 1 — Дизайн препятствия ${meta ? `${meta.icon} ${esc(meta.name)}` : ""}</h2>
      <p class="stage-sub">Соберите внешний вид: цвет, форма, стикер, размер.</p>

      <div class="form-grid">
        <div class="field">
          <label>Основной цвет</label>
          <input id="designPrimary" type="color" value="${d.primary}">
        </div>
        <div class="field">
          <label>Дополнительный цвет</label>
          <input id="designSecondary" type="color" value="${d.secondary}">
        </div>

        <div class="field">
          <label>Форма</label>
          <select id="designShape">
            ${["Круг","Квадрат","Шестигранник","Кристалл"].map(x => `<option ${x===d.shape?"selected":""}>${x}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Размер</label>
          <select id="designSize">
            ${["S","M","L"].map(x => `<option ${x===d.size?"selected":""}>${x}</option>`).join("")}
          </select>
        </div>

        <div class="field">
          <label>Стикер</label>
          <select id="designSticker">
            ${["★","⚡","✦","◆","⬢","☁️","🔥","❄️","🌀","🌿"].map(x => `<option ${x===d.sticker?"selected":""}>${x}</option>`).join("")}
          </select>
        </div>

        <div class="preview-box full">
          <strong>Предпросмотр</strong>
          <div class="design-preview" id="designPreview"></div>
          <div class="action-row">
            ${!isTeacher() ? `<button class="btn btn-primary" id="saveDesignBtn">Сохранить дизайн</button>` : ""}
            ${!isTeacher() ? `<button class="btn" id="markDesignDoneBtn">Отметить готово</button>` : ""}
            ${isTeacher() ? `<button class="btn btn-primary" data-next-stage>Открыть следующий этап</button>` : ""}
          </div>
        </div>
      </div>
    `;

    const inputs = {
      primary: document.getElementById("designPrimary"),
      secondary: document.getElementById("designSecondary"),
      shape: document.getElementById("designShape"),
      sticker: document.getElementById("designSticker"),
      size: document.getElementById("designSize")
    };

    function updateDraftAndPreview() {
      S.designDraft = {
        primary: inputs.primary.value,
        secondary: inputs.secondary.value,
        shape: inputs.shape.value,
        sticker: inputs.sticker.value,
        size: inputs.size.value
      };
      drawDesignPreview();
    }

    Object.values(inputs).forEach(el => el && el.addEventListener("input", updateDraftAndPreview));
    drawDesignPreview();

    const saveBtn = document.getElementById("saveDesignBtn");
    if (saveBtn) saveBtn.addEventListener("click", () => {
      socket.emit("student:saveDesign", { designData: S.designDraft });
      toast("Дизайн сохранён", "success");
    });

    const markBtn = document.getElementById("markDesignDoneBtn");
    if (markBtn) markBtn.addEventListener("click", () => {
      socket.emit("student:markStageDone");
      toast("Готово отмечено", "success");
    });

    const nextBtn = E.stageBody.querySelector("[data-next-stage]");
    if (nextBtn) nextBtn.addEventListener("click", () => socket.emit("teacher:control", { action: "nextStage" }));
  }

  function drawDesignPreview() {
    const box = document.getElementById("designPreview");
    if (!box) return;
    const d = S.designDraft;
    const mapShape = { "Круг":"circle", "Квадрат":"square", "Шестигранник":"hex", "Кристалл":"crystal" };
    const sizePx = d.size === "S" ? 74 : d.size === "L" ? 118 : 94;

    box.innerHTML = `
      <div class="design-object ${mapShape[d.shape] || "square"}"
           style="width:${sizePx}px;height:${sizePx}px;background:linear-gradient(135deg, ${d.primary}, ${d.secondary}); box-shadow: 0 8px 20px rgba(0,0,0,.08)">
        <div style="font-size:${Math.round(sizePx*0.34)}px;">${esc(d.sticker)}</div>
      </div>
      <div style="position:absolute;left:12px;top:10px;font-size:12px;color:#64748b">${esc(d.shape)} • ${esc(d.size)}</div>
    `;
  }

  function renderAiStage() {
    const meta = meObstacleMeta();
    E.stageBody.innerHTML = `
      <h2 class="stage-title">Этап 2 — Нейросети: фон игры ${meta ? `для ${meta.icon} ${esc(meta.name)}` : ""}</h2>
      <p class="stage-sub">Выберите тему и элементы. Можно с AI-ключом, а без ключа сайт всё равно сгенерирует красивый демо-фон.</p>
      <div class="form-grid">
        <div class="field">
          <label>Тема</label>
          <select id="aiTheme">
            ${["Неон","Космос","Лава","Лёд","Джунгли","Город","Конфеты"].map(x => `<option ${x===S.aiDraft.theme?"selected":""}>${x}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Слова про цвет</label>
          <input id="aiColorWord" type="text" value="${esc(S.aiDraft.colorWord || "яркие")}" placeholder="яркие, контрастные, мягкие..." />
        </div>
        <div class="field full">
          <label>Мотивы (до 3 штук через запятую)</label>
          <input id="aiMotifs" type="text" value="${esc((S.aiDraft.motifs||[]).join(", "))}" placeholder="${OB_MOTIF_SUGGESTIONS.join(", ")}" />
        </div>

        <div class="preview-box full">
          <strong>Предпросмотр фона</strong>
          <div id="aiPreviewRoot" class="ai-preview"></div>
          <div class="action-row">
            ${!isTeacher() ? `<button class="btn btn-primary" id="genAiBtn">Сгенерировать фон</button>` : ""}
            ${!isTeacher() ? `<button class="btn" id="markAiDoneBtn">Отметить готово</button>` : ""}
            ${isTeacher() ? `<button class="btn btn-primary" data-next-stage>Открыть следующий этап</button>` : ""}
          </div>
          <div class="note">API ключ вставляется в Replit Secrets как <b>OPENAI_API_KEY</b>. Без ключа урок всё равно не ломается.</div>
        </div>
      </div>
    `;

    const themeEl = document.getElementById("aiTheme");
    const colorEl = document.getElementById("aiColorWord");
    const motifsEl = document.getElementById("aiMotifs");

    function syncAIDraft() {
      const motifs = motifsEl.value
        .split(",")
        .map(x => x.trim())
        .filter(Boolean)
        .slice(0, 3);
      S.aiDraft = {
        theme: themeEl.value,
        colorWord: colorEl.value.trim() || "яркие",
        motifs
      };
      if (!S.aiPreview || S.aiPreview.source !== "openai") {
        S.aiPreview = {
          ...(S.aiPreview || {}),
          theme: S.aiDraft.theme,
          motifs: S.aiDraft.motifs
        };
      }
      renderAIPreview();
    }

    [themeEl, colorEl, motifsEl].forEach(el => el.addEventListener("input", syncAIDraft));

    if (!S.aiPreview && S.app?.me?.aiData?.background) S.aiPreview = S.app.me.aiData.background;
    renderAIPreview();

    const genBtn = document.getElementById("genAiBtn");
    if (genBtn) genBtn.addEventListener("click", async () => {
      syncAIDraft();
      genBtn.disabled = true;
      genBtn.textContent = "Генерация...";
      socket.emit("student:aiGenerateBackground", {
        theme: S.aiDraft.theme,
        colorWord: S.aiDraft.colorWord,
        motifs: S.aiDraft.motifs,
        promptSummary: `${S.aiDraft.theme}; ${S.aiDraft.motifs.join(", ")}`
      });
      setTimeout(() => {
        genBtn.disabled = false;
        genBtn.textContent = "Сгенерировать фон";
      }, 1800);
    });

    const markBtn = document.getElementById("markAiDoneBtn");
    if (markBtn) markBtn.addEventListener("click", () => {
      socket.emit("student:markStageDone");
      toast("Готово отмечено", "success");
    });

    const nextBtn = E.stageBody.querySelector("[data-next-stage]");
    if (nextBtn) nextBtn.addEventListener("click", () => socket.emit("teacher:control", { action: "nextStage" }));
  }

  function renderAIPreview() {
    const root = document.getElementById("aiPreviewRoot");
    if (!root) return;
    const bg = S.aiPreview || S.app?.me?.aiData?.background || null;
    const theme = bg?.theme || S.aiDraft.theme;
    const motifs = bg?.motifs || S.aiDraft.motifs || [];
    const palette = bg?.palette || ["#e2e8f0","#cbd5e1","#94a3b8"];

    root.innerHTML = `
      <div class="ai-canvas" id="aiCanvasBox"></div>
      <div class="palette-row">
        ${(palette || []).map(c => `<span class="swatch" style="background:${c}"></span>`).join("")}
        <span class="note">${esc(bg?.label || `${theme} • ${(motifs||[]).join(", ")}`)}</span>
      </div>
      ${bg?.imageDataUrl ? `<div class="note">Источник: OpenAI ✅</div>` : `<div class="note">Источник: демо-генерация (fallback)</div>`}
    `;

    const canvasBox = document.getElementById("aiCanvasBox");
    if (!canvasBox) return;

    if (bg?.imageDataUrl) {
      canvasBox.innerHTML = `<img src="${bg.imageDataUrl}" alt="bg" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
      return;
    }

    const [c1,c2,c3] = palette;
    canvasBox.innerHTML = `
      <div class="layer" style="background:linear-gradient(135deg, ${c1}, ${c2});"></div>
      <div class="layer" style="background:radial-gradient(circle at 80% 20%, ${c3}80, transparent 45%), radial-gradient(circle at 20% 80%, ${c3}55, transparent 40%);"></div>
    `;
    const motifIcons = {
      "линии":"〰️","звезды":"⭐","кристаллы":"💎","облака":"☁️","шестерёнки":"⚙️",
      "молнии":"⚡","пиксели":"🧩","грибы":"🍄","лианы":"🌿","шахматы":"♟️"
    };
    (motifs || []).forEach((m, i) => {
      const span = document.createElement("div");
      span.className = "motif";
      span.textContent = motifIcons[m] || "✦";
      span.style.left = (10 + i * 28) + "%";
      span.style.top = (18 + (i % 2) * 40) + "%";
      span.style.fontSize = (22 + i * 4) + "px";
      canvasBox.appendChild(span);
    });
  }

  function renderCodeStage() {
    const meta = meObstacleMeta();
    if (!meta && !isTeacher()) {
      E.stageBody.innerHTML = `<h2 class="stage-title">Этап 3 — Python</h2><p class="stage-sub">Сначала выберите препятствие.</p>`;
      return;
    }

    if (meta && !S.codeDraft) S.codeDraft = meta.codeTemplate || "";

    E.stageBody.innerHTML = `
      <h2 class="stage-title">Этап 3 — Python: настройка препятствия ${meta ? `${meta.icon} ${esc(meta.name)}` : ""}</h2>
      <p class="stage-sub">Измените числа в коде. Не пишем большой код — только параметры.</p>

      <div class="form-grid">
        <div class="field">
          <label>Шаблон (пример)</label>
          <div class="template-box">${meta ? esc(meta.codeTemplate || "") : "Выберите препятствие"}</div>
        </div>

        <div class="field">
          <label>Подсказки</label>
          <ul class="code-hints">
            ${(meta?.hints || []).map(h => `<li>${esc(h)}</li>`).join("")}
            ${(meta?.varDefs || []).map(v => `<li>${esc(v.key)}: ${v.min}–${v.max}</li>`).join("")}
          </ul>
        </div>

        <div class="field full">
          <label>Ваш код (Python-подобный формат)</label>
          <textarea id="codeInput">${esc(S.codeDraft)}</textarea>
        </div>

        <div class="preview-box full">
          <div id="codeStatus" class="code-status ${S.codeValidated?.ok ? "ok" : S.codeValidated && !S.codeValidated.ok ? "err" : ""}">
            ${renderCodeStatusText()}
          </div>
          <div class="action-row">
            ${!isTeacher() ? `<button class="btn btn-primary" id="validateCodeBtn">Проверить и сохранить</button>` : ""}
            ${!isTeacher() ? `<button class="btn" id="markCodeDoneBtn">Отметить готово</button>` : ""}
            ${isTeacher() ? `<button class="btn btn-primary" data-next-stage>Открыть следующий этап</button>` : ""}
          </div>
        </div>
      </div>
    `;

    const input = document.getElementById("codeInput");
    if (input) {
      input.addEventListener("input", () => {
        S.codeDraft = input.value;
      });
    }

    const validateBtn = document.getElementById("validateCodeBtn");
    if (validateBtn) validateBtn.addEventListener("click", () => {
      S.codeDraft = input.value;
      socket.emit("student:saveCode", { codeText: S.codeDraft });
    });

    const markBtn = document.getElementById("markCodeDoneBtn");
    if (markBtn) markBtn.addEventListener("click", () => {
      socket.emit("student:markStageDone");
      toast("Готово отмечено", "success");
    });

    const nextBtn = E.stageBody.querySelector("[data-next-stage]");
    if (nextBtn) nextBtn.addEventListener("click", () => socket.emit("teacher:control", { action: "nextStage" }));
  }

  function renderCodeStatusText() {
    if (!S.codeValidated) return "Пока не проверено. Измените числа и нажмите «Проверить и сохранить».";
    if (S.codeValidated.ok) return "Код принят ✅ Параметры сохранены.";
    if (Array.isArray(S.codeValidated.errors)) return S.codeValidated.errors.join(" • ");
    return "Ошибка проверки";
  }

  function renderFinalGameStage() {
    E.stageBody.innerHTML = `
      <h2 class="stage-title">Финальная общая игра</h2>
      <p class="stage-sub">Все созданные препятствия и фоны собраны в один уровень. Учитель запускает игру, все играют одновременно.</p>
      <div class="intro-grid">
        <div class="intro-item"><h4>🎮 Управление</h4><p>← → двигаться, пробел/↑ — прыжок.</p></div>
        <div class="intro-item"><h4>🧠 Что влияет на игру</h4><p>Дизайн меняет внешний вид, нейросеть — фон, Python — поведение препятствия.</p></div>
        <div class="intro-item"><h4>👩‍🏫 Для преподавателя</h4><p>Можно запускать/останавливать игру в верхней панели.</p></div>
      </div>
      ${isTeacher() ? `<div class="action-row"><button class="btn btn-success" data-start-game>Старт игры</button><button class="btn btn-danger" data-stop-game>Стоп</button></div>` : `<div class="action-row"><div class="inline-info">Ждите команду преподавателя для запуска</div></div>`}
    `;
    const startBtn = E.stageBody.querySelector("[data-start-game]");
    const stopBtn = E.stageBody.querySelector("[data-stop-game]");
    if (startBtn) startBtn.addEventListener("click", () => socket.emit("teacher:control", { action: "startGame" }));
    if (stopBtn) stopBtn.addEventListener("click", () => socket.emit("teacher:control", { action: "stopGame" }));
    drawGame();
  }

  function renderUnknown() {
    E.stageBody.innerHTML = `<h2 class="stage-title">Этап</h2><p class="stage-sub">Неизвестный экран</p>`;
  }

  // ---------- GAME RENDER ----------
  const ctx = E.gameCanvas.getContext("2d");
  function drawGame() {
    const canvas = E.gameCanvas;
    const snap = S.gameSnapshot;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // background (rotate by tick)
    const backgrounds = snap?.backgrounds || [];
    const bg = backgrounds.length ? backgrounds[Math.floor(((snap?.tick || 0) / 60) % backgrounds.length)] : null;

    if (bg?.imageDataUrl) {
      // cache image on object
      if (!bg._img) {
        bg._img = new Image();
        bg._img.src = bg.imageDataUrl;
      }
      if (bg._img.complete) {
        ctx.drawImage(bg._img, 0, 0, w, h);
      } else {
        fillFallbackBG(bg, w, h);
      }
    } else {
      fillFallbackBG(bg, w, h);
    }

    // ground
    const groundY = 300;
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.fillRect(0, groundY, w, h-groundY);
    ctx.strokeStyle = "#dbeafe";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(w, groundY);
    ctx.stroke();

    // route / obstacles
    const route = snap?.route || [];
    const scaleX = 0.8;
    const startX = 90;
    route.forEach((ob, i) => {
      const x = startX + i * 80;
      drawObstacle(ob, x, groundY, i);
      // checkpoint marker
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(x-1, groundY-65, 2, 65);
    });

    // finish
    const finishX = startX + route.length * 80 + 40;
    ctx.fillStyle = "#111827";
    ctx.fillRect(finishX, groundY - 90, 6, 90);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(finishX + 6, groundY - 90, 18, 12);
    ctx.fillStyle = "#111827";
    ctx.font = "12px sans-serif";
    ctx.fillText("Финиш", finishX - 6, groundY - 98);

    // players
    (snap?.players || []).forEach((p) => {
      const drawX = 20 + p.x * scaleX;
      const drawY = groundY - 16 + p.y * 0.5;
      ctx.fillStyle = p.color || "#2563eb";
      ctx.beginPath();
      ctx.arc(drawX, drawY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#111827";
      ctx.font = "11px sans-serif";
      ctx.fillText(p.name || "Игрок", drawX - 12, drawY - 16);
    });

    if (!snap?.running) {
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.fillRect(20, 20, 360, 56);
      ctx.strokeStyle = "#dbeafe";
      ctx.strokeRect(20, 20, 360, 56);
      ctx.fillStyle = "#1e3a8a";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("Игра не запущена", 36, 45);
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "#475569";
      ctx.fillText("Преподаватель нажимает «Старт игры»", 36, 64);
    }
  }

  function fillFallbackBG(bg, w, h) {
    const palette = bg?.palette || ["#eef2ff","#dbeafe","#bfdbfe"];
    const [c1, c2, c3] = palette;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, c1);
    g.addColorStop(0.55, c2);
    g.addColorStop(1, c3);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // decorative bubbles
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 4) * 0.04})`;
      const x = (i * 97) % w;
      const y = (i * 61) % 220;
      const r = 14 + (i % 5) * 9;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (bg?.label) {
      ctx.fillStyle = "rgba(255,255,255,.75)";
      ctx.fillRect(16, 14, 240, 28);
      ctx.fillStyle = "#1f2937";
      ctx.font = "12px sans-serif";
      ctx.fillText(bg.label, 24, 33);
    }
  }

  function drawObstacle(ob, x, groundY, i) {
    const d = ob.design || {};
    const primary = d.primary || "#60a5fa";
    const secondary = d.secondary || "#bfdbfe";
    const sticker = d.sticker || "★";
    const shape = d.shape || "Круг";

    const grad = ctx.createLinearGradient(x - 18, groundY - 48, x + 18, groundY - 12);
    grad.addColorStop(0, primary);
    grad.addColorStop(1, secondary);
    ctx.fillStyle = grad;
    ctx.strokeStyle = "rgba(15,23,42,.15)";
    ctx.lineWidth = 2;

    switch (ob.type) {
      case "trampoline":
        ctx.fillRect(x - 26, groundY - 10, 52, 10);
        ctx.strokeRect(x - 26, groundY - 10, 52, 10);
        ctx.fillRect(x - 18, groundY - 32, 36, 16);
        ctx.strokeRect(x - 18, groundY - 32, 36, 16);
        break;
      case "pendulum":
        ctx.beginPath(); ctx.moveTo(x, groundY - 65); ctx.lineTo(x, groundY - 18); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + Math.sin((i+1)*0.7) * 18, groundY - 12, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      case "plant":
        ctx.beginPath();
        ctx.ellipse(x, groundY - 18, 18, 26, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        break;
      case "cloud":
        ctx.beginPath();
        ctx.arc(x - 12, groundY - 40, 12, 0, Math.PI * 2);
        ctx.arc(x, groundY - 46, 14, 0, Math.PI * 2);
        ctx.arc(x + 14, groundY - 40, 12, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        break;
      case "laser":
        ctx.fillRect(x - 24, groundY - 50, 8, 50);
        ctx.fillRect(x + 16, groundY - 50, 8, 50);
        ctx.strokeRect(x - 24, groundY - 50, 8, 50);
        ctx.strokeRect(x + 16, groundY - 50, 8, 50);
        ctx.strokeStyle = primary; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - 16, groundY - 28); ctx.lineTo(x + 16, groundY - 28); ctx.stroke();
        break;
      case "falling":
        ctx.fillRect(x - 24, groundY - 10, 48, 10);
        ctx.strokeRect(x - 24, groundY - 10, 48, 10);
        break;
      case "fan":
        ctx.beginPath(); ctx.arc(x, groundY - 22, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (let a=0;a<3;a++){
          ctx.beginPath();
          ctx.moveTo(x, groundY - 22);
          ctx.lineTo(x + Math.cos(a*2.1 + i) * 18, groundY - 22 + Math.sin(a*2.1 + i) * 18);
          ctx.stroke();
        }
        break;
      case "spikes":
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const sx = x - 20 + k * 10;
          ctx.moveTo(sx, groundY);
          ctx.lineTo(sx + 5, groundY - 18);
          ctx.lineTo(sx + 10, groundY);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      case "slime":
        ctx.beginPath();
        ctx.ellipse(x, groundY - 6, 24, 10, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        break;
      case "electric":
        ctx.beginPath(); ctx.arc(x, groundY - 28, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = primary; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 8, groundY - 46); ctx.lineTo(x + 2, groundY - 30); ctx.lineTo(x - 2, groundY - 30); ctx.lineTo(x + 8, groundY - 12);
        ctx.stroke();
        break;
      default:
        drawShapeToken(x, groundY - 26, shape, primary, secondary);
        break;
    }

    // sticker + owner
    ctx.fillStyle = "#0f172a";
    ctx.font = "14px sans-serif";
    ctx.fillText(sticker, x - 4, groundY - 22);

    ctx.fillStyle = "#334155";
    ctx.font = "10px sans-serif";
    const owner = ob.ownerName || "Авто";
    ctx.fillText(owner.length > 8 ? owner.slice(0,8) : owner, x - 18, groundY + 14);
  }

  function drawShapeToken(x,y,shape,c1,c2){
    const grad = ctx.createLinearGradient(x-16,y-16,x+16,y+16);
    grad.addColorStop(0,c1); grad.addColorStop(1,c2);
    ctx.fillStyle = grad;
    if (shape === "Круг") {
      ctx.beginPath(); ctx.arc(x,y,16,0,Math.PI*2); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillRect(x-16,y-16,32,32); ctx.strokeRect(x-16,y-16,32,32);
    }
  }

  // key input for game
  function emitGameInput() {
    if (!S.app?.me || S.app.me.role !== "student") return;
    if (stage()?.key !== "final_game") return;
    socket.emit("game:input", S.keys);
  }

  window.addEventListener("keydown", (e) => {
    if (["ArrowLeft","ArrowRight","ArrowUp"," ","Spacebar"].includes(e.key)) e.preventDefault();
    let changed = false;
    if (e.key === "ArrowLeft") { S.keys.left = true; changed = true; }
    if (e.key === "ArrowRight") { S.keys.right = true; changed = true; }
    if (e.key === "ArrowUp" || e.key === " " || e.code === "Space") { S.keys.jump = true; changed = true; }
    if (changed) emitGameInput();
  });
  window.addEventListener("keyup", (e) => {
    let changed = false;
    if (e.key === "ArrowLeft") { S.keys.left = false; changed = true; }
    if (e.key === "ArrowRight") { S.keys.right = false; changed = true; }
    if (e.key === "ArrowUp" || e.key === " " || e.code === "Space") { S.keys.jump = false; changed = true; }
    if (changed) emitGameInput();
  });

  // init render before state
  setRoleChoice("student");
})();
