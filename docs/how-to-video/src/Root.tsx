import { Composition, Folder } from "remotion";
import { HowToVideo } from "./HowToVideo";
import { SCENE_COMPONENTS } from "./sceneMap";
import { SCENE_LIST, totalSeconds } from "./timing";
import { FPS, HEIGHT, WIDTH } from "./theme";

const video = { fps: FPS, width: WIDTH, height: HEIGHT };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="TheDocketHowTo" component={HowToVideo} durationInFrames={Math.round(totalSeconds() * FPS)} {...video} />
    <Folder name="Scenes">
      {SCENE_LIST.map((s) => (
        <Composition
          key={s.key}
          id={s.key[0].toUpperCase() + s.key.slice(1)}
          component={SCENE_COMPONENTS[s.key]}
          durationInFrames={s.seconds * FPS}
          {...video}
        />
      ))}
    </Folder>
  </>
);
