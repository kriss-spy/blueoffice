import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import { App } from "./App";
import "./style.css";
const SceneLab = lazy(() =>
  import("./scene/SceneLab").then((module) => ({ default: module.SceneLab })),
);
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).get("scene") === "fixture" ? (
    <Suspense fallback={<p>Opening the scene…</p>}>
      <SceneLab />
    </Suspense>
  ) : (
    <App />
  ),
);
