import React from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";
import NavBar from "./Components/NavBar/navBarIndex";
import Errors from "./Pages/Errors.jsx";
import Home from "./Pages/Home.jsx";
import WorkWeekTasks from "./Pages/WorkWeekTasks.jsx";

const AppLayout = () => (
  <>
    <NavBar />
    <Outlet />
  </>
);

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <Errors />,
    children: [
      {
        path: "/",
        element: <WorkWeekTasks />,
      },
      {
        path: "/work-week",
        element: <WorkWeekTasks />,
      },
      {
        path: "/home",
        element: <Home />,
      },
    ],
  },
]);

export default router;
