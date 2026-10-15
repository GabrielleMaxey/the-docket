import { initializeSiteContext } from "./services/jiraClient.js";
import { getSiteContext, subscribeSiteContext, getSiteRecoveryNotice, isSiteSwitching } from "./utils/siteContextStore.js";
import React from "react";
import { createHashRouter, Outlet, NavLink } from "react-router-dom";
import { FiSettings } from "react-icons/fi";
import Errors from "./Pages/Errors.jsx";
import "semantic-ui-css/semantic.min.css";
import "./AppRouter.css";
import BackgroundJobIndicator from "./Components/BackgroundJobIndicator.jsx";
import JiraInstanceSwitcher from "./Components/JiraInstanceSwitcher.jsx";
import { TodosProvider } from "./context/TodosContext.jsx";
import { EpicFiltersProvider } from "./context/EpicFiltersContext.jsx";

const WorkWeekTasks = React.lazy(() => import("./Pages/WorkWeekTasks.jsx"));
const CombinedOpenWork = React.lazy(() => import("./Pages/CombinedOpenWork.jsx"));
const Dashboard = React.lazy(() => import("./Pages/Dashboard.jsx"));
const Chat = React.lazy(() => import("./Pages/Chat.jsx"));
const ReportArchive = React.lazy(() => import("./Pages/ReportArchive.jsx"));
const ProjectManagers = React.lazy(() => import("./Pages/ProjectManagers.jsx"));
const Settings = React.lazy(() => import("./Pages/Settings.jsx"));

const NAV_LINKS = [
  { to: "/work-week", label: "Task Management" },
  { to: "/combined-open-work", label: "Combined Open Work" },
  { to: "/dashboard", label: "Metrics" },
  { to: "/project-managers", label: "Project Managers" },
  { to: "/reports", label: "Past Reports" },
  { to: "/chat", label: "Chat" },
  { to: "/settings", label: "Settings", icon: <FiSettings /> },
];

const PageFallback = () => (
  <main className="app-page-loading" aria-live="polite">
    Loading...
  </main>
);

const AppLayout = () => {
  const context = React.useSyncExternalStore(subscribeSiteContext, getSiteContext);
  const switching = React.useSyncExternalStore(subscribeSiteContext, isSiteSwitching);
  const recoveryNotice = React.useSyncExternalStore(subscribeSiteContext, getSiteRecoveryNotice);
  const [error, setError] = React.useState("");
  React.useEffect(() => { initializeSiteContext().catch((error) => setError(error.message)); }, []);
  if (!context) return error ? <main role="alert">{error}</main> : <PageFallback />;
  return (
  <>
    <nav className="app-nav">
      <NavLink to="/" className="app-nav-logo">
        <img src="/the-docket-favicon.svg" alt="" aria-hidden="true" className="app-nav-logo-icon" />
        The Docket
      </NavLink>
      <BackgroundJobIndicator />
      <JiraInstanceSwitcher />
      <ul className="app-nav-links">
        {NAV_LINKS.map(({ to, label, icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) => isActive ? "app-nav-link is-active" : "app-nav-link"}
              aria-label={label}
              title={label}
            >
              {icon ? <span className="app-nav-icon" aria-hidden="true">{icon}</span> : label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
    {recoveryNotice && <p role="status">{recoveryNotice}</p>}
    <div inert={switching ? "" : undefined} aria-busy={switching}>
      <EpicFiltersProvider key={context.generation}>
        <React.Suspense fallback={<PageFallback />}>
          <Outlet />
        </React.Suspense>
      </EpicFiltersProvider>
    </div>
  </>
  );
};

const router = createHashRouter([
  {
    element: <TodosProvider><AppLayout /></TodosProvider>,
    errorElement: <Errors />,
    children: [
      { path: "/", element: <WorkWeekTasks /> },
      { path: "/work-week", element: <WorkWeekTasks /> },
      { path: "/combined-open-work", element: <CombinedOpenWork /> },
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/project-managers", element: <ProjectManagers /> },
      { path: "/reports", element: <ReportArchive /> },
      { path: "/chat", element: <Chat /> },
      { path: "/settings", element: <Settings /> },
    ],
  },
]);

export default router;
