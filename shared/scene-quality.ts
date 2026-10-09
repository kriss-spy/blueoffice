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
