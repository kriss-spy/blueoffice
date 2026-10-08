import { turnFailure } from "./failures.js";
import type { ModelId } from "../shared/routes.js";
import { randomUUID, createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  ChatItem,
  OfficeAgent,
  PendingRequest,
  Receipt,
  Snapshot,
  Target,
} from "../shared/office.js";
import { attention } from "../shared/office.js";
import { OfficeStore } from "./store.js";
import { RpcChild, RpcFailure, type Frame } from "./rpc.js";
import type { RuntimeFactory } from "./runtime.js";
import type {
  ProfileDefaults,
  ProfileSettings,
  ProfileSnapshot,
  SettingsResult,
} from "../shared/settings.js";
import { settingsSchema } from "../shared/settings.js";

const now = () => new Date().toISOString();
const text = (value: unknown, limit = 32_000) =>
  typeof value === "string" ? value.slice(0, limit) : "";
const strings = (value: unknown) =>
  Array.isArray(value)
    ? (value.filter((v) => typeof v === "string").slice(0, 20) as string[])
    : [];
export class OfficeError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

export class Office extends EventEmitter {
  private agents = new Map<string, OfficeAgent>();
  private runtimes = new Map<string, RpcChild>();
  private closing = false;
  private startups = new Set<Promise<void>>();
  private mutations = new Set<Promise<unknown>>();
  private pendingCreations = 0;
  private trackMutation<T>(work: Promise<T>): Promise<T> {
    this.mutations.add(work);
    return work.finally(() => this.mutations.delete(work));
  }
  private settingsWriters = new Set<string>();
  constructor(
    private store: OfficeStore,
    readonly factory: RuntimeFactory,
  ) {
    super();
    for (const agent of store.agents()) {
      agent.model ??= "glm-5.3-flash";
      // Upgrade snapshots from the initial DOM prototype without discarding their known binding.
      agent.conversations ??=
        agent.epoch && agent.liveSessionId && agent.storedSessionId
          ? [
              {
                epoch: agent.epoch,
                liveSessionId: agent.liveSessionId,
                storedSessionId: agent.storedSessionId,
                storedSessionIds: [agent.storedSessionId],
                createdAt: agent.createdAt,
              },
            ]
          : [];
      for (const message of agent.messages)
        message.epoch ??= agent.epoch ?? "legacy";
      this.agents.set(agent.id, agent);
      if (agent.lifecycle !== "stopped" && agent.lifecycle !== "failed") {
        agent.lifecycle = "unknown";
        agent.freshness = "unknown";
        agent.busy = false;
        agent.work = "unknown";
        agent.error =
          "The previous supervisor ended without a confirmed stop. Start will first acquire the profile ownership lease; old commands are never resent.";
        for (const request of attention(agent)) {
          request.state = "lost";
          request.reason = "Previous runtime ownership is unknown.";
        }
        for (const receipt of agent.receipts)
          if (receipt.state === "pending") {
            receipt.state = "unknown";
            receipt.message =
              "Supervisor restarted before acknowledgement. Not retried.";
          }
        this.changed(agent, "recovery");
      }
    }
  }
  snapshot(): Snapshot {
    return {
      revision: this.store.revision(),
      agents: structuredClone([...this.agents.values()]),
      mode: this.factory.mode,
      routes: this.factory.routes(),
    };
  }
  private get(id: string) {
    const agent = this.agents.get(id);
    if (!agent) throw new OfficeError("Office agent not found.", 404);
    return agent;
  }
  private changed(
    agent: OfficeAgent,
    kind: string,
    eventKey: string = randomUUID(),
  ) {
    this.store.save(agent, kind, eventKey);
    this.emit("change");
  }
  create(
    name: string,
    workspace: string,
    model: ModelId = "glm-5.3-flash",
    defaults?: ProfileDefaults,
  ) {
    if (this.agents.size + this.pendingCreations >= 8)
      throw new OfficeError(
        "This beta supports up to eight configured agents.",
      );
    this.pendingCreations++;
    return this.trackMutation(
      this.createAgent(name, workspace, model, defaults).finally(
        () => this.pendingCreations--,
      ),
    );
  }
  private async createAgent(
    name: string,
    workspace: string,
    model: ModelId = "glm-5.3-flash",
    defaults?: ProfileDefaults,
  ) {
    if (this.closing) throw new OfficeError("Office is shutting down.");
    if (this.agents.size >= 8)
      throw new OfficeError(
        "This beta supports up to eight configured agents.",
      );
    const id = randomUUID();
    if (defaults) settingsSchema.parse({ ...defaults, model, workspace });
    const profile = await this.factory.prepare(id, workspace, model, defaults);
    return this.registerAgent(id, name, workspace, model, profile);
  }
  private registerAgent(
    id: string,
    name: string,
    workspace: string,
    model: ModelId,
    profile: { profileHome: string; profileName: string },
    configRevision?: string,
  ) {
    const agent: OfficeAgent = {
      id,
      name,
      model,
      workspace,
      ...profile,
      configRevision,
      settingsVersion: 0,
      configHistory: [],
      avatarId: "unassigned",
      deskId: null,
      lifecycle: "stopped",
      work: "idle",
      freshness: "current",
      epoch: null,
      liveSessionId: null,
      storedSessionId: null,
      turnId: null,
      busy: false,
      conversations: [],
      messages: [],
      requests: [],
      receipts: [],
      error: null,
      createdAt: now(),
    };
    this.agents.set(id, agent);
    this.changed(agent, "agent.created");
    return structuredClone(agent);
  }
  async inspectProfile(profileHome: string) {
    return this.factory.profile({
      action: "read",
      profileHome,
    }) as Promise<ProfileSnapshot>;
  }
  async settings(id: string): Promise<ProfileSnapshot> {
    const agent = this.get(id);
    const snapshot = await this.inspectProfile(agent.profileHome);
    if (snapshot.ownerId !== id)
      throw new OfficeError(
        "Profile ownership changed. Settings are unavailable.",
      );
    return {
      ...snapshot,
      revision: `${snapshot.revision}:${agent.settingsVersion ?? 0}`,
    };
  }
  saveSettings(
    id: string,
    expectedRevision: string,
    values: ProfileSettings,
    name: string,
  ) {
    return this.trackMutation(
      this.saveProfileSettings(id, expectedRevision, values, name),
    );
  }
  private async saveProfileSettings(
    id: string,
    expectedRevision: string,
    values: ProfileSettings,
    name: string,
  ) {
    const agent = this.get(id);
    if (this.closing || this.settingsWriters.has(id))
      throw new OfficeError("A settings operation is already in progress.");
    if (
      this.runtimes.has(id) ||
      !["stopped", "failed"].includes(agent.lifecycle)
    )
      throw new OfficeError(
        "Stop the agent before saving profile settings. Changes apply at its next start.",
      );
    const [profileRevision, version] = expectedRevision.split(":");
    if (version !== String(agent.settingsVersion ?? 0))
      throw new OfficeError(
        "These settings were changed by another editor. Reload before saving.",
      );
    values = settingsSchema.parse(values);
    this.settingsWriters.add(id);
    try {
      const result = (await this.factory.profile({
        action: "save",
        agentId: id,
        profileHome: agent.profileHome,
        expectedRevision: profileRevision,
        values,
      })) as SettingsResult;
      // Record effective values only after readback, including a partially successful save.
      if (result.sections.model?.applied)
        agent.model = result.snapshot.values.model;
      if (result.sections.workspace?.applied)
        agent.workspace = result.snapshot.values.workspace;
      agent.name = name;
      agent.configRevision = result.snapshot.revision;
      agent.settingsVersion = (agent.settingsVersion ?? 0) + 1;
      (agent.configHistory ??= []).push({
        revision: agent.configRevision,
        at: now(),
        applied: Object.keys(result.sections).filter(
          (key) => result.sections[key as keyof ProfileSettings]?.applied,
        ),
        failed: Object.keys(result.sections).filter(
          (key) => !result.sections[key as keyof ProfileSettings]?.applied,
        ),
      });
      this.changed(agent, "settings.saved");
      return {
        ...result,
        snapshot: {
          ...result.snapshot,
          revision: `${result.snapshot.revision}:${agent.settingsVersion}`,
        },
      };
    } finally {
      this.settingsWriters.delete(id);
    }
  }
  adopt(
    name: string,
    profileHome: string,
    expectedRevision: string,
    values: ProfileSettings,
    acknowledgeOwnership: boolean,
  ) {
    if (this.agents.size + this.pendingCreations >= 8)
      throw new OfficeError(
        "This beta supports up to eight configured agents.",
      );
    this.pendingCreations++;
    return this.trackMutation(
      this.adoptProfile(
        name,
        profileHome,
        expectedRevision,
        values,
        acknowledgeOwnership,
      ).finally(() => this.pendingCreations--),
    );
  }
  private async adoptProfile(
    name: string,
    profileHome: string,
    expectedRevision: string,
    values: ProfileSettings,
    acknowledgeOwnership: boolean,
  ) {
    if (this.closing || this.agents.size >= 8)
      throw new OfficeError("This office cannot add another agent right now.");
    values = settingsSchema.parse(values);
    const id = randomUUID();
    const result = (await this.factory.profile({
      action: "adopt",
      profileHome,
      agentId: id,
      expectedRevision,
      values,
      acknowledgeOwnership,
    })) as SettingsResult;
    if (!result.ok) return { agent: null, result };
    const snapshot = result.snapshot;
    const agent = this.registerAgent(
      id,
      name,
      snapshot.values.workspace,
      values.model,
      { profileHome: snapshot.profileHome, profileName: snapshot.profileName },
      snapshot.revision,
    );
    return { agent, result };
  }
  private assertCurrent(agent: OfficeAgent, target: Target): RpcChild {
    if (
      agent.epoch !== target.epoch ||
      agent.liveSessionId !== target.sessionId
    )
      throw new OfficeError(
        "This conversation changed. Refresh before sending this command.",
      );
    const rpc = this.runtimes.get(agent.id);
    if (!rpc || agent.lifecycle !== "ready" || agent.freshness !== "current")
      throw new OfficeError(
        "The runtime is not ready or its state is unknown.",
      );
    return rpc;
  }
  async start(id: string) {
    const startup = this.startRuntime(id);
    this.startups.add(startup);
    try {
      await startup;
    } finally {
      this.startups.delete(startup);
    }
  }
  private async startRuntime(id: string) {
    const agent = this.get(id);
    if (this.closing) throw new OfficeError("Office is shutting down.");
    if (this.settingsWriters.has(id))
      throw new OfficeError(
        "Wait for the settings save to finish before starting.",
      );
    if (
      this.runtimes.has(id) ||
      ["starting", "stopping", "ready"].includes(agent.lifecycle)
    )
      throw new OfficeError(
        "This agent already has a runtime or a lifecycle operation in progress.",
      );
    agent.epoch = randomUUID();
    agent.liveSessionId = null;
    agent.lifecycle = "starting";
    agent.freshness = "current";
    agent.error = null;
    agent.work = "idle";
    agent.busy = false;
    for (const pending of attention(agent)) {
      pending.state = "lost";
      pending.reason = "Runtime was replaced.";
    }
    this.changed(agent, "runtime.starting");
    let rpc: RpcChild | undefined;
    try {
      const launch = await this.factory.launch(agent);
      if (this.closing) throw new Error("Office shutdown interrupted startup.");
      rpc = new RpcChild(launch);
      this.runtimes.set(id, rpc);
      const owner = rpc;
      rpc.on("frame", (frame) => {
        if (this.runtimes.get(id) === owner) this.frame(agent, owner, frame);
      });
      rpc.on("failure", () => {
        if (this.runtimes.get(id) !== owner || agent.lifecycle === "stopping")
          return;
        agent.freshness = "unknown";
        agent.work = "unknown";
        agent.error =
          "Runtime telemetry was lost. Known requests remain visible; uncertain commands are disabled.";
        this.changed(agent, "runtime.disconnected");
      });
      rpc.on("exit", () => {
        if (this.runtimes.get(id) !== owner) return;
        this.runtimes.delete(id);
        if (agent.lifecycle !== "stopping") {
          agent.lifecycle =
            agent.lifecycle === "starting" ? "failed" : "unknown";
          agent.freshness = "unknown";
          agent.busy = false;
          agent.work = "unknown";
          agent.error =
            "The owned runtime exited unexpectedly. Start a new runtime explicitly; the last task outcome is unknown.";
          for (const request of attention(agent)) {
            request.state = "lost";
            request.reason = "Owned runtime exited.";
          }
          this.changed(agent, "runtime.exited");
        }
      });
      await rpc.ready;
      await rpc.request("client.capabilities", { server_requests: true });
      const session = await rpc.request<{
        session_id: string;
        stored_session_id: string;
      }>("session.create", { cwd: agent.workspace });
      if (!session.session_id || !session.stored_session_id)
        throw new Error(
          "Hermes did not provide a valid live/stored session binding.",
        );
      agent.liveSessionId = session.session_id;
      agent.storedSessionId = session.stored_session_id;
      agent.conversations.push({
        epoch: agent.epoch!,
        liveSessionId: session.session_id,
        storedSessionId: session.stored_session_id,
        storedSessionIds: [session.stored_session_id],
        createdAt: now(),
      });
      agent.lifecycle = "ready";
      agent.work = "idle";
      agent.freshness = "current";
      this.changed(agent, "runtime.ready");
    } catch (error) {
      agent.lifecycle = "stopping";
      if (rpc) await rpc.stop();
      this.runtimes.delete(id);
      agent.lifecycle = "failed";
      agent.freshness = "unknown";
      agent.busy = false;
      agent.error =
        error instanceof Error ? error.message : "Runtime startup failed.";
      this.changed(agent, "runtime.start_failed");
      throw new OfficeError(agent.error, 503);
    }
  }
  private admit(
    agent: OfficeAgent,
    id: string,
    action: string,
    payload: unknown,
  ): Receipt | undefined {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ action, payload }))
      .digest("hex");
    const existing = this.store.command(agent.id, id);
    if (existing) {
      if (existing !== fingerprint)
        throw new OfficeError(
          "This command ID was already used for a different operation.",
        );
      const receipt = agent.receipts.find((r) => r.id === id);
      if (!receipt)
        throw new OfficeError(
          "This command was already admitted. It will not be submitted twice.",
        );
      return receipt;
    }
    const receipt: Receipt = {
      id,
      action,
      state: "pending",
      message: "Waiting for Hermes acknowledgement.",
      at: now(),
    };
    agent.receipts.push(receipt);
    this.store.save(agent, "command.pending", randomUUID(), {
      id,
      fingerprint,
    });
    this.emit("change");
  }
  async prompt(id: string, commandId: string, target: Target, prompt: string) {
    const agent = this.get(id);
    const prior = this.store.command(id, commandId);
    if (!prior) {
      this.assertCurrent(agent, target);
      if (agent.busy || attention(agent).length)
        throw new OfficeError(
          "This agent is busy. Answer its request or interrupt the task before sending another prompt.",
        );
    }
    const duplicate = this.admit(agent, commandId, "prompt", {
      target,
      prompt,
    });
    if (duplicate) return structuredClone(duplicate);
    const receipt = agent.receipts.at(-1)!;
    const rpc = this.assertCurrent(agent, target);
    agent.busy = true;
    agent.work = "working";
    agent.turnId = randomUUID();
    agent.error = null;
    agent.failureKind = null;
    agent.messages.push({
      id: commandId,
      epoch: agent.epoch!,
      turnId: agent.turnId,
      role: "user",
      text: prompt,
      state: "pending",
      at: now(),
      chunkIds: [],
    });
    this.changed(agent, "turn.submitting");
    try {
      const result = await rpc.request<{ status: string }>("prompt.submit", {
        session_id: target.sessionId,
        text: prompt,
      });
      if (result.status !== "streaming")
        throw new RpcFailure(
          "Hermes did not admit a foreground turn; admission needs reconciliation.",
          true,
        );
      receipt.state = "accepted";
      receipt.message = "Hermes accepted this task.";
      agent.messages.find((m) => m.id === commandId)!.state = "complete";
    } catch (error) {
      receipt.state =
        error instanceof RpcFailure && error.uncertain ? "unknown" : "failed";
      receipt.message =
        error instanceof Error ? error.message : "Task submission failed.";
      agent.messages.find((m) => m.id === commandId)!.state =
        receipt.state === "unknown" ? "unknown" : "failed";
      if (receipt.state === "unknown") {
        agent.freshness = "unknown";
        agent.work = "unknown";
      } else {
        agent.busy = false;
        agent.work = "failed";
      }
      agent.error = receipt.message;
    }
    this.changed(agent, "command.receipt");
    return structuredClone(receipt);
  }
  async interrupt(id: string, target: Target) {
    const agent = this.get(id);
    const rpc = this.assertCurrent(agent, target);
    if (!agent.busy && !attention(agent).length)
      throw new OfficeError("There is no foreground task to interrupt.");
    agent.work = "interrupting";
    this.changed(agent, "turn.interrupting");
    try {
      await rpc.request("session.interrupt", { session_id: target.sessionId });
    } catch {
      agent.freshness = "unknown";
      agent.error =
        "Interrupt was not acknowledged. The task outcome is unknown.";
      this.changed(agent, "turn.interrupt_unknown");
    }
  }
  async stop(id: string) {
    const agent = this.get(id);
    const rpc = this.runtimes.get(id);
    if (!rpc) {
      if (agent.lifecycle === "stopped") return;
      throw new OfficeError(
        "There is no verified child handle to stop. No process was signaled.",
      );
    }
    if (agent.lifecycle === "stopping")
      throw new OfficeError("A stop is already in progress.");
    agent.lifecycle = "stopping";
    this.changed(agent, "runtime.stopping");
    if (agent.busy && agent.liveSessionId)
      await rpc
        .request(
          "session.interrupt",
          { session_id: agent.liveSessionId },
          1_000,
        )
        .catch(() => {});
    const result = await rpc.stop();
    this.runtimes.delete(id);
    agent.lifecycle = "stopped";
    agent.freshness = "current";
    agent.busy = false;
    if (["working", "tool", "interrupting"].includes(agent.work))
      agent.work = "unknown";
    agent.error = result.forced
      ? "The runtime needed a forced stop after its grace period. The last task may be incomplete."
      : result.code !== null && result.code !== 0
        ? `Runtime stopped after an abnormal exit (code ${result.code}). The last task may be incomplete.`
        : result.signal && !["SIGTERM", "SIGINT"].includes(result.signal)
          ? `Runtime stopped after ${result.signal}. The last task may be incomplete.`
          : null;
    for (const pending of attention(agent)) {
      pending.state = "lost";
      pending.reason = "Runtime stopped.";
    }
    this.changed(agent, "runtime.stopped");
  }
  async reply(
    id: string,
    requestId: string,
    commandId: string,
    target: Target,
    answer: Record<string, unknown>,
  ) {
    const agent = this.get(id);
    const request = agent.requests.find((r) => r.id === requestId);
    const prior = this.store.command(id, commandId);
    if (!prior && (!request || request.state !== "open"))
      throw new OfficeError(
        "This request is no longer open or already has a delivered reply.",
      );
    if (!request) throw new OfficeError("Request not found.", 404);
    const rpc = this.assertCurrent(agent, target);
    if (
      request.epoch !== target.epoch ||
      request.sessionId !== target.sessionId
    )
      throw new OfficeError("This request belongs to a previous conversation.");
    if (request.kind === "unsupported")
      throw new OfficeError(
        "This private request type is not supported in the beta. Interrupt the task to continue safely.",
      );
    if (request.kind === "approval") {
      if (
        Object.keys(answer).length !== 1 ||
        typeof answer.choice !== "string" ||
        !request.choices.includes(answer.choice)
      )
        throw new OfficeError(
          "Choose one of the permissions offered by this request.",
          400,
        );
    } else if (request.questions.length) {
      const answers = answer.answers;
      if (
        Object.keys(answer).length !== 1 ||
        !answers ||
        typeof answers !== "object" ||
        Array.isArray(answers)
      )
        throw new OfficeError("Answer each question in this request.", 400);
      if (
        Object.keys(answers).length !== request.questions.length ||
        request.questions.some(
          (q) =>
            typeof (answers as Record<string, unknown>)[q.qid] !== "string",
        )
      )
        throw new OfficeError(
          "The batch answer must contain exactly these question IDs.",
          400,
        );
    } else if (
      Object.keys(answer).length !== 1 ||
      typeof answer.answer !== "string"
    )
      throw new OfficeError("Provide a text answer for this question.", 400);
    const duplicate = this.admit(agent, commandId, "reply", {
      requestId,
      target,
      answer,
    });
    if (duplicate) return structuredClone(duplicate);
    const receipt = agent.receipts.at(-1)!;
    request.state = "delivered";
    this.changed(agent, "request.delivering");
    try {
      rpc.response(request.frameId, answer);
      receipt.state = "accepted";
      receipt.message =
        "Reply delivered. Waiting for Hermes to confirm the request is closed.";
      await this.reconcileRequests(agent, rpc);
    } catch {
      receipt.state = "unknown";
      receipt.message =
        "Reply delivery is uncertain. It will not be sent again automatically.";
      agent.freshness = "unknown";
    }
    this.changed(agent, "reply.receipt");
    return structuredClone(receipt);
  }
  private async reconcileRequests(agent: OfficeAgent, rpc: RpcChild) {
    const delivered = new Set(
      agent.requests.filter((r) => r.state === "delivered").map((r) => r.id),
    );
    const replay = await rpc.request<{
      open_requests: { id: string | number }[];
    }>("session.events.since", { session_id: agent.liveSessionId });
    if (
      this.runtimes.get(agent.id) !== rpc ||
      !Array.isArray(replay.open_requests)
    )
      return;
    for (const request of agent.requests)
      if (
        delivered.has(request.id) &&
        request.state === "delivered" &&
        !replay.open_requests.some((r) => r.id === request.frameId)
      )
        request.state = "resolved";
    this.changed(agent, "requests.reconciled");
  }
  private assistant(agent: OfficeAgent, forceNew = false): ChatItem {
    const segments = agent.messages.filter(
      (m) => m.turnId === agent.turnId && m.role === "assistant",
    );
    const id = `assistant:${agent.turnId}:${segments.length}`;
    let message = forceNew
      ? undefined
      : segments.find((m) => m.state === "streaming");
    if (!message) {
      message = {
        id,
        epoch: agent.epoch!,
        turnId: agent.turnId!,
        role: "assistant",
        text: "",
        state: "streaming",
        at: now(),
        chunkIds: [],
      };
      agent.messages.push(message);
    }
    return message;
  }
  private frame(agent: OfficeAgent, rpc: RpcChild, frame: Frame) {
    const params = frame.params ?? {};
    if (params.session_id !== agent.liveSessionId) return;
    if (frame.id !== undefined && frame.method && frame.method !== "event") {
      const id = `${agent.epoch}:${typeof frame.id}:${frame.id}`;
      if (agent.requests.some((r) => r.id === id)) return;
      const kind =
        frame.method === "clarify"
          ? "clarify"
          : frame.method === "approval"
            ? "approval"
            : "unsupported";
      const questions =
        kind === "clarify" && Array.isArray(params.questions)
          ? params.questions.slice(0, 5).map((q: Record<string, unknown>) => ({
              qid: text(q.qid, 100),
              question: text(q.question),
              choices: strings(q.choices),
              multiSelect: q.multi_select === true,
            }))
          : [];
      const pending: PendingRequest = {
        id,
        frameId: frame.id,
        epoch: agent.epoch!,
        sessionId: agent.liveSessionId!,
        kind,
        innerId: kind === "approval" ? text(params.request_id, 200) : undefined,
        text:
          kind === "unsupported"
            ? "This task needs private input that BlueOffice does not support yet. Interrupt to end the wait."
            : kind === "approval"
              ? [text(params.description), text(params.command)]
                  .filter(Boolean)
                  .join("\n")
              : text(params.question),
        choices: kind === "unsupported" ? [] : strings(params.choices),
        questions,
        state: "open",
        at: now(),
      };
      agent.requests.push(pending);
      this.changed(agent, "request.open");
      return;
    }
    if (frame.method !== "event") return;
    const type = text(params.type, 100),
      payload = (params.payload ?? {}) as Record<string, unknown>;
    const key = `${agent.id}:${agent.epoch}:${params.seq ?? randomUUID()}`;
    if (this.store.hasEvent(key)) return;
    switch (type) {
      case "session.info":
        if (typeof payload.running === "boolean") agent.busy = payload.running;
        if (typeof payload.stored_session_id === "string") {
          agent.storedSessionId = payload.stored_session_id;
          const conversation = agent.conversations.find(
            (c) => c.epoch === agent.epoch,
          );
          if (conversation) {
            conversation.storedSessionId = payload.stored_session_id;
            if (
              !conversation.storedSessionIds.includes(payload.stored_session_id)
            )
              conversation.storedSessionIds.push(payload.stored_session_id);
          }
        }
        break;
      case "message.delta":
        if (!agent.turnId) return;
        this.assistant(agent).text += text(payload.text, Infinity);
        this.assistant(agent).chunkIds.push(key);
        break;
      case "message.interim": {
        if (!agent.turnId) return;
        const message = this.assistant(
          agent,
          payload.already_streamed === false,
        );
        message.text = text(payload.text, Infinity) || message.text;
        message.state = "complete";
        message.chunkIds.push(key);
        break;
      }
      case "message.complete": {
        if (!agent.turnId) return;
        const outcome =
          payload.status === "complete"
            ? "completed"
            : payload.status === "interrupted"
              ? "interrupted"
              : ["error", "failed"].includes(text(payload.status))
                ? "failed"
                : "unknown";
        agent.work = outcome;
        const message = this.assistant(agent);
        message.text = text(payload.text, Infinity) || message.text;
        message.chunkIds.push(key);
        message.state = outcome === "completed" ? "complete" : outcome;
        for (const tool of agent.messages.filter(
          (m) =>
            m.turnId === agent.turnId &&
            m.role === "tool" &&
            m.state === "streaming",
        )) {
          tool.state = outcome === "interrupted" ? "interrupted" : "unknown";
          tool.text =
            outcome === "interrupted"
              ? `${tool.toolName} interrupted`
              : `${tool.toolName} outcome unavailable`;
        }
        if (outcome === "failed") {
          const failure = turnFailure(payload);
          agent.error = failure.message;
          agent.failureKind = failure.kind;
          // Provider error bodies can contain credentials; publish only classified copy.
          message.text = failure.message;
        }
        // Completion can precede native foreground release. Re-read the authoritative snapshot.
        const completedTurn = agent.turnId;
        void rpc
          .request<{ running?: boolean }>("session.activate", {
            session_id: agent.liveSessionId,
          })
          .then((snapshot) => {
            if (
              this.runtimes.get(agent.id) === rpc &&
              agent.turnId === completedTurn &&
              snapshot.running === false
            ) {
              agent.busy = false;
              this.changed(agent, "turn.reconciled");
            }
          })
          .catch(() => {});
        void this.reconcileRequests(agent, rpc).catch(() => {});
        break;
      }
      case "tool.start": {
        if (!agent.turnId) return;
        agent.work = "tool";
        const id = `tool:${agent.turnId}:${text(payload.tool_id, 200)}`;
        if (!agent.messages.some((m) => m.id === id))
          agent.messages.push({
            id,
            epoch: agent.epoch!,
            turnId: agent.turnId,
            role: "tool",
            toolName: text(payload.name, 100),
            text: `Running ${text(payload.name, 100)}`,
            state: "streaming",
            at: now(),
            chunkIds: [key],
          });
        break;
      }
      case "tool.complete": {
        const tool = agent.messages.find(
          (m) => m.id === `tool:${agent.turnId}:${text(payload.tool_id, 200)}`,
        );
        // Tool args/results may contain passwords or private files. Show only public tool lifecycle.
        if (tool) {
          tool.state = "complete";
          tool.text = `${tool.toolName} returned`;
          tool.chunkIds.push(key);
        }
        if (
          !["completed", "failed", "interrupted", "interrupting"].includes(
            agent.work,
          )
        )
          agent.work = "working";
        break;
      }
      case "request.cancel": {
        const request = agent.requests.find(
          (r) => r.epoch === agent.epoch && r.frameId === payload.id,
        );
        if (request && ["open", "delivered"].includes(request.state)) {
          request.state = "expired";
          request.reason = text(payload.reason, 100);
        }
        break;
      }
      case "error":
        agent.error =
          "Hermes reported a runtime error. The task outcome remains unknown until terminal evidence arrives.";
        break;
      default:
        return; // Hidden reasoning, internal prompts and unknown events never enter the UI journal.
    }
    this.changed(agent, type, key);
  }
  async shutdown() {
    this.closing = true;
    await Promise.allSettled(
      [...this.runtimes.keys()].map((id) => this.stop(id)),
    );
    // Discovery/profile verification can still be awaiting IO before a child exists.
    // Keep the store alive until those starts observe closing and record their outcome.
    await Promise.allSettled([...this.startups, ...this.mutations]);
  }
}
