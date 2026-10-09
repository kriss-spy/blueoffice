import assert from "node:assert/strict";
import test from "node:test";
import {
  avatarTransform,
  advanceAvatarTransform,
} from "../src/scene/avatar-transform";
import {
  worldAnchor,
  workstation,
  type Point,
  type QuarterTurn,
} from "../shared/scene";

const origin: Point = [2, 0, -1];
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);

test("the seat root and facing remain measured in every workstation orientation", () => {
  for (const rotation of [0, 1, 2, 3] as QuarterTurn[]) {
    const target = avatarTransform(origin, (rotation * Math.PI) / 2, {
      offset: [0, 0, 0.72],
      facing: 2,
    });
    const expected = worldAnchor([0, 0, 0.72], origin, rotation);
    target.position.forEach((n, i) => close(n, expected[i]));
    close(target.heading, (rotation * Math.PI) / 2 + Math.PI);
    // Enter from the standing aisle along the chair side, behind the desk edge.
    let current = avatarTransform(
      worldAnchor(workstation.anchors.standing, origin, rotation),
      (rotation * Math.PI) / 2,
    );
    for (let frame = 0; frame < 60; frame++) {
      current = advanceAvatarTransform(current, target, 1 / 60, true);
      // The world-space segment is bounded by the two legitimate chair-side anchors.
      const distance = Math.hypot(
        ...current.position.map((n, i) => n - target.position[i]),
      );
      assert.ok(distance < 1.02);
      const localZ =
        (current.position[0] - origin[0]) * Math.sin((rotation * Math.PI) / 2) +
        (current.position[2] - origin[2]) * Math.cos((rotation * Math.PI) / 2);
      close(localZ, 0.72);
    }
    assert.ok(
      Math.hypot(...current.position.map((n, i) => n - target.position[i])) <
        0.001,
    );
  }
});

test("turns follow the short arc across the angle boundary", () => {
  const current = { position: [0, 0, 0] as Point, heading: Math.PI - 0.1 };
  const target = { position: [0, 0, 0] as Point, heading: -Math.PI + 0.1 };
  const next = advanceAvatarTransform(current, target, 1 / 60, true);
  assert.ok(next.heading > current.heading);
  assert.ok(next.heading - current.heading < 0.2);
});

test("local blending is independent of frame cadence and settles on the seated contact", () => {
  const target = { position: [0, 0, 0.72] as Point, heading: Math.PI };
  const run = (fps: number) => {
    let current = { position: [1.02, 0, 0.72] as Point, heading: 0 };
    for (let i = 0; i < fps; i++)
      current = advanceAvatarTransform(current, target, 1 / fps, true);
    return current;
  };
  const slow = run(30),
    fast = run(120);
  slow.position.forEach((n, i) => close(n, fast.position[i]));
  close(slow.heading, fast.heading);
  assert.ok(slow.position[0] < 0.001);
});

test("paused motion and distant reassignment immediately adopt the authoritative placement", () => {
  const current = { position: [0, 0, 0] as Point, heading: 0 };
  const target = { position: [1, 0, 0.72] as Point, heading: Math.PI };
  assert.deepEqual(
    advanceAvatarTransform(current, target, 1 / 60, false),
    target,
  );
  const reassigned = { position: [4, 0, -3] as Point, heading: Math.PI };
  assert.deepEqual(
    advanceAvatarTransform(current, reassigned, 1 / 60, true),
    reassigned,
  );
});
