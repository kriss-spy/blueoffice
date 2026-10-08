import assert from "node:assert/strict";
import test from "node:test";
import { packSceneMarkers } from "../shared/scene-markers";
test("dense projected assistants keep deterministic distinct expanded or compact indications", () => {
  const markers = Array.from({ length: 8 }, (_, id) => ({
    id,
    x: 150,
    y: 150,
    width: 160,
    height: 80,
    priority: id === 7 ? 2 : 0,
  }));
  const result = packSceneMarkers(markers, 320, 270);
  assert.deepEqual(result, packSceneMarkers(markers, 320, 270));
  assert.equal(new Set(result.map((p) => p.id)).size, 8);
  assert.equal(result[0].id, 7);
  assert.ok(result.some((p) => p.collapsed));
  const rectangles = result.map((p) => {
    const m = markers[p.id],
      w = p.collapsed ? 40 : m.width,
      h = p.collapsed ? 34 : m.height;
    return { left: p.x - w / 2, right: p.x + w / 2, top: p.y - h, bottom: p.y };
  });
  for (let i = 0; i < rectangles.length; i++)
    for (let j = i + 1; j < rectangles.length; j++) {
      const a = rectangles[i],
        b = rectangles[j];
      assert.ok(
        !(
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top
        ),
        `markers ${i}/${j} overlap`,
      );
    }
});
