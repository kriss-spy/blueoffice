import assert from "node:assert/strict";
import test from "node:test";
import { seatedPlacement, type SeatingProfile } from "../shared/seating";
import { worldAnchor, type Point } from "../shared/scene";
const profile: SeatingProfile = {
  compatibility: ["blueoffice.seated-work.v1"],
  seat: [0, 0.263, 0],
  pelvis: [0, 0.35, 0],
  leftHand: [0.115, 0.65, 0.23],
  rightHand: [-0.115, 0.65, 0.23],
  leftFoot: [0.105, 0.06865, 0.24],
  rightFoot: [-0.105, 0.06865, 0.24],
  facing: 2,
};
const target = {
  seat: [0, 0.263, 0.72] as Point,
  keyboard: [0, 0.65, 0.38] as Point,
  compatibility: ["blueoffice.seated-work.v1"],
};
test("measured contact aligns independently of character identity and workstation quarter turn", () => {
  const result = seatedPlacement(profile, target);
  assert.equal(result.compatible, true);
  if (!result.compatible) return;
  assert.deepEqual(result.offset, [0, 0, 0.72]);
  assert.equal(result.pelvis[1], 0.35);
  assert.ok(result.keyboardDistance < 0.17);
  for (const rotation of [0, 1, 2, 3] as const) {
    const seat = worldAnchor(profile.seat, result.offset, profile.facing);
    const actual = worldAnchor(seat, [2, 0, -1], rotation);
    const expected = worldAnchor(target.seat, [2, 0, -1], rotation);
    actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < 1e-9));
  }
});
test("unsupported seating, mismatched furniture heights and unreachable keyboards stay truthful", () => {
  assert.equal(seatedPlacement(undefined, target).compatible, false);
  assert.equal(
    seatedPlacement(profile, { ...target, compatibility: ["another-pose"] })
      .compatible,
    false,
  );
  assert.match(
    seatedPlacement(profile, { ...target, seat: [0, 0.48, 0.72] }).diagnostic,
    /planted feet/,
  );
  assert.match(
    seatedPlacement(profile, { ...target, keyboard: [0, 0.65, -0.2] })
      .diagnostic,
    /cannot reach/,
  );
  assert.equal(
    seatedPlacement({ ...profile, rightHand: [-1, 0.65, 0.23] }, target)
      .compatible,
    false,
  );
});
