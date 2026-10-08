import { useState } from "react";
import { command } from "../api";
import type { OfficeAgent } from "../../shared/office";
import {
  completeWorkstation,
  detachComponent,
  fixedLayoutObstacles,
  footprint,
  layoutComponents,
  newWorkstation,
  removePlacement,
  validateLayout,
  type LayoutComponent,
  type LayoutDraft,
  type LayoutPlacement,
  type LayoutSnapshot,
} from "../../shared/layout";
import type { QuarterTurn } from "../../shared/scene";
import "./layout-editor.css";

export function LayoutEditor({
  snapshot,
  agents,
  selectedId,
  select,
  preview,
  saved,
  cancel,
  connected,
}: {
  snapshot: LayoutSnapshot;
  agents: OfficeAgent[];
  selectedId?: string;
  select: (id: string | undefined) => void;
  preview: (draft: LayoutDraft) => void;
  saved: (snapshot: LayoutSnapshot) => void;
  cancel: () => void;
  connected: boolean;
}) {
  const [history, setHistory] = useState<LayoutDraft[]>([
    structuredClone({
      placements: snapshot.placements,
      assignments: snapshot.assignments,
    }),
  ]);
  const [cursor, setCursor] = useState(0);
  const [candidate, setCandidate] = useState<LayoutPlacement>(
    newWorkstation("new-workstation", [0, 0, 0]),
  );
  const [tool, setTool] = useState<"select" | "place" | "move">("select");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = history[cursor];
  const selected = draft.placements.find((p) => p.id === selectedId);
  const ghost =
    tool === "place"
      ? candidate
      : tool === "move" && selected
        ? {
            ...selected,
            position: candidate.position,
            rotation: candidate.rotation,
          }
        : undefined;
  const ghostDraft = ghost
    ? {
        ...draft,
        placements: [
          ...draft.placements.filter((p) => p.id !== ghost.id),
          ghost,
        ],
      }
    : draft;
  const issues = validateLayout(ghostDraft);
  function commit(next: LayoutDraft, notice = "") {
    const updated = [...history.slice(0, cursor + 1), structuredClone(next)];
    setHistory(updated);
    setCursor(updated.length - 1);
    preview(next);
    setMessage(notice);
  }
  function step(nextCursor: number) {
    setCursor(nextCursor);
    preview(history[nextCursor]);
    setTool("select");
    setMessage("");
  }
  function choose(id: string) {
    select(id);
    setTool("select");
    setMessage("");
  }
  function changeComponent(component: LayoutComponent) {
    if (!selected) return;
    if (selected.components[component])
      commit(
        detachComponent(draft, selected.id, component),
        "Component detached. This workstation is incomplete; assigned assistants now stand safely unassigned. Reattach all components to assign them again.",
      );
    else
      commit(
        {
          ...draft,
          placements: draft.placements.map((p) =>
            p.id === selected.id
              ? { ...p, components: { ...p.components, [component]: true } }
              : p,
          ),
        },
        "Component reattached. Completeness revalidated.",
      );
  }
  function place() {
    if (!ghost || issues.length) {
      setMessage(issues.map((issue) => issue.message).join(" "));
      return;
    }
    const next = {
      ...draft,
      placements: [...draft.placements.filter((p) => p.id !== ghost.id), ghost],
    };
    commit(next);
    select(ghost.id);
    setTool("select");
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const result = (await command("/api/layout", {
        baseRevision: snapshot.revision,
        draft,
      })) as LayoutSnapshot;
      saved(result);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the office layout.",
      );
    } finally {
      setBusy(false);
    }
  }
  const svgRect = (p: LayoutPlacement) => {
    const f = footprint(p);
    return {
      x: f.minX,
      y: f.minZ,
      width: f.maxX - f.minX,
      height: f.maxZ - f.minZ,
    };
  };
  return (
    <section className="layout-editor" aria-label="Workstation editor">
      <header>
        <div>
          <h3>Edit office</h3>
          <p>
            Revision {snapshot.revision} · Changes stay in this draft until
            Save. Live requests continue.
          </p>
        </div>
        <div className="layout-actions">
          <button disabled={!cursor || busy} onClick={() => step(cursor - 1)}>
            Undo placement
          </button>
          <button
            disabled={cursor === history.length - 1 || busy}
            onClick={() => step(cursor + 1)}
          >
            Redo placement
          </button>
          <button disabled={busy} onClick={cancel}>
            Cancel editing
          </button>
          <button
            disabled={!connected || busy || validateLayout(draft).length > 0}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save layout"}
          </button>
        </div>
      </header>
      <div className="layout-columns">
        <div>
          <div className="layout-catalog" aria-label="Furniture catalog">
            <strong>Catalog</strong>
            <button
              disabled={busy}
              onClick={() => {
                setCandidate(
                  newWorkstation(
                    `desk-${crypto.randomUUID().slice(0, 8)}`,
                    [0, 0, 0],
                  ),
                );
                setTool("place");
                select(undefined);
              }}
            >
              Place workstation
            </button>
            <span>Desk + chair + computer + keyboard</span>
          </div>
          <svg
            className="layout-plan"
            viewBox="-5.2 -4.2 10.4 8.4"
            role="img"
            aria-label="Office floor plan. Select a workstation or click to position the footprint ghost."
            onPointerMove={(event) => {
              if (tool === "select") return;
              const svg = event.currentTarget;
              const matrix = svg.getScreenCTM();
              if (!matrix) return;
              const point = new DOMPoint(
                event.clientX,
                event.clientY,
              ).matrixTransform(matrix.inverse());
              setCandidate((p) => ({
                ...p,
                position: [
                  Math.round(point.x * 10) / 10,
                  0,
                  Math.round(point.y * 10) / 10,
                ],
              }));
            }}
            onClick={() => {
              if (tool !== "select") place();
            }}
          >
            <rect
              x="-4.95"
              y="-3.95"
              width="9.9"
              height="7.9"
              fill="#ead7bc"
              stroke="#788d9b"
              strokeWidth=".05"
            />
            {fixedLayoutObstacles.map((o) => (
              <g key={o.id}>
                <rect
                  x={o.minX}
                  y={o.minZ}
                  width={o.maxX - o.minX}
                  height={o.maxZ - o.minZ}
                  fill="#98b9ae"
                />
                <text
                  x={(o.minX + o.maxX) / 2}
                  y={(o.minZ + o.maxZ) / 2}
                  textAnchor="middle"
                  fontSize=".19"
                >
                  {o.id}
                </text>
              </g>
            ))}
            {draft.placements.map((p) => (
              <g
                key={p.id}
                data-layout-placement={p.id}
                onClick={(event) => {
                  if (tool === "select") {
                    event.stopPropagation();
                    choose(p.id);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <rect
                  {...svgRect(p)}
                  fill={selectedId === p.id ? "#93cdda" : "#f7fafb"}
                  stroke={selectedId === p.id ? "#176b81" : "#8194a0"}
                  strokeWidth=".05"
                />
                <text
                  x={p.position[0]}
                  y={p.position[2]}
                  fontSize=".22"
                  textAnchor="middle"
                >
                  {p.id}
                </text>
                <text
                  x={p.position[0]}
                  y={p.position[2] + 0.35}
                  fontSize=".19"
                  textAnchor="middle"
                >
                  {p.rotation * 90}°
                  {completeWorkstation(p) ? "" : " · incomplete"}
                </text>
              </g>
            ))}
            {ghost && (
              <rect
                data-layout-ghost="true"
                {...svgRect(ghost)}
                fill={issues.length ? "#f08a7d" : "#59bda1"}
                fillOpacity=".6"
                stroke={issues.length ? "#ad392b" : "#176b58"}
                strokeWidth=".07"
                strokeDasharray=".14 .08"
                pointerEvents="none"
              />
            )}
          </svg>
          <p className="layout-help">
            Click a footprint to select. Place or Move shows a ghost; click the
            floor to apply it. Coordinates also support keyboard placement.
          </p>
        </div>
        <div className="layout-controls">
          <label>
            Selected workstation
            <select
              aria-label="Selected workstation"
              value={selectedId ?? ""}
              onChange={(event) => choose(event.target.value)}
            >
              <option value="">Choose a workstation</option>
              {draft.placements.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <>
              <div className="layout-actions">
                <button
                  disabled={busy}
                  onClick={() => {
                    setCandidate(structuredClone(selected));
                    setTool("move");
                  }}
                >
                  Move workstation
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    const next = {
                      ...draft,
                      placements: draft.placements.map((p) =>
                        p.id === selected.id
                          ? {
                              ...p,
                              rotation: ((p.rotation + 1) % 4) as QuarterTurn,
                            }
                          : p,
                      ),
                    };
                    const failures = validateLayout(next);
                    if (failures.length)
                      setMessage(failures.map((i) => i.message).join(" "));
                    else commit(next);
                  }}
                >
                  Rotate workstation 90°
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    commit(
                      removePlacement(draft, selected.id),
                      "Workstation deleted from draft. Assigned assistants remain live and safely unassigned.",
                    );
                    select(undefined);
                    setTool("select");
                  }}
                >
                  Delete workstation
                </button>
              </div>
              <fieldset>
                <legend>
                  Assembly components ·{" "}
                  {completeWorkstation(selected) ? "complete" : "incomplete"}
                </legend>
                {layoutComponents.map((c) => (
                  <button
                    key={c}
                    disabled={busy}
                    onClick={() => changeComponent(c)}
                  >
                    {selected.components[c] ? "Detach" : "Reattach"} {c}
                  </button>
                ))}
              </fieldset>
            </>
          )}
          {tool !== "select" && (
            <fieldset>
              <legend>
                {tool === "place" ? "Place" : "Move"} footprint ghost
              </legend>
              <label>
                X position
                <input
                  type="number"
                  step="0.1"
                  aria-label="Workstation X position"
                  value={candidate.position[0]}
                  onChange={(e) =>
                    setCandidate((p) => ({
                      ...p,
                      position: [Number(e.target.value), 0, p.position[2]],
                    }))
                  }
                />
              </label>
              <label>
                Z position
                <input
                  type="number"
                  step="0.1"
                  aria-label="Workstation Z position"
                  value={candidate.position[2]}
                  onChange={(e) =>
                    setCandidate((p) => ({
                      ...p,
                      position: [p.position[0], 0, Number(e.target.value)],
                    }))
                  }
                />
              </label>
              <button
                onClick={() =>
                  setCandidate((p) => ({
                    ...p,
                    rotation: ((p.rotation + 1) % 4) as QuarterTurn,
                  }))
                }
              >
                Rotate ghost 90°
              </button>
              <button disabled={issues.length > 0 || busy} onClick={place}>
                Apply placement
              </button>
              <button onClick={() => setTool("select")}>Discard ghost</button>
              {issues.length ? (
                <ul aria-label="Placement failures">
                  {issues.map((issue, i) => (
                    <li key={i}>{issue.message}</li>
                  ))}
                </ul>
              ) : (
                <p>Valid footprint and clear approach.</p>
              )}
            </fieldset>
          )}
          <fieldset>
            <legend>Assistant assignments</legend>
            {agents.map((agent) => (
              <label key={agent.id}>
                {agent.name}
                <select
                  aria-label={`Workstation for ${agent.name}`}
                  disabled={busy}
                  value={draft.assignments[agent.id] ?? ""}
                  onChange={(event) => {
                    const deskId = event.target.value || null;
                    const next = {
                      ...draft,
                      assignments: { ...draft.assignments, [agent.id]: deskId },
                    };
                    const errors = validateLayout(next);
                    if (errors.length)
                      setMessage(errors.map((i) => i.message).join(" "));
                    else commit(next);
                  }}
                >
                  <option value="">Unassigned · safe standing</option>
                  {draft.placements.filter(completeWorkstation).map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={Object.entries(draft.assignments).some(
                        ([id, desk]) => id !== agent.id && desk === p.id,
                      )}
                    >
                      {p.id}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
          {message && <p role="alert">{message}</p>}
        </div>
      </div>
    </section>
  );
}
