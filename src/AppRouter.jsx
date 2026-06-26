import React from "react";
import { createHashRouter, Outlet, NavLink } from "react-router-dom";
import Errors from "./Pages/Errors.jsx";
import Home from "./Pages/Home.jsx";
import WorkWeekTasks from "./Pages/WorkWeekTasks.jsx";
import Dashboard from "./Pages/Dashboard.jsx";
import Chat from "./Pages/Chat.jsx";
import ReportArchive from "./Pages/ReportArchive.jsx";
import Settings from "./Pages/Settings.jsx";
import "./appNav.css";

const NAV_LINKS = [
  { to: "/work-week", label: "Work Week" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/reports", label: "Past Reports" },
  { to: "/chat", label: "Chat" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

const AppLayout = () => (
  <>
    <nav className="app-nav">
      <NavLink to="/" className="app-nav-logo">
        <img src="/task-manager-favicon.svg" alt="" aria-hidden="true" className="app-nav-logo-icon" />
        Task Manager
      </NavLink>
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
    <Outlet />
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
      { path: "/reports", element: <ReportArchive /> },
      { path: "/chat", element: <Chat /> },
      { path: "/settings", element: <Settings /> },
      { path: "/home", element: <Home /> },
    ],
  },
]);

export default router;
