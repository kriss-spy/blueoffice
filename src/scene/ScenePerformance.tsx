import { useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  parseSceneQuality,
  qualityStorageKey,
  sceneQualityPolicy,
  type SceneQuality,
} from "../../shared/scene-quality";

export function useSceneQuality() {
  const [quality, setQuality] = useState<SceneQuality>(() => {
    try {
      return parseSceneQuality(localStorage.getItem(qualityStorageKey));
    } catch {
      return "ordinary";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(qualityStorageKey, quality);
    } catch {
      /* Private storage may be unavailable. */
    }
  }, [quality]);
  return { quality, setQuality, policy: sceneQualityPolicy(quality) };
}
interface FrameSample {
  at: number;
  deltaMs: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}
export interface ScenePerformanceCapture {
  quality: SceneQuality;
  hidden: boolean;
  frames: FrameSample[];
  renderer: { vendor: string; renderer: string; version: string };
  dpr: number;
  gpuSamples: { at: number; elapsedMs: number }[];
  gpuTimerAvailable: boolean;
}
declare global {
  interface Window {
    __blueofficePerformance?: ScenePerformanceCapture;
  }
}
/** Pauses GPU and per-frame decorative work while hidden; telemetry remains connected. */
export function ScenePerformance({ quality }: { quality: SceneQuality }) {
  const { gl, setFrameloop, invalidate } = useThree();
  const capture = new URLSearchParams(location.search).has("performance");
  useEffect(() => {
    const update = () => {
      const hidden = document.visibilityState === "hidden";
      setFrameloop(hidden ? "never" : "always");
      if (!hidden) invalidate();
      if (window.__blueofficePerformance)
        window.__blueofficePerformance.hidden = hidden;
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [setFrameloop, invalidate]);
  useEffect(() => {
    if (!capture) return;
    const context = gl.getContext();
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    window.__blueofficePerformance = {
      quality,
      hidden: document.hidden,
      frames: [],
      dpr: gl.getPixelRatio(),
      gpuSamples: [],
      gpuTimerAvailable: false,
      renderer: {
        vendor: String(
          context.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR),
        ),
        renderer: String(
          context.getParameter(
            debug?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER,
          ),
        ),
        version: String(context.getParameter(context.VERSION)),
      },
    };
    return () => {
      delete window.__blueofficePerformance;
    };
  }, [capture, gl, quality]);
  useEffect(() => {
    if (!capture || !new URLSearchParams(location.search).has("gpu-timing"))
      return;
    const context = gl.getContext();
    if (!(context instanceof WebGL2RenderingContext)) return;
    const extension = context.getExtension(
      "EXT_disjoint_timer_query_webgl2",
    ) as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    if (!extension) return;
    if (window.__blueofficePerformance)
      window.__blueofficePerformance.gpuTimerAvailable = true;
    const pending: { query: WebGLQuery; at: number }[] = [];
    const render = gl.render;
    let frames = 0;
    gl.render = (...args) => {
      for (let i = pending.length - 1; i >= 0; i--) {
        const entry = pending[i];
        if (
          !context.getQueryParameter(
            entry.query,
            context.QUERY_RESULT_AVAILABLE,
          )
        )
          continue;
        if (!context.getParameter(extension.GPU_DISJOINT_EXT)) {
          window.__blueofficePerformance?.gpuSamples.push({
            at: entry.at,
            elapsedMs:
              Number(
                context.getQueryParameter(entry.query, context.QUERY_RESULT),
              ) / 1e6,
          });
        }
        context.deleteQuery(entry.query);
        pending.splice(i, 1);
      }
      // Sample one render in 30, keeping the diagnostic overhead bounded.
      const query =
        frames++ % 30 === 0 && pending.length < 4
          ? context.createQuery()
          : null;
      if (query) context.beginQuery(extension.TIME_ELAPSED_EXT, query);
      try {
        render.apply(gl, args);
      } finally {
        if (query) {
          context.endQuery(extension.TIME_ELAPSED_EXT);
          pending.push({ query, at: performance.now() });
        }
      }
    };
    return () => {
      gl.render = render;
      for (const entry of pending) context.deleteQuery(entry.query);
    };
  }, [capture, gl, quality]);
  useFrame((_, delta) => {
    const measured = window.__blueofficePerformance;
    if (!capture || !measured) return;
    // One minute of 120-Hz frames, bounded even if a benchmark tab is left open.
    if (measured.frames.length >= 7200) measured.frames.splice(0, 1200);
    measured.dpr = gl.getPixelRatio();
    measured.frames.push({
      at: performance.now(),
      deltaMs: delta * 1000,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
  });
  return null;
}
