export interface ProjectedMarker {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  priority?: number;
}
export interface MarkerPlacement {
  id: number;
  x: number;
  y: number;
  collapsed: boolean;
}
const gap = 6;
/** Stable screen-space packing; compact indicators keep each assistant represented. */
export function packSceneMarkers(
  markers: ProjectedMarker[],
  width: number,
  height: number,
): MarkerPlacement[] {
  const occupied: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }[] = [];
  return [...markers]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id - b.id)
    .map((marker) => {
      for (const collapsed of [false, true]) {
        const w = Math.min(width - gap * 2, collapsed ? 40 : marker.width),
          h = Math.min(height - gap * 2, collapsed ? 34 : marker.height);
        const offsets = [
          [0, 0],
          ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((r) => [
            [0, -r * (h + gap)],
            [0, r * (h + gap)],
            [-r * (w + gap), 0],
            [r * (w + gap), 0],
            [-r * (w + gap), -r * (h + gap)],
            [r * (w + gap), -r * (h + gap)],
          ]),
        ];
        for (const [dx, dy] of offsets) {
          const left = Math.max(
            gap,
            Math.min(width - w - gap, marker.x - w / 2 + dx),
          );
          const top = Math.max(
            gap,
            Math.min(height - h - gap, marker.y - h + dy),
          );
          const box = { left, top, right: left + w, bottom: top + h };
          if (
            occupied.some(
              (b) =>
                box.left < b.right + gap &&
                box.right > b.left - gap &&
                box.top < b.bottom + gap &&
                box.bottom > b.top - gap,
            )
          )
            continue;
          occupied.push(box);
          return { id: marker.id, x: left + w / 2, y: top + h, collapsed };
        }
      }
      // Extreme viewports still retain DOM attention controls and this compact indication.
      return {
        id: marker.id,
        x: gap + 20 + (marker.id % 8) * 46,
        y: height - gap,
        collapsed: true,
      };
    });
}
