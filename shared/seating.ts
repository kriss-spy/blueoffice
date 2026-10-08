import { worldAnchor, type Point, type QuarterTurn } from "./scene";

/** Measured in canonical avatar meters, sampled in the declared seated clip. */
export interface SeatingProfile {
  compatibility: string[];
  seat: Point;
  pelvis: Point;
  leftHand: Point;
  rightHand: Point;
  leftFoot: Point;
  rightFoot: Point;
  facing: QuarterTurn;
}
export interface SeatingTarget {
  seat: Point;
  keyboard: Point;
  compatibility: readonly string[];
}
export function seatedPlacement(
  profile: SeatingProfile | undefined,
  target: SeatingTarget | undefined,
) {
  if (
    !profile ||
    !target ||
    !profile.compatibility.some((tag) => target.compatibility.includes(tag))
  )
    return {
      compatible: false as const,
      diagnostic:
        "No measured seated workstation compatibility; showing standing idle.",
    };
  const contact = worldAnchor(profile.seat, [0, 0, 0], profile.facing);
  const offset = target.seat.map((n, i) => n - contact[i]) as Point;
  const point = (p: Point) => worldAnchor(p, offset, profile.facing);
  if (Math.abs(offset[1]) > 0.012)
    return {
      compatible: false as const,
      diagnostic:
        "Seat height would move the planted feet; showing standing idle.",
    };
  const hands = [point(profile.leftHand), point(profile.rightHand)];
  // Wrists remain behind the keys; fingertips extend toward the keyboard.
  const keyboardDistance = Math.max(
    ...hands.map((hand) =>
      Math.hypot(...hand.map((n, i) => n - target.keyboard[i])),
    ),
  );
  if (keyboardDistance > 0.22)
    return {
      compatible: false as const,
      diagnostic:
        "Seated pose cannot reach this keyboard; showing standing idle.",
    };
  return {
    compatible: true as const,
    diagnostic: "",
    offset,
    facing: profile.facing,
    pelvis: point(profile.pelvis),
    hands,
    feet: [point(profile.leftFoot), point(profile.rightFoot)],
    keyboardDistance,
  };
}
