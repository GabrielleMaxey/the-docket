import { Composition, Folder } from "remotion";
import { HowToVideo, SCENES, totalSeconds } from "./HowToVideo";
// Scene compositions below show the authored (unvoiced) timing.
import { FPS, HEIGHT, WIDTH } from "./theme";
import { IntroScene, PersonasScene, WhyScene } from "./scenes/Opening";
import { CredentialsScene, EnvOptionsScene, InstallScene, OpenAppScene } from "./scenes/Setup";
import { FinishSetupScene, NavigateScene, SettingsScene } from "./scenes/Configure";
import { CreateIssueScene, PlanAndReportScene, TaskManagementScene } from "./scenes/DailyWork";
import { ChatScene, MetricsScene, PastReportsScene, ProjectManagersScene } from "./scenes/Insights";
import { OutroScene, RecapScene } from "./scenes/Closing";
import { DataSecurityScene } from "./scenes/Security";
import { AsksScene, CombinedWorkScene, WorkbookScene } from "./scenes/MoreWork";

const video = { fps: FPS, width: WIDTH, height: HEIGHT };

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TheDocketHowTo"
        component={HowToVideo}
        durationInFrames={Math.round(totalSeconds() * FPS)}
        {...video}
      />
      <Folder name="Scenes">
        <Composition id="Intro" component={IntroScene} durationInFrames={SCENES.intro * FPS} {...video} />
        <Composition id="Why" component={WhyScene} durationInFrames={SCENES.why * FPS} {...video} />
        <Composition id="Personas" component={PersonasScene} durationInFrames={SCENES.personas * FPS} {...video} />
        <Composition id="Install" component={InstallScene} durationInFrames={SCENES.install * FPS} {...video} />
        <Composition id="Credentials" component={CredentialsScene} durationInFrames={SCENES.credentials * FPS} {...video} />
        <Composition id="EnvOptions" component={EnvOptionsScene} durationInFrames={SCENES.envOptions * FPS} {...video} />
        <Composition id="OpenApp" component={OpenAppScene} durationInFrames={SCENES.openApp * FPS} {...video} />
        <Composition id="Settings" component={SettingsScene} durationInFrames={SCENES.settings * FPS} {...video} />
        <Composition id="FinishSetup" component={FinishSetupScene} durationInFrames={SCENES.finishSetup * FPS} {...video} />
        <Composition id="DataSecurity" component={DataSecurityScene} durationInFrames={SCENES.dataSecurity * FPS} {...video} />
        <Composition id="Navigate" component={NavigateScene} durationInFrames={SCENES.navigate * FPS} {...video} />
        <Composition id="TaskManagement" component={TaskManagementScene} durationInFrames={SCENES.taskManagement * FPS} {...video} />
        <Composition id="CombinedWork" component={CombinedWorkScene} durationInFrames={SCENES.combinedWork * FPS} {...video} />
        <Composition id="CreateIssue" component={CreateIssueScene} durationInFrames={SCENES.createIssue * FPS} {...video} />
        <Composition id="PlanAndReport" component={PlanAndReportScene} durationInFrames={SCENES.planAndReport * FPS} {...video} />
        <Composition id="Workbook" component={WorkbookScene} durationInFrames={SCENES.workbook * FPS} {...video} />
        <Composition id="Metrics" component={MetricsScene} durationInFrames={SCENES.metrics * FPS} {...video} />
        <Composition id="ProjectManagers" component={ProjectManagersScene} durationInFrames={SCENES.projectManagers * FPS} {...video} />
        <Composition id="Asks" component={AsksScene} durationInFrames={SCENES.asks * FPS} {...video} />
        <Composition id="Chat" component={ChatScene} durationInFrames={SCENES.chat * FPS} {...video} />
        <Composition id="PastReports" component={PastReportsScene} durationInFrames={SCENES.pastReports * FPS} {...video} />
        <Composition id="Recap" component={RecapScene} durationInFrames={SCENES.recap * FPS} {...video} />
        <Composition id="Outro" component={OutroScene} durationInFrames={SCENES.outro * FPS} {...video} />
      </Folder>
    </>
  );
};
