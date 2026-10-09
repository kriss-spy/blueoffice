import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSceneQuality,
  sceneQualityPolicy,
  percentile,
} from "../shared/scene-quality.js";
test("reduced quality disables GPU shadows and caps DPR without changing agent state", () => {
  assert.deepEqual(sceneQualityPolicy("reduced"), {
    dpr: [1, 1],
    shadows: false,
    decorative: false,
  });
  assert.equal(sceneQualityPolicy("ordinary").shadows, true);
  assert.equal(parseSceneQuality("invalid"), "ordinary");
  assert.equal(parseSceneQuality("reduced"), "reduced");
});
test("performance percentiles use nearest-rank and report no samples as missing", () => {
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([5, 20, 10, Number.NaN], 0.95), 20);
  assert.equal(percentile([5, 20, 10], 0.5), 10);
});

import { initialLayout, layoutInventory } from "../shared/layout.js";
test("dense benchmark counts 40 actual furniture/equipment items excluding decorative cups and building shell", () => {
  const inventory = layoutInventory(initialLayout());
  assert.equal(inventory.componentCount, 32);
  assert.equal(inventory.roomFurnitureCount, 8);
  assert.equal(inventory.furnitureCount, 40);
  assert.equal(inventory.roomFurniture.espressoMachines, 1);
  assert.equal(inventory.roomFurniture.tabletopPlants, 1);
});
