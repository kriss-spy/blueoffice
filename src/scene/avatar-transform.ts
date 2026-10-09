import type { Point } from "../../shared/scene";

export type AvatarTransform = { position: Point; heading: number };

/** Flatten the measured seat offset before turning, so the avatar cannot orbit its desk. */
export function avatarTransform(
  position: Point,
  heading: number,
  seat?: { offset: Point; facing: number },
): AvatarTransform {
  const offset = seat?.offset ?? [0, 0, 0];
  return {
    position: [
      position[0] +
        offset[0] * Math.cos(heading) +
        offset[2] * Math.sin(heading),
      position[1] + offset[1],
      position[2] -
        offset[0] * Math.sin(heading) +
        offset[2] * Math.cos(heading),
    ],
    heading: heading + ((seat?.facing ?? 0) * Math.PI) / 2,
  };
}

/** Only blend local presentation motion; distant reassignment is not a navigation route. */
export function advanceAvatarTransform(
  current: AvatarTransform,
  target: AvatarTransform,
  seconds: number,
  playing: boolean,
): AvatarTransform {
  if (
    !playing ||
    Math.hypot(...target.position.map((n, i) => n - current.position[i])) > 1.6
  )
    return { position: [...target.position], heading: target.heading };
  const blend = 1 - Math.exp(-9 * Math.max(0, Math.min(seconds, 0.05)));
  const turn = Math.atan2(
    Math.sin(target.heading - current.heading),
    Math.cos(target.heading - current.heading),
  );
  return {
    position: current.position.map(
      (n, i) => n + (target.position[i] - n) * blend,
    ) as Point,
    heading: current.heading + turn * blend,
  };
}
