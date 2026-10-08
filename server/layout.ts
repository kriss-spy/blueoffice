import {
  layoutSaveSchema,
  completeWorkstation,
  type LayoutSnapshot,
} from "../shared/layout.js";
import type { OfficeStore } from "./store.js";
export class LayoutError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
/** Placement writes are local office state; this service has no runtime or provider access. */
export class LayoutService {
  constructor(private store: OfficeStore) {}
  snapshot(): LayoutSnapshot {
    return this.store.layoutSnapshot();
  }
  save(input: unknown): LayoutSnapshot {
    const parsed = layoutSaveSchema.safeParse(input);
    if (!parsed.success)
      throw new LayoutError(
        "Invalid layout document. Reload the office and try again.",
        400,
      );
    return this.store.saveLayout(parsed.data);
  }
  availableDesk(used: Iterable<string | null>) {
    const occupied = new Set(used);
    return (
      this.snapshot().placements.find(
        (p) => completeWorkstation(p) && !occupied.has(p.id),
      )?.id ?? null
    );
  }
}
