import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PCFShadowMap } from "three";
import {
  assetKey,
  mappedClips,
  characterManifestSchema,
  type CharacterPack,
} from "../../shared/assets";
import type { OfficeAgent } from "../../shared/office";
import { command } from "../api";
import {
  characterRequest,
  useCharacters,
  retryMissingCharacters,
} from "./characters";
import {
  Avatar,
  Camera,
  Labels,
  SceneBoundary,
  type Metrics,
  type CameraCommand,
} from "./ScenePrimitives";
import type { AvatarMotion } from "./avatar";
import { OfficeLighting } from "./OfficeLighting";
import { Room, Workstation } from "./Room";
import { defaultDesks, workstation, worldAnchor } from "../../shared/scene";
import "./characters.css";

export function CharacterLibrary({
  agent,
  close,
}: {
  agent?: OfficeAgent;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [packs, setPacks] = useState<CharacterPack[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [motion, setMotion] = useState<AvatarMotion>("idle");
  const [checked, setChecked] = useState<string[]>([]);
  const [materials, setMaterials] = useState(false),
    [coordinates, setCoordinates] = useState(false),
    [limitations, setLimitations] = useState(false);
  const [camera, setCamera] = useState<CameraCommand>({
    action: "reset",
    id: 0,
  });
  const metrics = useRef<Metrics>({ avatars: {} });
  const markers = useRef<(HTMLButtonElement | null)[]>([]);
  const [observed, setObserved] = useState<Metrics>({ avatars: {} });
  const pack = packs.find((p) => assetKey(p.ref) === selected);
  const loaded = useCharacters([pack?.ref]);
  const asset = pack && loaded[assetKey(pack.ref)]?.asset;
  const diagnostic =
    pack && (pack.diagnostic || loaded[assetKey(pack.ref)]?.error);
  const clipName =
    pack?.manifest.clips[motion as keyof CharacterPack["manifest"]["clips"]];
  const clipDuration =
    asset?.gltf.animations.find((c) => c.name === clipName)?.duration ??
    Infinity;
  const watched =
    !!asset &&
    observed.avatars.review?.clip === clipName &&
    observed.avatars.review.time >= clipDuration;
  const refresh = async () => {
    setPacks(await characterRequest<CharacterPack[]>("/api/characters"));
    retryMissingCharacters();
  };
  useEffect(() => {
    dialog.current?.showModal();
    void refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    metrics.current = { avatars: {} };
    setChecked([]);
    setMaterials(false);
    setCoordinates(false);
    setLimitations(false);
    setMotion("idle");
    setObserved({ avatars: {} });
  }, [selected]);
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const importFiles = async (files: File[]) => {
    const manifests = files.filter((f) => f.name.endsWith(".json"));
    if (manifests.length !== 1 || manifests[0].size > 100_000)
      throw new Error(
        "Choose one manifest JSON and its declared files (manifest up to 100 KB).",
      );
    const parsed = characterManifestSchema.safeParse(
      JSON.parse(await manifests[0].text()),
    );
    if (!parsed.success)
      throw new Error(`Invalid manifest: ${parsed.error.issues[0]?.message}`);
    const manifest = parsed.data;
    if (files.reduce((n, f) => n + f.size, 0) > 32_100_000)
      throw new Error("Choose a pack up to 32 MB.");
    const directory = manifests[0].webkitRelativePath
      .split("/")
      .slice(0, -1)
      .join("/");
    const supplied = files.filter((f) => f !== manifests[0]);
    const encoded = [];
    for (const file of supplied) {
      const path = directory
        ? file.webkitRelativePath.slice(directory.length + 1)
        : file.name;
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () =>
          reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });
      encoded.push({ path, base64 });
    }
    const next = (await command("/api/characters/import", {
      manifest,
      files: encoded,
    })) as CharacterPack;
    await refresh();
    setSelected(assetKey(next.ref));
  };
  const allClips = pack ? mappedClips(pack.manifest) : [];
  const ready =
    !!asset &&
    !diagnostic &&
    allClips.every((c) => checked.includes(c)) &&
    materials &&
    coordinates &&
    limitations;
  return (
    <dialog className="character-dialog" ref={dialog} onCancel={close}>
      <div className="dialog-title">
        <div>
          <h2>Character library</h2>
          <p>
            {agent
              ? `Choose a character for ${agent.name}.`
              : "Import a pack, then review it in the office."}
          </p>
        </div>
        <button aria-label="Close character library" onClick={close}>
          ×
        </button>
      </div>
      <div className="character-import">
        <label>
          Import pack files
          <input
            aria-label="Import character pack files"
            type="file"
            multiple
            accept=".json,.glb,.bin,.png,.jpg,.jpeg"
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              if (files.length) void act(() => importFiles(files));
            }}
          />
        </label>
        <label>
          Or choose a pack folder
          <input
            aria-label="Import character pack folder"
            type="file"
            {...{ webkitdirectory: "" }}
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              e.currentTarget.value = "";
              if (files.length) void act(() => importFiles(files));
            }}
          />
        </label>
        <button disabled={busy} onClick={() => void act(refresh)}>
          Refresh library
        </button>
      </div>
      <p className="form-note">
        Choose a manifest and its GLB/dependencies together. Files are stored
        locally. Importing does not establish redistribution permission.
      </p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="character-columns">
        <aside>
          {!packs.length && (
            <p>
              No character packs yet. The initial roster is Yuuka (Original);
              follow docs/character-packs.md to prepare its local pack.
            </p>
          )}
          {packs.map((p) => (
            <button
              className={selected === assetKey(p.ref) ? "selected" : ""}
              key={assetKey(p.ref)}
              onClick={() => setSelected(assetKey(p.ref))}
            >
              <strong>{p.manifest.name}</strong>
              <small>
                {p.ref.version} ·{" "}
                {p.diagnostic
                  ? "Unavailable"
                  : p.review
                    ? "Reviewed"
                    : "Needs visual review"}
              </small>
            </button>
          ))}
          {agent && (
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await command(`/api/agents/${agent.id}/avatar`, {
                    ref: null,
                  });
                  close();
                })
              }
            >
              Use placeholder
            </button>
          )}
        </aside>
        <section>
          {pack ? (
            <>
              <h3>{pack.manifest.name}</h3>
              <p>
                Creator: {pack.manifest.provenance.creator} · Rights:{" "}
                {pack.manifest.provenance.rightsOwner}
              </p>
              <p className="form-note">
                Source: {pack.manifest.provenance.source}
                <br />
                Redistribution:{" "}
                {pack.manifest.provenance.redistributionAllowed === true
                  ? "Claimed by manifest; evidence below"
                  : pack.manifest.provenance.redistributionAllowed === false
                    ? "Not permitted"
                    : "Unknown; excluded from public defaults"}
                <br />
                Evidence:{" "}
                {pack.manifest.provenance.permissionEvidence ?? "None supplied"}
              </p>
              {diagnostic && <p role="alert">{diagnostic}</p>}
              <div className="character-preview" key={selected}>
                <SceneBoundary>
                  <Canvas
                    orthographic
                    camera={{
                      position: [10, 10, 13],
                      zoom: 40,
                      near: 0.1,
                      far: 100,
                    }}
                    shadows={{ type: PCFShadowMap }}
                    dpr={[1, 1.5]}
                  >
                    <OfficeLighting />
                    <Camera command={camera} metrics={metrics} />
                    <Room />
                    {defaultDesks.slice(0, 2).map((desk) => (
                      <Workstation
                        key={desk.id}
                        position={desk.position}
                        rotation={desk.rotation}
                        anchors={false}
                        onSelect={() => {}}
                      />
                    ))}
                    {asset &&
                      defaultDesks
                        .slice(0, 2)
                        .map((desk, i) => (
                          <Avatar
                            key={`${selected}-${i}`}
                            id={i ? "duplicate" : "review"}
                            asset={asset}
                            position={worldAnchor(
                              workstation.anchors.standing,
                              desk.position,
                              desk.rotation,
                            )}
                            rotation={0}
                            motion={i ? "idle" : motion}
                            playing
                            time={0}
                            metrics={metrics}
                            onSelect={() => {}}
                          />
                        ))}
                    <Labels
                      markers={markers}
                      anchors={defaultDesks
                        .slice(0, 2)
                        .map((desk) =>
                          worldAnchor(
                            pack.manifest.anchors.nameplate,
                            worldAnchor(
                              workstation.anchors.standing,
                              desk.position,
                              desk.rotation,
                            ),
                            desk.rotation,
                          ),
                        )}
                      metrics={metrics}
                      onMetrics={setObserved}
                    />
                  </Canvas>
                </SceneBoundary>
                <div className="scene-markers">
                  {["Clip preview", "Independent duplicate"].map((name, i) => (
                    <button
                      key={name}
                      ref={(el) => {
                        markers.current[i] = el;
                      }}
                      className="scene-marker"
                    >
                      <strong>{name}</strong>
                    </button>
                  ))}
                </div>
              </div>
              <div className="character-preview-controls">
                <label>
                  Preview clip
                  <select
                    aria-label="Preview clip"
                    value={motion}
                    onChange={(e) => {
                      setMotion(e.target.value as AvatarMotion);
                      setObserved({ avatars: {} });
                    }}
                  >
                    {Object.entries(pack.manifest.clips).map(([key, name]) => (
                      <option key={key} value={key}>
                        {key} · {name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() =>
                    setCamera((c) => ({ action: "in", id: c.id + 1 }))
                  }
                >
                  Zoom in
                </button>
                <button
                  onClick={() =>
                    setCamera((c) => ({ action: "reset", id: c.id + 1 }))
                  }
                >
                  Reset view
                </button>
                <button
                  disabled={!watched || busy || !clipName}
                  onClick={() =>
                    setChecked((c) => [...new Set([...c, clipName!])])
                  }
                >
                  {clipName && checked.includes(clipName)
                    ? "Clip reviewed ✓"
                    : "Mark this clip reviewed"}
                </button>
              </div>
              <p className="form-note">
                Left character plays the selected clip; the duplicate keeps its
                own idle animation. Watch a full cycle before marking each clip
                reviewed. Check the face and halo at close zoom and normal
                office scale.
              </p>
              <p>
                Reviewed {checked.length} / {allClips.length} mapped clips.
                Validator warnings: {pack.warnings}.
              </p>
              <ul>
                {pack.manifest.knownLimitations.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
              {!pack.review && (
                <fieldset className="character-review">
                  <legend>Visual review</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={materials}
                      onChange={(e) => setMaterials(e.target.checked)}
                    />
                    Face, halo, transparency and native materials render
                    correctly.
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={coordinates}
                      onChange={(e) => setCoordinates(e.target.checked)}
                    />
                    Scale, forward direction, feet and nameplate anchors fit the
                    office.
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={limitations}
                      onChange={(e) => setLimitations(e.target.checked)}
                    />
                    I reviewed the known limitations for every mapped clip.
                  </label>
                  <button
                    disabled={!ready || busy}
                    onClick={() =>
                      void act(async () => {
                        await command("/api/characters/review", {
                          ref: pack.ref,
                          clips: checked,
                          materials,
                          coordinates,
                          limitations,
                        });
                        await refresh();
                      })
                    }
                  >
                    Save visual review
                  </button>
                </fieldset>
              )}
              {pack.review && (
                <p>
                  Visual review saved{" "}
                  {new Date(pack.review.at).toLocaleDateString()}. This records
                  local suitability, not rights clearance.
                </p>
              )}
              {agent && (
                <button
                  className="primary"
                  disabled={!pack.review || !!diagnostic || !asset || busy}
                  onClick={() =>
                    void act(async () => {
                      await command(`/api/agents/${agent.id}/avatar`, {
                        ref: pack.ref,
                      });
                      close();
                    })
                  }
                >
                  Assign to {agent.name}
                </button>
              )}
              <output
                hidden
                data-character-preview={JSON.stringify({
                  selected,
                  metrics: observed,
                  reviewed: checked,
                })}
              />
            </>
          ) : (
            <p>
              Select an imported pack to preview its animations in the office.
            </p>
          )}
        </section>
      </div>
    </dialog>
  );
}
