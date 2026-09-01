import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import "./index.css";
import router from "./AppRouter.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <RouterProvider router={router} future={{ v7_startTransition: true }} />
);