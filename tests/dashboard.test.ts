import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultData,
  defaultSettings,
  habitStreak,
  localDate,
  loadData,
  normalizeSettings,
  parseBackup,
  safeUrl,
  spotifyEmbed,
  widgetLabels,
} from "../src/lib/dashboard.ts";
const backup = (changes = {}) =>
  JSON.stringify({ ...structuredClone(defaultData), version: 2, ...changes });
test("bienvenida: primer perfil sin nombre, migración y respaldo conservan el nombre elegido", () => {
  assert.equal(defaultSettings.userName, "");
  assert.equal(defaultSettings.welcomeCompleted, false);
  assert.equal(normalizeSettings({ userName: "Yiyeh" }).welcomeCompleted, true);
  assert.equal(normalizeSettings({ userName: "", welcomeCompleted: true }).welcomeCompleted, true);
  const data = structuredClone(defaultData);
  data.settings.userName = "Alex";
  data.settings.welcomeCompleted = true;
  const restored = parseBackup(JSON.stringify({ ...data, version: 2 }));
  assert.equal(restored.settings.userName, "Alex");
  assert.equal(restored.settings.welcomeCompleted, true);
});
test("respaldo completo conserva todas las colecciones y ajustes", () => {
  const result = parseBackup(backup());
  assert.deepEqual(result, defaultData);
});
test("migra un respaldo antiguo con widgets y ajustes nuevos", () => {
  const old = {
    tasks: [],
    habits: [],
    notes: [],
    settings: {
      theme: "dark",
      newsTags: ["arte", "música"],
      enabledWidgets: { tasks: false },
      columnLayout: [["pomodoro"], ["tasks"], ["notes"]],
    },
  };
  const result = parseBackup(JSON.stringify(old));
  assert.equal(result.settings.theme, "dark");
  assert.equal(result.settings.newsTags, "arte, música");
  assert.equal(result.settings.enabledWidgets.tasks, false);
  assert.equal(result.settings.enabledWidgets.music, true);
  assert.equal(
    result.settings.columnLayout.flat().length,
    Object.keys(widgetLabels).length,
  );
});
test("rechaza un respaldo inválido antes de aplicar colecciones válidas", () => {
  assert.throws(() =>
    parseBackup(backup({ notes: [{ id: "x", title: "dato parcial" }] })),
  );
  assert.throws(() => parseBackup("{}"));
  assert.throws(() => parseBackup(backup({ version: 500 })));
  assert.deepEqual(defaultData.tasks, []);
});
test("rechaza tareas con subtareas inválidas y registros duplicados", () => {
  const task = {
    id: "1",
    title: "Leer",
    completed: false,
    priority: "medium",
    pomodoros: 0,
    subtasks: [],
  };
  assert.throws(() => parseBackup(backup({ tasks: [task, task] })));
  assert.throws(() =>
    parseBackup(backup({ tasks: [{ ...task, subtasks: [{}] }] })),
  );
});
test("rechaza fechas imposibles y horas de agenda invertidas", () => {
  assert.throws(() =>
    parseBackup(
      backup({ focusSessions: [{ date: "2026-02-30", minutes: 5 }] }),
    ),
  );
  assert.throws(() =>
    parseBackup(
      backup({
        timeBlocks: [
          {
            id: "a",
            title: "Evento",
            date: "2026-10-17",
            startTime: "15:00",
            endTime: "14:00",
            color: "#39745b",
          },
        ],
      }),
    ),
  );
  assert.equal(
    parseBackup(
      backup({ focusSessions: [{ date: "2024-02-29", minutes: 25 }] }),
    ).focusSessions.length,
    1,
  );
});
test("repara distribuciones duplicadas, desconocidas o incompletas", () => {
  const result = normalizeSettings({
    newsWidgetVersion: 1,
    columnLayout: [
      ["tasks", "tasks", "toString"],
      ["pomodoro"],
      ["desconocido"],
    ],
  });
  assert.equal(
    new Set(result.columnLayout.flat()).size,
    Object.keys(widgetLabels).length,
  );
  assert.equal(result.columnLayout[0].length, 1);
  assert.deepEqual(
    normalizeSettings({ columnLayout: [[]] }).columnLayout,
    defaultSettings.columnLayout,
  );
});
test("ajustes importados respetan tipos, colores y límites", () => {
  const settings = normalizeSettings({
    workMinutes: -3,
    dailyGoal: 9999,
    shortBreak: Infinity,
    longBreak: NaN,
    theme: "raro",
    accentColor: "url(javascript:1)",
    showClock: "false",
    weatherLocation: { name: "Fuera", latitude: 200, longitude: 300 },
  });
  assert.equal(settings.workMinutes, 1);
  assert.equal(settings.dailyGoal, 720);
  assert.equal(settings.longBreak, 15);
  assert.equal(settings.accentColor, defaultSettings.accentColor);
  assert.equal(settings.showClock, true);
  assert.equal(settings.weatherLocation, null);
});
test("no permite scripts, credenciales ni protocolos peligrosos en accesos", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hola",
    "file:///C:/privado",
    "https://user:password@example.com",
    "spotify:track:abc",
    "no es url",
  ])
    assert.equal(safeUrl(url), null);
  assert.equal(
    safeUrl("https://example.com/a?q=hola"),
    "https://example.com/a?q=hola",
  );
  assert.equal(safeUrl("http://localhost:3000/"), "http://localhost:3000/");
  assert.throws(() =>
    parseBackup(
      backup({
        bookmarks: [
          {
            id: "bad",
            title: "Mal",
            url: "javascript:alert(1)",
            group: "Personal",
            color: "#39745b",
          },
        ],
      }),
    ),
  );
});
test("Spotify solo admite embeds oficiales con identificadores válidos", () => {
  const id = "37i9dQZF1DX4sWSpwq3LiO";
  assert.equal(
    spotifyEmbed(`https://open.spotify.com/playlist/${id}?si=abc`),
    `https://open.spotify.com/embed/playlist/${id}`,
  );
  assert.equal(
    spotifyEmbed(`https://open.spotify.com/intl-es/track/${id}`),
    `https://open.spotify.com/embed/track/${id}`,
  );
  assert.equal(
    spotifyEmbed(`https://open.spotify.com.evil.test/playlist/${id}`),
    null,
  );
  assert.equal(spotifyEmbed("https://open.spotify.com/playlist/invalid"), null);
});
test("las rachas respetan días locales consecutivos y vencen sin interacción", () => {
  const now = new Date(2026, 9, 17, 0, 15);
  assert.equal(habitStreak(["2026-10-17", "2026-10-16", "2026-10-15"], now), 3);
  assert.equal(habitStreak(["2026-10-16", "2026-10-15"], now), 2);
  assert.equal(habitStreak(["2026-10-15"], now), 0);
  assert.equal(habitStreak(["2026-10-17", "2026-10-17"], now), 1);
  assert.equal(localDate(new Date(2026, 0, 1, 0, 15)), "2026-01-01");
});
test("las rachas atraviesan cambios de mes y horario de verano", () => {
  assert.equal(
    habitStreak(["2026-03-01", "2026-02-28"], new Date(2026, 2, 1, 12)),
    2,
  );
  assert.equal(
    habitStreak(
      ["2026-09-07", "2026-09-06", "2026-09-05"],
      new Date(2026, 8, 7, 12),
    ),
    3,
  );
});
test("la recuperación no modifica almacenamiento corrupto", () => {
  const storage = new Map([["mia_dashboard_v2", "{roto"]]);
  const loaded = loadData({ getItem: (key) => storage.get(key) ?? null });
  assert.ok(loaded.warning);
  assert.equal(storage.get("mia_dashboard_v2"), "{roto");
  assert.deepEqual(loaded.data, defaultData);
});
test("migra las claves legacy locales sin perder tareas", () => {
  const task = {
    id: "old",
    title: "Conservar",
    completed: false,
    priority: "low",
    pomodoros: 0,
    subtasks: [],
  };
  const storage = new Map([
    ["dash_tasks", JSON.stringify([task])],
    ["dash_settings", JSON.stringify({ theme: "dark", userName: "Mi nombre" })],
  ]);
  const result = loadData({ getItem: (key) => storage.get(key) ?? null });
  assert.equal(result.warning, "");
  assert.equal(result.data.tasks[0].title, "Conservar");
  assert.equal(result.data.settings.userName, "Mi nombre");
});
test("el respaldo ignora credenciales OAuth ajenas al esquema", () => {
  const result = parseBackup(
    backup({
      accessToken: "no-exportar",
      settings: { ...defaultSettings, refreshToken: "no-exportar" },
    }),
  );
  assert.ok(!JSON.stringify(result).includes("no-exportar"));
});

test("inicio: noticias se introduce una vez y respeta ocultación y distribución posteriores", () => {
  const old = structuredClone(defaultSettings) as Partial<
    typeof defaultSettings
  >;
  delete old.newsWidgetVersion;
  old.enabledWidgets!.news = false;
  old.columnLayout = [["tasks"], ["pomodoro"], ["news"]];
  const migrated = normalizeSettings(old);
  assert.equal(migrated.enabledWidgets.news, true);
  assert.equal(migrated.columnLayout[0][0], "news");
  const custom = {
    ...migrated,
    enabledWidgets: { ...migrated.enabledWidgets, news: false },
    homeLayout: "scenic",
    newsWidgetCategory: "gaming",
  };
  const restored = normalizeSettings(custom);
  assert.equal(restored.enabledWidgets.news, false);
  assert.equal(restored.homeLayout, "scenic");
  assert.equal(restored.newsWidgetCategory, "gaming");
  assert.deepEqual(restored.columnLayout, migrated.columnLayout);
});

test("barra lateral: personalización de orden, secciones visibles y tarjeta de enfoque", () => {
  const custom = normalizeSettings({
    navOrder: [
      "reading",
      "library",
      "all",
      "focus",
      "gaming",
      "invalido",
      "reading",
    ],
    enabledNavSections: {
      calendar: false,
      notes: false,
      reading: true,
      desconocido: true,
    },
    showSidebarFocus: false,
  });
  assert.equal(custom.navOrder[0], "reading");
  assert.equal(custom.navOrder[1], "library");
  assert.equal(custom.navOrder[2], "all");
  assert.equal(new Set(custom.navOrder).size, 7);
  assert.equal(custom.enabledNavSections.calendar, false);
  assert.equal(custom.enabledNavSections.notes, false);
  assert.equal(custom.enabledNavSections.reading, true);
  assert.equal(custom.enabledNavSections.all, true);
  assert.equal(custom.showSidebarFocus, false);
  assert.equal(
    normalizeSettings({ showSidebarFocus: true }).showSidebarFocus,
    true,
  );
});
