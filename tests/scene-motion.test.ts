import { workstation, worldAnchor } from "../shared/scene";
import assert from "node:assert/strict";
import test from "node:test";
import { newWorkstation } from "../shared/layout";
import { planSceneRoute, routeSamples } from "../shared/scene-navigation";
import {
  SceneMotionController,
  type MotionIntent,
} from "../shared/scene-motion";
const intent = (edit: Partial<MotionIntent> = {}): MotionIntent => ({
  id: "a",
  goal: [1, 0, 0],
  fallback: [-1, 0, 0],
  destinationKey: "desk:working",
  canWalk: true,
  preempt: false,
  paused: false,
  ...edit,
});
test("grid routes avoid rotated furniture, fixed cafe and occupied interaction slots deterministically", () => {
  const desks = [newWorkstation("obstacle", [0, 0, 0], 1)];
  const route = planSceneRoute([-3, 0, 1], [3, 0, 1], desks);
  assert.ok(route.points.length > 2, route.reason);
  assert.deepEqual(route, planSceneRoute([-3, 0, 1], [3, 0, 1], desks));
  assert.ok(
    routeSamples(route.points).every(
      (p) => !(p[0] > -1.1 && p[0] < 1.6 && p[2] > -1.2 && p[2] < 1.2),
    ),
  );
  assert.equal(
    planSceneRoute(
      [-3, 0, 1],
      [3, 0, 1],
      desks,
      undefined,
      [{ owner: "b", points: [[3, 0, 1]] }],
      "a",
    ).points.length,
    0,
  );
  assert.equal(planSceneRoute([0, 0, 0], [-2, 0, -2], []).points.length, 0);
});
test("missing clips, attention and reduced motion immediately preempt routes without semantic input changes", () => {
  const c = new SceneMotionController(),
    i = intent(),
    original = structuredClone(i);
  let a = c.update([i], [], 0.1).a;
  assert.ok(a.walking);
  assert.ok(a.position[0] > -1);
  a = c.update([{ ...i, preempt: true }], [], 0).a;
  assert.deepEqual(a.position, i.fallback);
  assert.equal(a.walking, false);
  a = c.update([{ ...i, canWalk: false }], [], 1).a;
  assert.match(a.reason!, /unavailable/);
  a = c.update([{ ...i, paused: true }], [], 1).a;
  assert.match(a.reason!, /paused/);
  assert.deepEqual(i, original);
});
test("edited destinations are revalidated and repeated inputs do not restart completed walks", () => {
  const c = new SceneMotionController(),
    i = intent();
  c.update([i], [], 0.1);
  let a = c.update(
    [{ ...i, goal: [0, 0, 0], destinationKey: "edited" }],
    [newWorkstation("new", [0, 0, 0])],
    0.1,
  ).a;
  assert.equal(a.walking, false);
  assert.deepEqual(a.position, i.fallback);
  const d = new SceneMotionController();
  for (let n = 0; n < 40; n++) a = d.update([i], [], 0.1).a;
  assert.equal(a.walking, false);
  assert.deepEqual(a.position, i.goal);
  assert.deepEqual(d.update([i], [], 0.1).a.position, i.goal);
});
test("two actors cannot reserve the same interaction slot or intersect an active route", () => {
  const c = new SceneMotionController();
  const state = c.update(
    [intent(), intent({ id: "b", fallback: [1, 0, 1], goal: [1, 0, 0] })],
    [],
    0.1,
  );
  assert.ok(!state.a.walking || !state.b.walking);
  assert.ok(state.a.reason || state.b.reason);
});
test("owned workstation permits only the standing and approach aisles, including rotated geometry", () => {
  for (const rotation of [0, 1, 2, 3] as const) {
    const desk = newWorkstation("owned", [0, 0, 1], rotation);
    const start = worldAnchor(
        workstation.anchors.standing,
        desk.position,
        rotation,
      ),
      goal = worldAnchor(workstation.anchors.approach, desk.position, rotation);
    const route = planSceneRoute(start, goal, [desk], desk.id);
    assert.ok(route.points.length > 1, `${rotation}: ${route.reason}`);
    assert.equal(
      planSceneRoute(
        worldAnchor([0, 0, 0], desk.position, rotation),
        goal,
        [desk],
        desk.id,
      ).points.length,
      0,
    );
    const angle = (rotation * Math.PI) / 2;
    for (const p of routeSamples(route.points)) {
      const x =
          (p[0] - desk.position[0]) * Math.cos(angle) -
          (p[2] - desk.position[2]) * Math.sin(angle),
        z =
          (p[0] - desk.position[0]) * Math.sin(angle) +
          (p[2] - desk.position[2]) * Math.cos(angle);
      assert.ok(
        (x >= 0.869 && z >= 0.704) || z >= 1.429,
        `route crosses desk/chair: ${x},${z}`,
      );
    }
  }
});
test("unchanged destinations resume once after editing, graphics pause or restored walk mapping", () => {
  for (const suspension of [
    { preempt: true },
    { paused: true },
    { canWalk: false },
  ]) {
    const controller = new SceneMotionController(),
      i = intent();
    controller.update([i], [], 0.1);
    const stopped = controller.update([{ ...i, ...suspension }], [], 0).a;
    assert.equal(stopped.walking, false);
    assert.ok(stopped.reason);
    const resumed = controller.update([i], [], 0.1).a;
    assert.equal(resumed.destinationKey, stopped.destinationKey);
    assert.equal(resumed.reason, undefined);
    assert.equal(resumed.walking, true);
    for (let n = 0; n < 40; n++) controller.update([i], [], 0.1);
    assert.deepEqual(controller.update([i], [], 0.1).a.position, i.goal);
  }
  const controller = new SceneMotionController(),
    working = intent({ goal: [-1, 0, 0] });
  controller.update([working], [], 0);
  controller.update([{ ...working, preempt: true }], [], 0);
  const restored = controller.update([working], [], 0).a;
  assert.equal(restored.walking, false);
  assert.equal(restored.reason, undefined);
  assert.deepEqual(restored.position, working.goal);
});
test("resume into an occupied slot retains its real blocker without repeatedly retrying", () => {
  const controller = new SceneMotionController(),
    a = intent(),
    b = intent({
      id: "b",
      goal: [1, 0, 0],
      fallback: [1, 0, 1],
      canWalk: false,
    });
  controller.update([{ ...a, paused: true }, b], [], 0);
  const blocked = controller.update([a, b], [], 0).a;
  assert.match(blocked.reason!, /occupied/);
  assert.equal(blocked.walking, false);
  assert.deepEqual(controller.update([a], [], 0.1).a, blocked);
});
