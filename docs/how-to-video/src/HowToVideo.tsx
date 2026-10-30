import React from "react";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Audio } from "@remotion/media";
import { interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { TimeScaleContext } from "./ui";
import { SCENE_COMPONENTS } from "./sceneMap";
import {
  clipSeconds,
  hasAudio,
  pausesFor,
  SYNCED,
  SCENE_LIST,
  SCENES,
  sceneFrames,
  type SceneKey,
  TRANSITION_SECONDS,
  VOICE_LEAD,
} from "./timing";

// Plays a scene's narration, cut at each configured pause (see PAUSES in
// timing.ts) with a silent gap inserted, and short fades at every cut.
const Narration: React.FC<{ scene: SceneKey }> = ({ scene }) => {
  const { fps } = useVideoConfig();
  const clip = clipSeconds(scene) ?? 0;
  const pauses = pausesFor(scene).filter((p) => p.at > 0 && p.at < clip);
  const cuts = [0, ...pauses.map((p) => p.at), clip];
  let shift = 0; // seconds of pause added before this segment
  return (
    <>
      {cuts.slice(0, -1).map((start, i) => {
        const end = cuts[i + 1];
        const segFrames = Math.max(1, Math.round((end - start) * fps));
        const from = Math.round((VOICE_LEAD + start + shift) * fps);
        shift += pauses[i]?.seconds ?? 0;
        return (
          <Sequence key={i} from={from} durationInFrames={segFrames} premountFor={50}>
            <Audio
              src={staticFile(`voiceover/${scene}.mp3`)}
              trimBefore={Math.round(start * fps)}
              // Short fades hide any click or breath at the clip edges and cuts.
              volume={(f) =>
                interpolate(f, [0, 5, Math.max(6, segFrames - 9), Math.max(7, segFrames)], [0, 1, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })
              }
            />
          </Sequence>
        );
      })}
    </>
  );
};

// Stretches a scene's animations to its voiced length and plays its narration.
export const Voiced: React.FC<{ scene: SceneKey; children: React.ReactNode }> = ({ scene, children }) => {
  const { fps } = useVideoConfig();
  const scale = SYNCED.has(scene) ? 1 : sceneFrames(scene, fps) / (SCENES[scene] * fps);
  return (
    <TimeScaleContext.Provider value={scale}>
      {children}
      {hasAudio(scene) ? <Narration scene={scene} /> : null}
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
