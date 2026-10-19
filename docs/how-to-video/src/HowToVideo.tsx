import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Audio } from "@remotion/media";
import { staticFile, useVideoConfig } from "remotion";
import { TimeScaleContext } from "./ui";
import voiceoverDurations from "./voiceoverDurations.json";
import { IntroScene, PersonasScene, WhyScene } from "./scenes/Opening";
import { CredentialsScene, EnvOptionsScene, InstallScene, OpenAppScene } from "./scenes/Setup";
import { FinishSetupScene, NavigateScene, SettingsScene } from "./scenes/Configure";
import { CreateIssueScene, PlanAndReportScene, TaskManagementScene } from "./scenes/DailyWork";
import { ChatScene, MetricsScene, PastReportsScene, ProjectManagersScene } from "./scenes/Insights";
import { OutroScene, RecapScene } from "./scenes/Closing";
import { DataSecurityScene } from "./scenes/Security";
import { AsksScene, CombinedWorkScene, WorkbookScene } from "./scenes/MoreWork";

// Authored scene lengths in seconds. Each scene is stretched to fit its
// voiceover (see sceneSeconds); the main duration is derived from that.
export const SCENES = {
  intro: 6,
  why: 11,
  personas: 14,
  install: 17,
  credentials: 20,
  envOptions: 28,
  openApp: 13,
  settings: 18,
  finishSetup: 46,
  dataSecurity: 30,
  navigate: 15,
  taskManagement: 23,
  combinedWork: 28,
  createIssue: 17,
  planAndReport: 16,
  workbook: 26,
  metrics: 19,
  projectManagers: 16,
  asks: 28,
  chat: 14,
  pastReports: 9,
  recap: 14,
  outro: 7,
};

export type SceneKey = keyof typeof SCENES;

export const TRANSITION_SECONDS = 0.6;
// Narration starts after the incoming transition and leaves a beat at the end.
const VOICE_LEAD = 0.6;
const VOICE_TAIL = 0.9;

const audioSeconds = (key: SceneKey): number | undefined =>
  (voiceoverDurations as Partial<Record<SceneKey, number>>)[key];

export const sceneSeconds = (key: SceneKey) => {
  const audio = audioSeconds(key);
  return audio === undefined ? SCENES[key] : Math.max(SCENES[key], VOICE_LEAD + audio + VOICE_TAIL);
};

export const sceneFrames = (key: SceneKey, fps: number) => Math.ceil(sceneSeconds(key) * fps);

export const totalSeconds = () =>
  (Object.keys(SCENES) as SceneKey[]).reduce((a, k) => a + sceneSeconds(k), 0) -
  TRANSITION_SECONDS * (Object.keys(SCENES).length - 1);

// Stretches a scene's animations to its voiced length and plays its narration.
export const Voiced: React.FC<{ scene: SceneKey; children: React.ReactNode }> = ({ scene, children }) => {
  const { fps } = useVideoConfig();
  const scale = sceneFrames(scene, fps) / (SCENES[scene] * fps);
  return (
    <TimeScaleContext.Provider value={scale}>
      {children}
      {audioSeconds(scene) !== undefined ? (
        <Audio src={staticFile(`voiceover/${scene}.mp3`)} from={Math.round(VOICE_LEAD * fps)} premountFor={fps} />
      ) : null}
    </TimeScaleContext.Provider>
  );
};

export const HowToVideo: React.FC = () => {
  const { fps } = useVideoConfig();
  const tr = linearTiming({ durationInFrames: Math.round(TRANSITION_SECONDS * fps) });
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Intro" durationInFrames={sceneFrames("intro", fps)} premountFor={fps}>
        <Voiced scene="intro"><IntroScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Why" durationInFrames={sceneFrames("why", fps)} premountFor={fps}>
        <Voiced scene="why"><WhyScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Personas" durationInFrames={sceneFrames("personas", fps)} premountFor={fps}>
        <Voiced scene="personas"><PersonasScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={tr} />
      <TransitionSeries.Sequence name="Install" durationInFrames={sceneFrames("install", fps)} premountFor={fps}>
        <Voiced scene="install"><InstallScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={tr} />
      <TransitionSeries.Sequence name="Credentials" durationInFrames={sceneFrames("credentials", fps)} premountFor={fps}>
        <Voiced scene="credentials"><CredentialsScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={tr} />
      <TransitionSeries.Sequence name=".env options" durationInFrames={sceneFrames("envOptions", fps)} premountFor={fps}>
        <Voiced scene="envOptions"><EnvOptionsScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={tr} />
      <TransitionSeries.Sequence name="Open app" durationInFrames={sceneFrames("openApp", fps)} premountFor={fps}>
        <Voiced scene="openApp"><OpenAppScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Settings" durationInFrames={sceneFrames("settings", fps)} premountFor={fps}>
        <Voiced scene="settings"><SettingsScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Finish setup" durationInFrames={sceneFrames("finishSetup", fps)} premountFor={fps}>
        <Voiced scene="finishSetup"><FinishSetupScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Data security" durationInFrames={sceneFrames("dataSecurity", fps)} premountFor={fps}>
        <Voiced scene="dataSecurity"><DataSecurityScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Navigate" durationInFrames={sceneFrames("navigate", fps)} premountFor={fps}>
        <Voiced scene="navigate"><NavigateScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Task Management" durationInFrames={sceneFrames("taskManagement", fps)} premountFor={fps}>
        <Voiced scene="taskManagement"><TaskManagementScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Combined Work" durationInFrames={sceneFrames("combinedWork", fps)} premountFor={fps}>
        <Voiced scene="combinedWork"><CombinedWorkScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Create Issue" durationInFrames={sceneFrames("createIssue", fps)} premountFor={fps}>
        <Voiced scene="createIssue"><CreateIssueScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Plan & Report" durationInFrames={sceneFrames("planAndReport", fps)} premountFor={fps}>
        <Voiced scene="planAndReport"><PlanAndReportScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Workbook" durationInFrames={sceneFrames("workbook", fps)} premountFor={fps}>
        <Voiced scene="workbook"><WorkbookScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Metrics" durationInFrames={sceneFrames("metrics", fps)} premountFor={fps}>
        <Voiced scene="metrics"><MetricsScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Project Managers" durationInFrames={sceneFrames("projectManagers", fps)} premountFor={fps}>
        <Voiced scene="projectManagers"><ProjectManagersScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Asks" durationInFrames={sceneFrames("asks", fps)} premountFor={fps}>
        <Voiced scene="asks"><AsksScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Chat" durationInFrames={sceneFrames("chat", fps)} premountFor={fps}>
        <Voiced scene="chat"><ChatScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Past Reports" durationInFrames={sceneFrames("pastReports", fps)} premountFor={fps}>
        <Voiced scene="pastReports"><PastReportsScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={tr} />
      <TransitionSeries.Sequence name="Recap" durationInFrames={sceneFrames("recap", fps)} premountFor={fps}>
        <Voiced scene="recap"><RecapScene /></Voiced>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={tr} />
      <TransitionSeries.Sequence name="Outro" durationInFrames={sceneFrames("outro", fps)} premountFor={fps}>
        <Voiced scene="outro"><OutroScene /></Voiced>
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
