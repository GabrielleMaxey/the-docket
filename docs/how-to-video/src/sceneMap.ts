import type React from "react";
import type { SceneKey } from "./timing";
import { IntroScene } from "./scenes/Opening";
import { ContentsScene, MultiSpaceScene, OverviewScene } from "./scenes/Overview";
import { CredentialsScene, EnvOptionsScene, InstallScene, OpenAppScene } from "./scenes/Setup";
import { NavigateScene, SettingsScene } from "./scenes/Configure";
import { CreateIssueScene, TaskManagementScene } from "./scenes/DailyWork";
import { ReportsScene, WeekPlanScene } from "./scenes/Reports";
import { ChatScene, ProjectManagersAsksScene } from "./scenes/Insights";
import { OutroScene, RecapScene } from "./scenes/Closing";
import { DataSecurityScene } from "./scenes/Security";
import { CombinedWorkScene } from "./scenes/MoreWork";

export const SCENE_COMPONENTS: Record<SceneKey, React.FC> = {
  intro: IntroScene,
  contents: ContentsScene,
  overview: OverviewScene,
  multiSpace: MultiSpaceScene,
  install: InstallScene,
  credentials: CredentialsScene,
  envOptions: EnvOptionsScene,
  openApp: OpenAppScene,
  settings: SettingsScene,
  navigate: NavigateScene,
  taskManagement: TaskManagementScene,
  combinedWork: CombinedWorkScene,
  createIssue: CreateIssueScene,
  weekPlan: WeekPlanScene,
  reports: ReportsScene,
  pmAsks: ProjectManagersAsksScene,
  chat: ChatScene,
  dataSecurity: DataSecurityScene,
  recap: RecapScene,
  outro: OutroScene,
};
