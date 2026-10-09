import { useEffect, useState } from "react";
import { assetKey, type CharacterPack } from "../shared/assets";
import { completeWorkstation, type LayoutSnapshot } from "../shared/layout";
import type { SetupPlacement } from "../shared/setup";

export function NewAssignmentFields({
  layout,
  value,
  onChange,
}: {
  layout?: LayoutSnapshot;
  value: SetupPlacement;
  onChange: (value: SetupPlacement) => void;
}) {
  const [packs, setPacks] = useState<CharacterPack[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/characters", { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Character catalog unavailable. Use the placeholder or retry setup.",
          );
        setPacks(await response.json());
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(failure.message);
      });
    return () => abort.abort();
  }, []);
  const occupied = new Set(Object.values(layout?.assignments ?? {}));
  return (
    <fieldset disabled={!layout}>
      <legend>Office assignment</legend>
      <label>
        Avatar
        <select
          value={value.avatar ? assetKey(value.avatar) : ""}
          onChange={(event) =>
            onChange({
              ...value,
              avatar:
                packs.find((pack) => assetKey(pack.ref) === event.target.value)
                  ?.ref ?? null,
            })
          }
        >
          <option value="">Placeholder avatar</option>
          {packs
            .filter((pack) => pack.review && !pack.diagnostic)
            .map((pack) => (
              <option key={assetKey(pack.ref)} value={assetKey(pack.ref)}>
                {pack.manifest.name} · {pack.ref.version}
              </option>
            ))}
        </select>
      </label>
      <label>
        Workstation
        <select
          value={value.deskId ?? ""}
          onChange={(event) =>
            onChange({ ...value, deskId: event.target.value || null })
          }
        >
          <option value="">Unassigned · standing area</option>
          {layout?.placements
            .filter(
              (desk) => completeWorkstation(desk) && !occupied.has(desk.id),
            )
            .map((desk) => (
              <option key={desk.id} value={desk.id}>
                {desk.id}
              </option>
            ))}
        </select>
      </label>
      <p className="form-note">
        Only reviewed avatars and complete free workstations are selectable.
        Unassigned assistants remain visible in the standing area.
      </p>
      {error ? <p role="status">{error}</p> : null}
    </fieldset>
  );
}
