export type SceneQuality = "ordinary" | "reduced";
export const qualityStorageKey = "blueoffice.scene-quality.v1";
export function sceneQualityPolicy(quality: SceneQuality) {
  return quality === "reduced"
    ? { dpr: [1, 1] as [number, number], shadows: false, decorative: false }
    : { dpr: [1, 1.5] as [number, number], shadows: true, decorative: true };
}
export function parseSceneQuality(value: unknown): SceneQuality {
  return value === "reduced" ? "reduced" : "ordinary";
}
/** Nearest-rank percentile; retain raw samples alongside summaries. */
export function percentile(samples: number[], quantile: number) {
  if (!samples.length) return null;
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[
    Math.max(
      0,
      Math.min(sorted.length - 1, Math.ceil(quantile * sorted.length) - 1),
    )
  ];
}

/** Admission uses the whole elapsed window, including a trailing renderer stall. */
export function frameWindowMetrics(
  samples: { at: number; deltaMs: number }[],
  start: number,
  end: number,
) {
  const frames = samples.filter(
    (frame) =>
      Number.isFinite(frame.at) && frame.at >= start && frame.at <= end,
  );
  const elapsedMs = end - start;
  const valid = Number.isFinite(elapsedMs) && elapsedMs > 0;
  const deltaSum = frames.reduce(
    (sum, frame) => sum + Math.max(0, frame.deltaMs),
    0,
  );
  const firstFrameDelayMs = frames.length ? frames[0].at - start : null;
  const lastFrameLagMs = frames.length
    ? end - frames[frames.length - 1].at
    : null;
  const coverageFraction =
    valid && frames.length > 1
      ? (frames[frames.length - 1].at - frames[0].at) / elapsedMs
      : 0;
  return {
    elapsedMs,
    frameCount: frames.length,
    windowFps: valid ? (frames.length * 1000) / elapsedMs : null,
    activeCadenceFps: deltaSum > 0 ? (frames.length * 1000) / deltaSum : null,
    firstFrameDelayMs,
    lastFrameLagMs,
    coverageFraction,
    completeWindow:
      valid &&
      coverageFraction >= 0.9 &&
      firstFrameDelayMs !== null &&
      firstFrameDelayMs <= 100 &&
      lastFrameLagMs !== null &&
      lastFrameLagMs <= 100,
  };
}
