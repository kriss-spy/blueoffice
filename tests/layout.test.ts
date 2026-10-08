import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialLayout,
  validateLayout,
  newWorkstation,
  removePlacement,
  detachComponent,
  footprint,
  completeWorkstation,
} from "../shared/layout.js";
import { worldAnchor, workstation } from "../shared/scene.js";

test("initial room has valid bounds, reserved footprints, interaction slots and approaches", () => {
  assert.deepEqual(validateLayout(initialLayout()), []);
});
test("placement failures explain bounds, overlap, cafe and blocked approach", () => {
  assert.ok(
    validateLayout({
      placements: [newWorkstation("outside", [5, 0, 0])],
      assignments: {},
    }).some((i) => i.code === "bounds"),
  );
  assert.ok(
    validateLayout({
      placements: [newWorkstation("a"), newWorkstation("b")],
      assignments: {},
    }).some((i) => i.code === "overlap"),
  );
  assert.ok(
    validateLayout({
      placements: [newWorkstation("a", [-2, 0, -2.8])],
      assignments: {},
    }).some((i) => i.message.includes("Coffee corner")),
  );
  const blocked = {
    placements: [
      newWorkstation("a", [1, 0, -0.8]),
      newWorkstation("b", [1, 0, 1.8]),
    ],
    assignments: {},
  };
  assert.ok(validateLayout(blocked).some((i) => i.code === "approach"));
});
test("rotation carries footprint and every anchor as one assembly", () => {
  const p = newWorkstation("a", [1.2, 0, 0], 1);
  const f = footprint(p);
  assert.ok(Math.abs(f.maxX - f.minX - workstation.footprint.depth) < 1e-8);
  const anchor = worldAnchor(
    workstation.anchors.keyboard,
    p.position,
    p.rotation,
  );
  assert.ok(
    Math.abs(anchor[0] - (p.position[0] + workstation.anchors.keyboard[2])) <
      1e-8,
  );
  assert.ok(Math.abs(anchor[2] + workstation.anchors.keyboard[0]) < 1e-8);
});
test("deletion and component detachment visibly unassign while preserving agent identity", () => {
  const draft = {
    placements: [newWorkstation("a")],
    assignments: { agent: "a" },
  };
  assert.deepEqual(removePlacement(draft, "a"), {
    placements: [],
    assignments: { agent: null },
  });
  const detached = detachComponent(draft, "a", "chair");
  assert.equal(detached.assignments.agent, null);
  assert.equal(completeWorkstation(detached.placements[0]), false);
  assert.deepEqual(validateLayout(detached), []);
  assert.ok(
    validateLayout({ ...detached, assignments: { agent: "a" } }).some(
      (i) => i.code === "incomplete",
    ),
  );
  assert.ok(
    validateLayout({ ...draft, assignments: { one: "a", two: "a" } }).some(
      (i) => i.code === "slot",
    ),
  );
});
