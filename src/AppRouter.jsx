import React from "react";
import { createHashRouter, Outlet, NavLink } from "react-router-dom";
import Errors from "./Pages/Errors.jsx";
import "semantic-ui-css/semantic.min.css";
import "./AppRouter.css";
import BackgroundJobIndicator from "./Components/BackgroundJobIndicator.jsx";
import { EpicFiltersProvider } from "./context/EpicFiltersContext.jsx";

const WorkWeekTasks = React.lazy(() => import("./Pages/WorkWeekTasks.jsx"));
const Dashboard = React.lazy(() => import("./Pages/Dashboard.jsx"));
const Chat = React.lazy(() => import("./Pages/Chat.jsx"));
const ReportArchive = React.lazy(() => import("./Pages/ReportArchive.jsx"));
const ProjectManagers = React.lazy(() => import("./Pages/ProjectManagers.jsx"));
const Settings = React.lazy(() => import("./Pages/Settings.jsx"));

const NAV_LINKS = [
  { to: "/work-week", label: "Task Management" },
  { to: "/dashboard", label: "Metrics" },
  { to: "/project-managers", label: "Project Managers" },
  { to: "/reports", label: "Past Reports" },
  { to: "/chat", label: "Chat" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

const PageFallback = () => (
  <main className="app-page-loading" aria-live="polite">
    Loading...
  </main>
);

const AppLayout = () => (
  <>
    <nav className="app-nav">
      <NavLink to="/" className="app-nav-logo">
        <img src="/task-manager-favicon.svg" alt="" aria-hidden="true" className="app-nav-logo-icon" />
        The Docket
      </NavLink>
      <BackgroundJobIndicator />
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
    <EpicFiltersProvider>
      <React.Suspense fallback={<PageFallback />}>
        <Outlet />
      </React.Suspense>
    </EpicFiltersProvider>
  </>
);

const router = createHashRouter([
  {
    element: <AppLayout />,
    errorElement: <Errors />,
    children: [
      { path: "/", element: <WorkWeekTasks /> },
      { path: "/work-week", element: <WorkWeekTasks /> },
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/project-managers", element: <ProjectManagers /> },
      { path: "/reports", element: <ReportArchive /> },
      { path: "/chat", element: <Chat /> },
      { path: "/settings", element: <Settings /> },
    ],
  },
]);

export default router;
