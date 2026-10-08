import { useState } from "react";
import { command } from "../api";
import type { LayoutSnapshot } from "../../shared/layout";
import type {
  LayoutPreview,
  LayoutTransferProps,
} from "../../shared/layout-transfer";
import "./layout-transfer.css";
export function LayoutTransfer({
  connected,
  agents,
  layout,
  saved,
}: LayoutTransferProps) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [report, setReport] = useState<LayoutPreview>();
  const [bindings, setBindings] = useState<Record<string, string | null>>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function exportFile() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/layout/export");
      const manifest = await response.json();
      if (!response.ok)
        throw new Error(manifest.error ?? "Unable to export layout.");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(manifest, null, 2) + "\n"], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "blueoffice.layout.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export layout.");
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    setBusy(true);
    setError("");
    setReport(undefined);
    try {
      if (new TextEncoder().encode(source).length > 64000)
        throw new Error("Choose a portable manifest smaller than 64 KB.");
      const manifest = JSON.parse(source);
      const value = (await command("/api/layout/preview", {
        manifest,
        ...(bindings ? { bindings } : {}),
      })) as LayoutPreview;
      setBindings(value.bindings);
      setReport(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON manifest.");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!report) return;
    setBusy(true);
    setError("");
    try {
      const value = (await command("/api/layout/import", {
        baseRevision: report.baseRevision,
        manifest: report.manifest,
        bindings: report.bindings,
      })) as LayoutSnapshot;
      saved?.(value);
      setOpen(false);
      setReport(undefined);
      setBindings(undefined);
      setSource("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to import layout.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="layout-transfer" aria-label="Portable layouts">
      <div className="transfer-actions">
        <button disabled={!connected || busy} onClick={() => void exportFile()}>
          Export layout
        </button>
        <button
          disabled={!connected || busy}
          onClick={() => {
            setOpen(true);
            setError("");
          }}
        >
          Import layout
        </button>
        <small>
          Portable references only · exact asset versions · no asset files or
          conversations
        </small>
      </div>
      {error && !open && <p role="alert">{error}</p>}
      {layout?.references?.some((ref) => !ref.boundAgentId) && (
        <details>
          <summary>Unresolved portable references</summary>
          <ul>
            {layout.references
              .filter((ref) => !ref.boundAgentId)
              .map((ref) => (
                <li key={ref.agentId}>
                  {ref.agentId} · {ref.deskId ?? "No workstation"} ·{" "}
                  {ref.avatar
                    ? `${ref.avatar.assetId}@${ref.avatar.version}`
                    : "No character"}{" "}
                  · no local assistant created
                </li>
              ))}
          </ul>
        </details>
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Import portable layout"
          className="transfer-dialog"
        >
          <h3>Import portable layout</h3>
          <p>
            Import changes furniture and explicit bindings. Existing tasks and
            conversations continue. Missing or unreviewed exact characters use
            diagnostic placeholders.
          </p>
          <label>
            Choose manifest file
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Choose manifest file"
              disabled={busy}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setReport(undefined);
                setBindings(undefined);
                if (file.size > 64000) {
                  setError("Choose a portable manifest smaller than 64 KB.");
                  return;
                }
                setSource(await file.text());
                setError("");
              }}
            />
          </label>
          <label>
            Manifest JSON
            <textarea
              aria-label="Manifest JSON"
              rows={9}
              disabled={busy}
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setReport(undefined);
                setBindings(undefined);
                setError("");
              }}
            />
          </label>
          <button
            disabled={busy || !source || !connected}
            onClick={() => void preview()}
          >
            {report ? "Refresh preview" : "Validate and preview"}
          </button>
          {bindings && (
            <fieldset>
              <legend>Explicit assistant bindings</legend>
              {Object.entries(bindings).map(([sourceId, target]) => (
                <label key={sourceId}>
                  {sourceId}
                  <select
                    aria-label={`Bind ${sourceId}`}
                    disabled={busy}
                    value={target ?? ""}
                    onChange={(e) => {
                      setBindings((previous) => ({
                        ...previous,
                        [sourceId]: e.target.value || null,
                      }));
                      setReport(undefined);
                    }}
                  >
                    <option value="">
                      Unresolved reference · create no assistant
                    </option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} · {agent.id}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {!report && (
                <p>
                  Refresh the preview after changing bindings before applying.
                </p>
              )}
            </fieldset>
          )}
          {report && (
            <section aria-label="Import preview">
              <p>
                Schema {report.manifest.schemaVersion} ·{" "}
                {report.manifest.placements.length} assemblies ·{" "}
                {report.manifest.agents.length} agent references · base revision{" "}
                {report.baseRevision}
              </p>
              <ul>
                {report.manifest.placements.map((p) => (
                  <li key={p.id}>
                    {p.id} · {p.rotation * 90}° · X {p.position[0]}, Z{" "}
                    {p.position[2]}
                  </li>
                ))}
              </ul>
              {report.diagnostics.length ? (
                <ul aria-label="Import diagnostics">
                  {report.diagnostics.map((d, i) => (
                    <li key={i}>{d.message}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  No unresolved content. Exact references and placement
                  validation passed.
                </p>
              )}
            </section>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="transfer-actions">
            <button
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setReport(undefined);
                setBindings(undefined);
                setError("");
              }}
            >
              Cancel import
            </button>
            <button
              disabled={busy || !connected || !report}
              onClick={() => void apply()}
            >
              Apply imported layout
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
