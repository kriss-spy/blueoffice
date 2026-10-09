import {
  fixedLayoutObstacles,
  footprint,
  roomBounds,
  type LayoutPlacement,
} from "./layout.js";
import { workstation, type Point } from "./scene.js";
export type RouteReservation = { owner: string; points: Point[] };
export type RouteResult = { points: Point[]; reason?: string };
const radius = 0.16,
  step = 0.2;
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export { distance as sceneDistance };
/** Meter-space obstacles follow the same rotated footprint contract as layout admission. */
export function planSceneRoute(
  start: Point,
  goal: Point,
  placements: LayoutPlacement[],
  ownerDesk?: string,
  reservations: RouteReservation[] = [],
  owner = "",
): RouteResult {
  const obstacles = [
    ...fixedLayoutObstacles.filter((o) => o.id !== "Safe standing area"),
    ...placements.filter((p) => p.id !== ownerDesk).map(footprint),
  ];
  const owned = placements.find((p) => p.id === ownerDesk);
  const ownedFootprint = owned ? footprint(owned) : undefined;
  const ownCorridor = (p: Point) => {
    if (!owned || !ownedFootprint) return true;
    if (!(
      p[0] > ownedFootprint.minX - radius &&
      p[0] < ownedFootprint.maxX + radius &&
      p[2] > ownedFootprint.minZ - radius &&
      p[2] < ownedFootprint.maxZ + radius
    ))
      return true;
    const angle = (owned.rotation * Math.PI) / 2,
      dx = p[0] - owned.position[0],
      dz = p[2] - owned.position[2];
    const x = dx * Math.cos(angle) - dz * Math.sin(angle),
      z = dx * Math.sin(angle) + dz * Math.cos(angle);
    // Access only the measured right standing aisle and front approach aisle.
    // The rest of the owned footprint stays blocked, including desk and chair.
    return (
      (x >= workstation.anchors.standing[0] - 0.15 &&
        z >= workstation.anchors.standing[2] - 0.015) ||
      z >= workstation.anchors.approach[2] - 0.22
    );
  };
  const valid = (p: Point) =>
    p[0] >= roomBounds.minX + radius &&
    p[0] <= roomBounds.maxX - radius &&
    p[2] >= roomBounds.minZ + radius &&
    p[2] <= roomBounds.maxZ - radius &&
    ownCorridor(p) &&
    !obstacles.some(
      (o) =>
        p[0] > o.minX - radius &&
        p[0] < o.maxX + radius &&
        p[2] > o.minZ - radius &&
        p[2] < o.maxZ + radius,
    ) &&
    !reservations.some(
      (r) =>
        r.owner !== owner && r.points.some((q) => distance(p, q) < radius * 2),
    );
  const clear = (a: Point, b: Point) => {
    const n = Math.max(1, Math.ceil(distance(a, b) / 0.05));
    for (let i = 0; i <= n; i++)
      if (
        !valid([
          a[0] + ((b[0] - a[0]) * i) / n,
          0,
          a[2] + ((b[2] - a[2]) * i) / n,
        ])
      )
        return false;
    return true;
  };
  if (!valid(start) || !valid(goal))
    return { points: [], reason: "Interaction slot or route is occupied." };
  if (distance(start, goal) < 0.02) return { points: [goal] };
  if (clear(start, goal)) return { points: [start, goal] };
  const origin: Point = [roomBounds.minX + radius, 0, roomBounds.minZ + radius];
  const cell = (p: Point): [number, number] => [
    Math.round((p[0] - origin[0]) / step),
    Math.round((p[2] - origin[2]) / step),
  ];
  const point = (c: [number, number]): Point => [
    origin[0] + c[0] * step,
    0,
    origin[2] + c[1] * step,
  ];
  const key = (c: [number, number]) => `${c[0]},${c[1]}`;
  const from = cell(start),
    to = cell(goal),
    fromPoint = point(from),
    toPoint = point(to);
  if (!clear(start, fromPoint) || !clear(toPoint, goal))
    return { points: [], reason: "No clear entry to the interaction slot." };
  const frontier: [number, number][] = [from],
    previous = new Map<string, [number, number] | null>([[key(from), null]]);
  for (let cursor = 0; cursor < frontier.length && cursor < 2200; cursor++) {
    const current = frontier[cursor];
    if (key(current) === key(to)) {
      const cells: Point[] = [];
      let c: [number, number] | null = current;
      while (c) {
        cells.push(point(c));
        c = previous.get(key(c)) ?? null;
      }
      const raw = [start, ...cells.reverse(), goal],
        simplified: Point[] = [start];
      for (let i = 1; i < raw.length; i++) {
        let j = i;
        while (j + 1 < raw.length && clear(simplified.at(-1)!, raw[j + 1])) j++;
        simplified.push(raw[j]);
        i = j;
      }
      return { points: simplified };
    }
    // Stable cardinal neighbor order gives reproducible short grid routes.
    for (const [dx, dz] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const next: [number, number] = [current[0] + dx, current[1] + dz];
      if (previous.has(key(next)) || !clear(point(current), point(next)))
        continue;
      previous.set(key(next), current);
      frontier.push(next);
    }
  }
  return { points: [], reason: "No clear furniture-safe route." };
}
/** Reserve the entire corridor, not only its destination, while a walk is active. */
export function routeSamples(points: Point[]): Point[] {
  const samples: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      n = Math.max(1, Math.ceil(distance(a, b) / 0.1));
    for (let j = 0; j <= n; j++)
      samples.push([
        a[0] + ((b[0] - a[0]) * j) / n,
        0,
        a[2] + ((b[2] - a[2]) * j) / n,
      ]);
  }
  return samples.length ? samples : points;
}
