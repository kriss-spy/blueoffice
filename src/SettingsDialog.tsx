import { useEffect, useRef, useState, type FormEvent } from "react";
import type { OfficeAgent } from "../shared/office";
import type {
  ProfileSettings,
  ProfileSnapshot,
  SettingsResult,
} from "../shared/settings";
import type { RouteStatus } from "../shared/routes";
import { command } from "./api";

export function SettingsDialog({
  agent,
  routes,
  close,
  adopted,
}: {
  agent?: OfficeAgent;
  routes: RouteStatus[];
  close: () => void;
  adopted: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [snapshot, setSnapshot] = useState<ProfileSnapshot>();
  const [values, setValues] = useState<ProfileSettings>();
  const [name, setName] = useState(agent?.name ?? "");
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SettingsResult>();
  const [acknowledged, setAcknowledged] = useState(false);
  const load = (next: ProfileSnapshot) => {
    setSnapshot(next);
    setValues({
      ...next.values,
      toolsets: next.values.toolsets.filter((tool) =>
        ["terminal", "file", "clarify"].includes(tool),
      ),
    });
    setResult(undefined);
  };
  useEffect(() => {
    dialog.current?.showModal();
    if (!agent) return;
    const abort = new AbortController();
    setBusy(true);
    void fetch(`/api/agents/${agent.id}/settings`, { signal: abort.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      })
      .then(load)
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [agent?.id]);
  const reload = async () => {
    setBusy(true);
    setError("");
    try {
      if (agent) {
        const response = await fetch(`/api/agents/${agent.id}/settings`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        load(data);
        setName(agent.name);
      } else
        load(
          (await command("/api/profiles/inspect", {
            profileHome: path,
          })) as ProfileSnapshot,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!snapshot || !values) return;
    setBusy(true);
    setError("");
    try {
      if (agent) {
        const saved = (await command(`/api/agents/${agent.id}/settings`, {
          name,
          expectedRevision: snapshot.revision,
          values,
        })) as SettingsResult;
        setSnapshot(saved.snapshot);
        setValues(saved.snapshot.values);
        setResult(saved);
      } else {
        const saved = (await command("/api/profiles/adopt", {
          name,
          profileHome: snapshot.profileHome,
          expectedRevision: snapshot.revision,
          values,
          acknowledgeOwnership: acknowledged,
        })) as { agent: OfficeAgent | null; result: SettingsResult };
        if (saved.agent) {
          adopted(saved.agent.id);
          close();
        } else {
          setSnapshot(saved.result.snapshot);
          setValues(saved.result.snapshot.values);
          setResult(saved.result);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const running = agent && !["stopped", "failed"].includes(agent.lifecycle);
  const blocked =
    busy ||
    running ||
    snapshot?.liveOwner ||
    (!agent && (snapshot?.managed || !acknowledged));
  return (
    <dialog
      ref={dialog}
      className="create-dialog settings-dialog"
      onCancel={close}
    >
      <form onSubmit={save}>
        <div className="dialog-title">
          <h2>{agent ? "Agent settings" : "Adopt a profile"}</h2>
          <button type="button" aria-label="Close settings" onClick={close}>
            ×
          </button>
        </div>
        <p>
          Profile defaults apply at the next start. Existing conversations keep
          their current settings until the runtime stops.
        </p>
        {!agent ? (
          <>
            <label>
              Existing Hermes profile home
              <input
                value={path}
                onChange={(e) => {
                  setPath(e.target.value);
                  setSnapshot(undefined);
                  setValues(undefined);
                  setAcknowledged(false);
                }}
                placeholder="/absolute/path/to/Hermes/profile"
              />
            </label>
            <button
              type="button"
              disabled={busy || !path}
              onClick={() => void reload()}
            >
              Inspect profile
            </button>
          </>
        ) : null}
        {snapshot && values ? (
          <>
            <p className="form-note">{snapshot.profileHome}</p>
            {snapshot.liveOwner || running ? (
              <p role="status">
                Stop this profile’s runtime before saving. It may be reading
                these settings.
              </p>
            ) : null}
            {!agent && snapshot.managed ? (
              <p role="alert">
                This profile already belongs to an office agent.
              </p>
            ) : null}
            {!snapshot.supported ? (
              <p role="status">
                Choose a supported model, tool selection and approval mode
                before saving. The verified proxy routing policy will replace
                the profile’s current routing settings.
              </p>
            ) : null}
            <label>
              Name
              <input
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Workspace
              <input
                required
                maxLength={4096}
                value={values.workspace}
                onChange={(e) =>
                  setValues({ ...values, workspace: e.target.value })
                }
              />
            </label>
            <label>
              Model
              <select
                required
                value={values.model}
                onChange={(e) =>
                  setValues({
                    ...values,
                    model: e.target.value as ProfileSettings["model"],
                  })
                }
              >
                <option value="" disabled>
                  Select a verified route
                </option>
                {routes.map((route) => (
                  <option
                    key={route.model}
                    value={route.model}
                    disabled={route.status === "unverified"}
                  >
                    {route.model} · {route.apiFamily} · {route.status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Persona / SOUL
              <textarea
                rows={5}
                maxLength={32000}
                value={values.soul}
                onChange={(e) => setValues({ ...values, soul: e.target.value })}
              />
            </label>
            <fieldset className="tool-choices">
              <legend>Enabled tool groups</legend>
              {(
                [
                  ["terminal", "Terminal commands"],
                  ["file", "Read and edit files"],
                  ["clarify", "Ask structured questions"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={values.toolsets.includes(key)}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        toolsets: e.target.checked
                          ? [...values.toolsets, key]
                          : values.toolsets.filter((item) => item !== key),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label>
              Command approvals
              <select
                value={values.approvalMode}
                onChange={(e) =>
                  setValues({
                    ...values,
                    approvalMode: e.target
                      .value as ProfileSettings["approvalMode"],
                  })
                }
              >
                <option value="manual">Ask for permission</option>
                <option value="off">Run without permission prompts</option>
              </select>
            </label>
            {!agent ? (
              <label className="ownership-choice">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                I will use BlueOffice as this profile’s only writer and runtime
                owner. I will stop its CLI, gateway and other editors before
                adoption. Its history and credentials remain in this profile;
                BlueOffice applies the selected settings and required proxy
                route.
              </label>
            ) : null}
            {result ? (
              <div role="status" className="settings-result">
                <strong>
                  {result.ok
                    ? "Settings saved. Start the agent to apply them."
                    : "Some sections were not saved. Review each outcome."}
                </strong>
                <ul>
                  {Object.entries(result.sections).map(([field, outcome]) => (
                    <li key={field}>
                      {field}: {outcome?.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="settings-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => void reload()}
              >
                Reload settings
              </button>
              <button
                className="primary"
                disabled={
                  !!blocked ||
                  values.toolsets.length === 0 ||
                  !routes.some(
                    (route) =>
                      route.model === values.model &&
                      route.status !== "unverified",
                  )
                }
              >
                {busy ? "Saving…" : agent ? "Save settings" : "Adopt profile"}
              </button>
            </div>
          </>
        ) : busy ? (
          <p role="status">Reading profile settings…</p>
        ) : null}
        {error ? (
          <p role="alert" className="inline-error">
            {error}
          </p>
        ) : null}
      </form>
    </dialog>
  );
}
