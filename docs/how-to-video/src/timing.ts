import voiceoverDurations from "./voiceoverDurations.json";

// Scene order, authored length (seconds) and chapter title. Each scene is
// stretched to fit its voiceover; the main duration and the chapter times
// shown on screen and in CHAPTERS.md are all derived from these numbers.
export const SCENE_LIST = [
  { key: "intro", seconds: 8, chapter: "Welcome" },
  { key: "contents", seconds: 10, chapter: "Chapters (this list)" },
  { key: "overview", seconds: 26, chapter: "What The Docket does" },
  { key: "multiSpace", seconds: 24, chapter: "Many Jira spaces, one workspace" },
  { key: "install", seconds: 25, chapter: "Install the app" },
  { key: "credentials", seconds: 33, chapter: "Your .env file and Jira token" },
  { key: "envOptions", seconds: 30, chapter: "Optional .env settings" },
  { key: "openApp", seconds: 16, chapter: "Open the app" },
  { key: "settings", seconds: 27, chapter: "Settings: Jira sites and presets" },
  { key: "navigate", seconds: 19, chapter: "Tour of the tabs" },
  { key: "taskManagement", seconds: 30, chapter: "Task Management" },
  { key: "combinedWork", seconds: 35, chapter: "Combined Open Work" },
  { key: "createIssue", seconds: 28, chapter: "Create Issue and duplicate check" },
  { key: "weekPlan", seconds: 28, chapter: "Plan your week" },
  { key: "reports", seconds: 32, chapter: "Reports" },
  { key: "pmAsks", seconds: 22, chapter: "Project Managers and Asks" },
  { key: "chat", seconds: 15, chapter: "Chat" },
  { key: "dataSecurity", seconds: 46, chapter: "Data security" },
  { key: "recap", seconds: 21, chapter: "Where to start" },
  { key: "outro", seconds: 8, chapter: "Wrap-up" },
] as const;

export type SceneKey = (typeof SCENE_LIST)[number]["key"];

export const SCENES = Object.fromEntries(SCENE_LIST.map((s) => [s.key, s.seconds])) as Record<SceneKey, number>;

export const TRANSITION_SECONDS = 0.6;
// Narration starts after the incoming transition and leaves a beat at the end.
export const VOICE_LEAD = 0.6;
export const VOICE_TAIL = 0.9;

const audioSeconds = (key: SceneKey): number | undefined =>
  (voiceoverDurations as Partial<Record<SceneKey, number>>)[key];

export const audioDuration = audioSeconds;
export const hasAudio = (key: SceneKey) => audioSeconds(key) !== undefined;

export const sceneSeconds = (key: SceneKey) => {
  const audio = audioSeconds(key);
  return audio === undefined ? SCENES[key] : Math.max(SCENES[key], VOICE_LEAD + audio + VOICE_TAIL);
};

export const sceneFrames = (key: SceneKey, fps: number) => Math.ceil(sceneSeconds(key) * fps);

export const totalSeconds = () =>
  SCENE_LIST.reduce((a, s) => a + sceneSeconds(s.key), 0) - TRANSITION_SECONDS * (SCENE_LIST.length - 1);

// Start time of every chapter in the final video (seconds), accounting for
// the overlap of each transition and rounding exactly like the frame counts.
export const chapterStarts = (fps = 30) => {
  let frames = 0;
  const tr = Math.round(TRANSITION_SECONDS * fps);
  return SCENE_LIST.map((s, i) => {
    const start = i === 0 ? 0 : frames;
    frames += sceneFrames(s.key, fps) - (i < SCENE_LIST.length - 1 ? tr : 0);
    return { key: s.key, title: s.chapter, seconds: start / fps };
  });
};

export const formatTime = (seconds: number) => {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
