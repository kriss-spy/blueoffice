import type { LayoutPlacement } from "./layout.js";
import type { Point } from "./scene.js";
import {
  planSceneRoute,
  routeSamples,
  sceneDistance,
  type RouteReservation,
} from "./scene-navigation.js";
export type MotionIntent = {
  id: string;
  goal: Point;
  fallback: Point;
  deskId?: string;
  destinationKey: string;
  canWalk: boolean;
  preempt: boolean;
  paused: boolean;
};
export type SceneActor = {
  position: Point;
  heading: number;
  walking: boolean;
  reason?: string;
  destinationKey: string;
  route: Point[];
};
/** Presentation-only controller: no office runtime, task or request mutation is possible here. */
export class SceneMotionController {
  private actors = new Map<string, SceneActor>();
  private geometry = "";
  update(
    intents: MotionIntent[],
    placements: LayoutPlacement[],
    seconds: number,
  ): Record<string, SceneActor> {
    const geometry = JSON.stringify(placements),
      changed = geometry !== this.geometry;
    this.geometry = geometry;
    const ids = new Set(intents.map((i) => i.id));
    for (const id of this.actors.keys())
      if (!ids.has(id)) this.actors.delete(id);
    const reservations: RouteReservation[] = intents.map((intent) => ({
      owner: intent.id,
      points: [
        this.actors.get(intent.id)?.position ?? intent.fallback,
        intent.goal,
      ],
    }));
    for (const intent of [...intents].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      let actor = this.actors.get(intent.id);
      if (!actor)
        actor = {
          position: [...intent.fallback],
          heading: 0,
          walking: false,
          destinationKey: "",
          route: [],
        };
      if (intent.preempt || intent.paused || !intent.canWalk) {
        actor = {
          position: [...intent.fallback],
          heading: 0,
          walking: false,
          destinationKey: intent.destinationKey,
          route: [],
          reason: intent.preempt
            ? "Attention preempted movement."
            : intent.paused
              ? "Decorative motion paused."
              : "Mapped walk clip unavailable.",
        };
      } else if (changed || actor.destinationKey !== intent.destinationKey) {
        const plan = planSceneRoute(
          actor.position,
          intent.goal,
          placements,
          intent.deskId,
          reservations,
          intent.id,
        );
        actor = {
          ...actor,
          destinationKey: intent.destinationKey,
          route: plan.points.slice(1),
          walking: plan.points.length > 1,
          reason: plan.reason,
        };
        if (plan.reason) actor.position = [...intent.fallback];
      }
      if (actor.walking) {
        // Recheck edits and reservations before every advance; never walk through a new occupant.
        const next = actor.route[0];
        const checked = planSceneRoute(
          actor.position,
          next,
          placements,
          intent.deskId,
          reservations,
          intent.id,
        );
        if (checked.reason || checked.points.length > 2)
          actor = {
            ...actor,
            position: [...intent.fallback],
            walking: false,
            route: [],
            reason:
              checked.reason ?? "Reserved corridor changed; movement stopped.",
          };
        else {
          let budget = Math.max(0, Math.min(seconds, 0.1)) * 0.7;
          while (actor.route.length && budget > 0) {
            const goal = actor.route[0],
              d = sceneDistance(actor.position, goal);
            actor.heading = Math.atan2(
              goal[0] - actor.position[0],
              goal[2] - actor.position[2],
            );
            if (d <= budget) {
              actor.position = [...goal];
              actor.route.shift();
              budget -= d;
            } else {
              actor.position = [
                actor.position[0] +
                  ((goal[0] - actor.position[0]) * budget) / d,
                0,
                actor.position[2] +
                  ((goal[2] - actor.position[2]) * budget) / d,
              ];
              budget = 0;
            }
          }
          actor.walking = actor.route.length > 0;
        }
      }
      this.actors.set(intent.id, actor);
      const previousReservation = reservations.findIndex(
        (r) => r.owner === intent.id,
      );
      if (previousReservation >= 0) reservations.splice(previousReservation, 1);
      reservations.push({
        owner: intent.id,
        points: routeSamples([actor.position, ...actor.route]),
      });
    }
    return Object.fromEntries(
      [...this.actors].map(([id, a]) => [
        id,
        { ...a, position: [...a.position], route: a.route.map((p) => [...p]) },
      ]),
    );
  }
}
