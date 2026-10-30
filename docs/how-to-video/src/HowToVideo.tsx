import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Audio } from "@remotion/media";
import { staticFile, useVideoConfig } from "remotion";
import { TimeScaleContext } from "./ui";
import { SCENE_COMPONENTS } from "./sceneMap";
import {
  hasAudio,
  SCENE_LIST,
  SCENES,
  sceneFrames,
  type SceneKey,
  TRANSITION_SECONDS,
  VOICE_LEAD,
} from "./timing";

// Stretches a scene's animations to its voiced length and plays its narration.
export const Voiced: React.FC<{ scene: SceneKey; children: React.ReactNode }> = ({ scene, children }) => {
  const { fps } = useVideoConfig();
  const scale = sceneFrames(scene, fps) / (SCENES[scene] * fps);
  return (
    <TimeScaleContext.Provider value={scale}>
      {children}
      {hasAudio(scene) ? (
        <Audio src={staticFile(`voiceover/${scene}.mp3`)} from={Math.round(VOICE_LEAD * fps)} premountFor={fps} />
      ) : null}
    </TimeScaleContext.Provider>
  );
};

// Slide in for the setup chapters, slide up for the wrap-up, fade elsewhere.
const slideIn = new Set<SceneKey>(["install", "credentials", "envOptions", "openApp"]);

export const HowToVideo: React.FC = () => {
  const { fps } = useVideoConfig();
  const tr = linearTiming({ durationInFrames: Math.round(TRANSITION_SECONDS * fps) });
  const items: React.ReactNode[] = [];
  SCENE_LIST.forEach((s, i) => {
    const Scene = SCENE_COMPONENTS[s.key];
    if (i > 0) {
      const presentation = slideIn.has(s.key)
        ? slide({ direction: "from-right" })
        : s.key === "recap"
          ? slide({ direction: "from-bottom" })
          : fade();
      items.push(<TransitionSeries.Transition key={`t-${s.key}`} presentation={presentation} timing={tr} />);
    }
    items.push(
      <TransitionSeries.Sequence key={s.key} name={s.chapter} durationInFrames={sceneFrames(s.key, fps)} premountFor={fps}>
        <Voiced scene={s.key}>
          <Scene />
        </Voiced>
      </TransitionSeries.Sequence>,
    );
  });
  return <TransitionSeries>{items}</TransitionSeries>;
};
