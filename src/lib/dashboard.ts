import { validReminder } from "./reminders.ts";
import type { Reminder } from "./reminders.ts";
import { validSavedGame } from "./gaming.ts";
import type { SavedGame } from "./gaming.ts";
export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}
export interface Task {
  id: string;
  title: string;
  priority: "low" | "medium" | "high";
  completed: boolean;
  dueDate?: string;
  dueTime?: string;
  reminderMinutes?: number;
  subtasks: SubTask[];
  pomodoros: number;
}
export interface Habit {
  id: string;
  name: string;
  streak: number;
  history: string[];
}
export interface StickyNote {
  id: string;
  title: string;
  content: string;
  color: string;
}
export interface QuickIdea {
  id: string;
  content: string;
  createdAt: string;
}
export interface TimeBlock {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  reminderMinutes?: number;
  color: string;
}
export interface FocusSession {
  date: string;
  minutes: number;
}
export interface Bookmark {
  id: string;
  title: string;
  url: string;
  group: string;
  color: string;
}
export const sectionLabels = {
  all: "Mi espacio",
  focus: "Enfoque y tareas",
  calendar: "Mi agenda",
  notes: "Notas e ideas",
  reading: "Noticias",
  library: "Mi biblioteca",
  gaming: "Rincón gamer",
} as const;
export type SectionId = keyof typeof sectionLabels;
export const widgetLabels = {
  tasks: "Tareas",
  pomodoro: "Temporizador",
  calendar: "Calendario",
  reminders: "Alarmas y avisos",
  habits: "Hábitos",
  notes: "Notas",
  ideas: "Captura de ideas",
  stats: "Tu progreso",
  news: "Noticias",
  music: "Spotify",
  weather: "El tiempo",
  gaming: "Radar gamer",
};
export type WidgetId = keyof typeof widgetLabels;
export interface DashboardSettings {
  readerPreferences: Record<string, string | number | boolean>;
  mangaCoverOverrides: Record<string, "official" | "lastPage">;
  surfaceTone:
    | "stone"
    | "sand"
    | "blue"
    | "lavender"
    | "rose"
    | "sage"
    | "graphite";
  theme: "dark" | "light" | "system";
  accentColor: string;
  searchEngine: string;
  userName: string;
  welcomeCompleted: boolean;
  dailyIntention: string;
  intentionDate: string;
  newsTags: string;
  newsWidgetVersion: number;
  newsWidgetCategory:
    | "all"
    | "tech"
    | "gaming"
    | "anime"
    | "science"
    | "culture"
    | "general";
  homeLayout: "compact" | "scenic";
  navOrder: SectionId[];
  enabledNavSections: Record<SectionId, boolean>;
  showSidebarFocus: boolean;
  columnLayout: WidgetId[][];
  enabledWidgets: Record<WidgetId, boolean>;
  background: "linen" | "aurora" | "plain";
  density: "comfortable" | "compact";
  clock24: boolean;
  showSeconds: boolean;
  showClock: boolean;
  showBookmarks: boolean;
  showSummary: boolean;
  remindersEnabled: boolean;
  openInNewTab: boolean;
  workMinutes: number;
  shortBreak: number;
  longBreak: number;
  dailyGoal: number;
  spotifyUrl: string;
  spotifyCompact: boolean;
  spotifyMode: "connect" | "embed";
  spotifyClientId: string;
  googleClientId: string;
  gamingPlatform: string;
  gamingShowDemos: boolean;
  gamingHideClaimed: boolean;
  gamingHiddenIds: string[];
  gamingRecentIds: string[];
  weatherLocation: { name: string; latitude: number; longitude: number } | null;
}
export interface DashboardData {
  tasks: Task[];
  habits: Habit[];
  notes: StickyNote[];
  ideas: QuickIdea[];
  timeBlocks: TimeBlock[];
  reminders: Reminder[];
  focusSessions: FocusSession[];
  bookmarks: Bookmark[];
  games: SavedGame[];
  settings: DashboardSettings;
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function habitStreak(history: string[], now = new Date()): number {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const days = new Set(history);
  if (!days.has(localDate(date))) date.setDate(date.getDate() - 1);
  let streak = 0;
  while (days.has(localDate(date)) && streak <= days.size) {
    streak++;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}
export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function spotifyEmbed(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.hostname !== "open.spotify.com" ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    const match = url.pathname.match(
      /^\/(?:intl-[a-z]+\/)?(?:embed\/)?(playlist|album|track|episode|show|artist)\/([a-zA-Z0-9]{22})\/?$/,
    );
    return match
      ? `https://open.spotify.com/embed/${match[1]}/${match[2]}`
      : null;
  } catch {
    return null;
  }
}
export const defaultSettings: DashboardSettings = {
  readerPreferences: {},
  mangaCoverOverrides: {},
  surfaceTone: "stone",
  theme: "light",
  accentColor: "#586573",
  searchEngine: "google",
  userName: "",
  welcomeCompleted: false,
  dailyIntention: "",
  intentionDate: localDate(),
  newsTags: "diseño, tecnología, creatividad",
  newsWidgetVersion: 1,
  newsWidgetCategory: "all",
  homeLayout: "compact",
  navOrder: [
    "all",
    "focus",
    "calendar",
    "notes",
    "reading",
    "library",
    "gaming",
  ],
  enabledNavSections: {
    all: true,
    focus: true,
    calendar: true,
    notes: true,
    reading: true,
    library: true,
    gaming: true,
  },
  showSidebarFocus: false,
  columnLayout: [
    ["news", "tasks", "habits"],
    ["pomodoro", "music", "stats"],
    ["calendar", "reminders", "notes", "weather", "ideas", "gaming"],
  ],
  enabledWidgets: {
    reminders: true,
    tasks: true,
    pomodoro: true,
    calendar: true,
    habits: true,
    music: true,
    notes: true,
    stats: false,
    news: true,
    ideas: false,
    weather: false,
    gaming: false,
  },
  background: "linen",
  density: "comfortable",
  clock24: true,
  showSeconds: false,
  showClock: true,
  showBookmarks: true,
  showSummary: true,
  remindersEnabled: true,
  openInNewTab: true,
  workMinutes: 25,
  shortBreak: 5,
  longBreak: 15,
  dailyGoal: 120,
  spotifyUrl: "",
  spotifyCompact: false,
  spotifyMode: "connect",
  spotifyClientId: "",
  googleClientId: "",
  gamingPlatform: "all",
  gamingShowDemos: true,
  gamingHideClaimed: true,
  gamingHiddenIds: [],
  gamingRecentIds: [],
  weatherLocation: null,
};
export const defaultData: DashboardData = {
  games: [],
  tasks: [],
  habits: [],
  notes: [],
  ideas: [],
  timeBlocks: [],
  reminders: [],
  focusSessions: [],
  bookmarks: [
    {
      id: "gmail",
      title: "Gmail",
      url: "https://mail.google.com/",
      group: "Personal",
      color: "#c86854",
    },
    {
      id: "calendar",
      title: "Calendar",
      url: "https://calendar.google.com/",
      group: "Personal",
      color: "#5c86b3",
    },
    {
      id: "notion",
      title: "Notion",
      url: "https://www.notion.so/",
      group: "Trabajo",
      color: "#565b58",
    },
    {
      id: "spotify",
      title: "Spotify",
      url: "https://open.spotify.com/",
      group: "Personal",
      color: "#39745b",
    },
    {
      id: "github",
      title: "GitHub",
      url: "https://github.com/",
      group: "Trabajo",
      color: "#7b6d9e",
    },
    {
      id: "youtube",
      title: "YouTube",
      url: "https://www.youtube.com/",
      group: "Personal",
      color: "#bd625b",
    },
  ],
  settings: defaultSettings,
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const textFields = (
  value: unknown,
  fields: string[],
): value is Record<string, string> =>
  isRecord(value) && fields.every((key) => typeof value[key] === "string");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: unknown): value is string =>
  typeof value === "string" &&
  datePattern.test(value) &&
  localDate(new Date(`${value}T12:00:00`)) === value;
const finite = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const validAdvance = (value: unknown) =>
  value === undefined ||
  (typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 10080);
const validators: Record<string, (v: unknown) => boolean> = {
  reminders: validReminder,
  games: validSavedGame,
  tasks: (v) =>
    textFields(v, ["id", "title"]) &&
    ["low", "medium", "high"].includes(String(v.priority)) &&
    typeof v.completed === "boolean" &&
    finite(v.pomodoros) &&
    (v.dueDate === undefined || validDate(v.dueDate)) &&
    (v.dueTime === undefined ||
      (typeof v.dueTime === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(v.dueTime))) &&
    validAdvance(v.reminderMinutes) &&
    (v.reminderMinutes === undefined ||
      (validDate(v.dueDate) &&
        typeof v.dueTime === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(v.dueTime))) &&
    Array.isArray(v.subtasks) &&
    v.subtasks.every(
      (s) => textFields(s, ["id", "title"]) && typeof s.completed === "boolean",
    ),
  habits: (v) =>
    textFields(v, ["id", "name"]) &&
    finite(v.streak) &&
    Array.isArray(v.history) &&
    v.history.every(validDate),
  notes: (v) => textFields(v, ["id", "title", "content", "color"]),
  ideas: (v) => textFields(v, ["id", "content", "createdAt"]),
  timeBlocks: (v) =>
    textFields(v, ["id", "title", "date", "startTime", "endTime", "color"]) &&
    validDate(v.date) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(v.startTime) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(v.endTime) &&
    v.startTime < v.endTime &&
    validAdvance(v.reminderMinutes),
  focusSessions: (v) =>
    textFields(v, ["date"]) && validDate(v.date) && finite(v.minutes),
  bookmarks: (v) =>
    textFields(v, ["id", "title", "url", "group", "color"]) &&
    !!safeUrl(v.url) &&
    /^#[\da-f]{6}$/i.test(v.color),
};
export function normalizeSettings(input: unknown): DashboardSettings {
  const result = structuredClone(defaultSettings);
  if (!isRecord(input)) return result;
  result.welcomeCompleted = typeof input.welcomeCompleted === "boolean"
    ? input.welcomeCompleted
    : typeof input.userName === "string" && !!input.userName.trim();
  if (isRecord(input.mangaCoverOverrides)) {
    for (const [key, value] of Object.entries(input.mangaCoverOverrides).slice(0, 10000))
      if (/^[a-zA-Z0-9_-]{1,100}$/.test(key) && (value === "official" || value === "lastPage"))
        result.mangaCoverOverrides[key] = value;
  }
  if (isRecord(input.readerPreferences)) {
    for (const [key, value] of Object.entries(input.readerPreferences)) {
      if (/^zenty-manga-[a-z-]{1,40}$/.test(key) &&
          ((typeof value === "string" && value.length < 100) ||
           typeof value === "boolean" ||
           (typeof value === "number" && Number.isFinite(value))))
        result.readerPreferences[key] = value;
    }
  }
  if (
    ["stone", "sand", "blue", "lavender", "rose", "sage", "graphite"].includes(
      String(input.surfaceTone),
    )
  )
    result.surfaceTone = input.surfaceTone as DashboardSettings["surfaceTone"];
  for (const key of [
    "userName",
    "dailyIntention",
    "intentionDate",
    "newsTags",
    "spotifyUrl",
    "spotifyClientId",
    "googleClientId",
  ] as const)
    if (typeof input[key] === "string") result[key] = input[key];
  if (Array.isArray(input.newsTags))
    result.newsTags = input.newsTags
      .filter((t) => typeof t === "string")
      .join(", ");
  if (["dark", "light", "system"].includes(String(input.theme)))
    result.theme = input.theme as DashboardSettings["theme"];
  if (
    typeof input.accentColor === "string" &&
    /^#[\da-f]{6}$/i.test(input.accentColor)
  )
    result.accentColor = input.accentColor;
  if (
    ["google", "duckduckgo", "bing", "brave"].includes(
      String(input.searchEngine),
    )
  )
    result.searchEngine = String(input.searchEngine);
  if (["linen", "aurora", "plain"].includes(String(input.background)))
    result.background = input.background as DashboardSettings["background"];
  if (input.density === "compact") result.density = "compact";
  for (const key of ["gamingHiddenIds", "gamingRecentIds"] as const)
    if (Array.isArray(input[key]))
      result[key] = [
        ...new Set(
          input[key].filter(
            (v): v is string => typeof v === "string" && v.length <= 300,
          ),
        ),
      ].slice(0, key === "gamingHiddenIds" ? 5000 : 30);
  if (
    [
      "all",
      "PC",
      "Steam",
      "Epic Games Store",
      "GOG",
      "PlayStation",
      "Xbox",
      "Nintendo",
      "Android",
      "iOS",
    ].includes(String(input.gamingPlatform))
  )
    result.gamingPlatform = String(input.gamingPlatform);
  for (const key of [
    "clock24",
    "showSeconds",
    "showClock",
    "showBookmarks",
    "showSummary",
    "remindersEnabled",
    "openInNewTab",
    "gamingShowDemos",
    "gamingHideClaimed",
    "spotifyCompact",
    "showSidebarFocus",
  ] as const)
    if (typeof input[key] === "boolean") result[key] = input[key];
  for (const key of [
    "workMinutes",
    "shortBreak",
    "longBreak",
    "dailyGoal",
  ] as const)
    if (typeof input[key] === "number")
      result[key] = Math.max(
        1,
        Math.min(
          key === "dailyGoal" ? 720 : 180,
          Math.round(input[key] as number) || defaultSettings[key],
        ),
      );
  if (isRecord(input.enabledNavSections))
    for (const key of Object.keys(sectionLabels) as SectionId[])
      if (typeof input.enabledNavSections[key] === "boolean")
        result.enabledNavSections[key] = input.enabledNavSections[key];
  if (Array.isArray(input.navOrder)) {
    const seen = new Set<string>();
    const valid: SectionId[] = [];
    for (const item of input.navOrder) {
      if (
        typeof item === "string" &&
        Object.hasOwn(sectionLabels, item) &&
        !seen.has(item)
      ) {
        seen.add(item);
        valid.push(item as SectionId);
      }
    }
    for (const key of Object.keys(sectionLabels) as SectionId[]) {
      if (!seen.has(key)) {
        seen.add(key);
        valid.push(key);
      }
    }
    result.navOrder = valid;
  }
  if (isRecord(input.enabledWidgets))
    for (const key of Object.keys(widgetLabels) as WidgetId[])
      if (typeof input.enabledWidgets[key] === "boolean")
        result.enabledWidgets[key] = input.enabledWidgets[key];
  if (
    Array.isArray(input.columnLayout) &&
    input.columnLayout.length === 3 &&
    input.columnLayout.every(Array.isArray)
  ) {
    const seen = new Set<string>();
    result.columnLayout = input.columnLayout.map((col) =>
      col.filter((id: unknown): id is WidgetId => {
        if (
          typeof id !== "string" ||
          !Object.hasOwn(widgetLabels, id) ||
          seen.has(id)
        )
          return false;
        seen.add(id);
        return true;
      }),
    );
    for (const id of Object.keys(widgetLabels) as WidgetId[])
      if (!seen.has(id)) result.columnLayout[2].push(id);
  }
  if (input.spotifyMode === "embed") result.spotifyMode = "embed";
  const location = input.weatherLocation;
  if (input.homeLayout === "scenic") result.homeLayout = "scenic";
  if (
    [
      "all",
      "tech",
      "gaming",
      "anime",
      "science",
      "culture",
      "general",
    ].includes(String(input.newsWidgetCategory))
  )
    result.newsWidgetCategory =
      input.newsWidgetCategory as DashboardSettings["newsWidgetCategory"];
  // Introduce the news widget once; subsequent user choices remain unchanged.
  if (input.newsWidgetVersion !== 1) {
    const previouslyEnabled =
      isRecord(input.enabledWidgets) && input.enabledWidgets.news === true;
    result.enabledWidgets.news = true;
    if (!previouslyEnabled) {
      result.columnLayout = result.columnLayout.map((column) =>
        column.filter((id) => id !== "news"),
      );
      result.columnLayout[0].unshift("news");
    }
  }
  if (
    textFields(location, ["name"]) &&
    typeof location.latitude === "number" &&
    typeof location.longitude === "number" &&
    Math.abs(location.latitude) <= 90 &&
    Math.abs(location.longitude) <= 180
  )
    result.weatherLocation =
      location as unknown as DashboardSettings["weatherLocation"];
  return result;
}
/** Validate the complete payload before applying any part of an import. Supports legacy exports. */
export function parseBackup(raw: string): DashboardData {
  if (raw.length > 5_000_000)
    throw new Error("El respaldo supera el máximo de 5 MB.");
  const input: unknown = JSON.parse(raw);
  if (
    !isRecord(input) ||
    !isRecord(input.settings) ||
    !Array.isArray(input.tasks) ||
    !Array.isArray(input.habits) ||
    (input.version !== undefined && input.version !== 2)
  )
    throw new Error("Formato de respaldo incompatible.");
  const result = structuredClone(defaultData);
  for (const [key, validate] of Object.entries(validators)) {
    const items = input[key];
    if (items === undefined) continue;
    if (!Array.isArray(items) || !items.every(validate))
      throw new Error(`Datos inválidos en ${key}.`);
    const ids = items.map((item) =>
      key === "focusSessions" ? item.date : item.id,
    );
    if (new Set(ids).size !== ids.length)
      throw new Error(`Hay registros duplicados en ${key}.`);
    Object.assign(result, { [key]: items });
  }
  result.settings = normalizeSettings(input.settings);
  return result;
}
export function loadData(storage: Pick<Storage, "getItem">): {
  data: DashboardData;
  warning: string;
} {
  try {
    const current = storage.getItem("mia_dashboard_v2");
    if (current) return { data: parseBackup(current), warning: "" };
    const legacy: Record<string, unknown> = {};
    for (const key of Object.keys(validators)) {
      const saved = storage.getItem(
        `dash_${key === "timeBlocks" ? "timeblocks" : key === "focusSessions" ? "focussessions" : key}`,
      );
      if (saved) legacy[key] = JSON.parse(saved);
    }
    const settings = storage.getItem("dash_settings");
    if (settings) legacy.settings = JSON.parse(settings);
    return Object.keys(legacy).length
      ? {
          data: parseBackup(JSON.stringify({ ...defaultData, ...legacy })),
          warning: "",
        }
      : { data: structuredClone(defaultData), warning: "" };
  } catch {
    return {
      data: structuredClone(defaultData),
      warning:
        "No se pudieron leer los datos guardados. Los datos originales siguen en el navegador. Exporta o recupera un respaldo antes de guardar nuevos cambios.",
    };
  }
}
