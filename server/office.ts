import { completeWorkstation } from "../shared/layout.js";
import { setupPlacementSchema, type SetupPlacement } from "../shared/setup.js";
import type { AssetRef } from "../shared/assets.js";
import { recoverHistory, prepareRecoverySnapshot } from "./recovery.js";
import { availableDesk } from "../shared/scene.js";
import { LayoutService } from "./layout.js";
import type { LayoutSnapshot } from "../shared/layout.js";
import type { EventBatch } from "../shared/events.js";
import { parseApproval } from "./approval.js";
import {
  APPROVAL_CHOICES,
  approvalLabel,
  type ApprovalChoice,
} from "../shared/approval.js";
import {
  parseClarification,
  singleQuestion,
  validClarificationAnswer,
} from "../shared/clarification.js";
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
  assignAvatar(id: string, ref: AssetRef | null) {
    const agent = this.get(id);
    agent.avatar = ref;
    agent.avatarId = ref?.assetId ?? "unassigned";
    this.changed(agent, "avatar.assigned");
    return agent;
  }
  readonly layouts: LayoutService;
  layout(): LayoutSnapshot {
    const layout = this.layouts.snapshot();
    const stored = new Map(
      this.store.agents().map((agent) => [agent.id, agent]),
    );
    for (const agent of this.agents.values()) {
      agent.deskId = layout.assignments[agent.id] ?? null;
      const saved = stored.get(agent.id);
      if (saved) {
        agent.avatar = saved.avatar;
        agent.avatarId = saved.avatarId;
      }
    }
    return layout;
  }
  layoutChanged() {
    const layout = this.layout();
    this.emit("change");
    return layout;
  }
  assertLayoutWritable() {
    if (this.closing) throw new OfficeError("Office is shutting down.");
    if (this.setupReservations.size)
      throw new OfficeError(
        "Wait for assistant setup to finish before editing the layout.",
      );
  }
  saveLayout(input: unknown) {
    this.assertLayoutWritable();
    this.layouts.save(input);
    const layout = this.layout();
    this.emit("change");
    return layout;
  }
  private agents = new Map<string, OfficeAgent>();
  private runtimes = new Map<string, RpcChild>();
  private closing = false;
  private reconciliations = new Map<string, Promise<void>>();
  private startups = new Set<Promise<void>>();
  private mutations = new Set<Promise<unknown>>();
  private pendingCreations = 0;
  private setupReservations = new Map<string, SetupPlacement>();
  private reserveSetup(placement?: SetupPlacement) {
    if (placement) placement = setupPlacementSchema.parse(placement);
    const used = [...this.agents.values()].map((agent) => agent.deskId);
    used.push(
      ...[...this.setupReservations.values()].map((value) => value.deskId),
    );
    const selected = placement ?? {
      avatar: null,
      deskId: this.layouts.availableDesk(used),
    };
    if (selected.deskId !== null) {
      const desk = this.layouts
        .snapshot()
        .placements.find((p) => p.id === selected.deskId);
      if (!desk || !completeWorkstation(desk))
        throw new OfficeError(
          "Choose an existing complete workstation or explicitly leave this assistant unassigned.",
        );
      if (used.includes(selected.deskId))
        throw new OfficeError(
          "This workstation is already assigned or reserved. Choose another workstation.",
        );
    }
    const token = randomUUID();
    this.setupReservations.set(token, structuredClone(selected));
    return { token, placement: selected };
  }
  private trackMutation<T>(work: Promise<T>): Promise<T> {
    this.mutations.add(work);
    return work.finally(() => this.mutations.delete(work));
  }
  private settingsWriters = new Set<string>();
  private activeAdoptions = new Set<string>();
  private recovering?: Promise<void>;
  recoverAdoptions(): Promise<void> {
    return (this.recovering ??= this.recoverPendingAdoptions().finally(() => {
      this.recovering = undefined;
    }));
  }
  private async recoverPendingAdoptions() {
    for (const intent of this.store.adoptions()) {
      if (this.activeAdoptions.has(intent.profileHome)) continue;
      let reservation: ReturnType<Office["reserveSetup"]> | undefined;
      try {
        if (!this.agents.has(intent.id)) {
          reservation = this.reserveSetup(intent.placement);
          const snapshot = (await this.factory.profile({
            action: "read",
            profileHome: intent.profileHome,
          })) as ProfileSnapshot;
          if (snapshot.ownerId !== intent.id) continue;
          this.registerAgent(
            intent.id,
            intent.name,
            intent.workspace,
            intent.model,
            {
              profileHome: snapshot.profileHome,
              profileName: snapshot.profileName,
            },
            snapshot.revision,
            reservation.placement,
          );
        }
        this.store.finishAdoption(intent.profileHome);
      } catch {
        /* Keep the durable intent visible for explicit inspection/retry. */
      } finally {
        if (reservation) this.setupReservations.delete(reservation.token);
      }
    }
  }
  constructor(
    private store: OfficeStore,
    readonly factory: RuntimeFactory,
  ) {
    super();
    this.layouts = new LayoutService(store);
    const savedLayout = store.hasSavedLayout();
    if (savedLayout) this.layouts.snapshot();
    const savedAgents = store.agents();
    const usedDesks = savedAgents.map((agent) => agent.deskId);
    for (const agent of savedAgents) {
      const needsDesk = !savedLayout && !agent.deskId;
      if (needsDesk) {
        agent.deskId = availableDesk(usedDesks);
        usedDesks.push(agent.deskId);
      }
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
          request.freshness = "unknown";
          request.reason = "Previous runtime ownership is unknown.";
          if (request.decision?.delivery === "pending")
            request.decision.delivery = "unknown";
          for (const q of request.questions)
            if (q.state === "pending") q.state = "unknown";
        }
        for (const receipt of agent.receipts)
          if (receipt.state === "pending") {
            receipt.state = "unknown";
            receipt.message =
              "Supervisor restarted before acknowledgement. Not retried.";
          }
        this.changed(agent, "recovery");
      } else if (needsDesk) {
        this.changed(agent, "desk.assigned");
      }
    }
  }
  snapshot(): Snapshot {
    const layout = this.layout();
    return {
      layout,
      ...this.store.checkpoint(),
      mode: this.factory.mode,
      routes: this.factory.routes(),
      pendingAdoptions: this.store
        .adoptions()
        .map(({ name, profileHome }) => ({ name, profileHome })),
    };
  }
  eventsSince(revision: number, journalId: string): EventBatch | undefined {
    const snapshot = this.snapshot();
    if (journalId !== snapshot.journalId) return undefined;
    const events = this.store.since(revision);
    if (!events) return undefined;
    return {
      journalId,
      from: revision,
      to: snapshot.revision,
      events,
      context: {
        routes: snapshot.routes,
        mode: snapshot.mode,
        pendingAdoptions: snapshot.pendingAdoptions,
        layout: snapshot.layout,
      },
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
    placement?: SetupPlacement,
  ) {
    if (this.agents.size + this.pendingCreations >= 8)
      throw new OfficeError(
        "This beta supports up to eight configured agents.",
      );
    const reservation = this.reserveSetup(placement);
    this.pendingCreations++;
    return this.trackMutation(
      this.createAgent(
        name,
        workspace,
        model,
        defaults,
        reservation.placement,
      ).finally(() => {
        this.pendingCreations--;
        this.setupReservations.delete(reservation.token);
      }),
    );
  }
  private async createAgent(
    name: string,
    workspace: string,
    model: ModelId = "glm-5.3-flash",
    defaults?: ProfileDefaults,
    placement?: SetupPlacement,
  ) {
    if (this.closing) throw new OfficeError("Office is shutting down.");
    if (this.agents.size >= 8)
      throw new OfficeError(
        "This beta supports up to eight configured agents.",
      );
    const id = randomUUID();
    if (defaults) settingsSchema.parse({ ...defaults, model, workspace });
    const profile = await this.factory.prepare(id, workspace, model, defaults);
    const snapshot = (await this.factory.profile({
      action: "read",
      profileHome: profile.profileHome,
    })) as ProfileSnapshot;
    return this.registerAgent(
      id,
      name,
      workspace,
      model,
      profile,
      snapshot.revision,
      placement,
    );
  }
  private registerAgent(
    id: string,
    name: string,
    workspace: string,
    model: ModelId,
    profile: { profileHome: string; profileName: string },
    configRevision?: string,
    placement?: SetupPlacement,
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
      avatar: placement?.avatar,
      avatarId: placement?.avatar?.assetId ?? "unassigned",
      deskId: placement
        ? placement.deskId
        : this.layouts.availableDesk(
            [...this.agents.values()].map((agent) => agent.deskId),
          ),
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
    this.store.save(agent, "agent.created", randomUUID());
    this.agents.set(id, agent);
    this.emit("change");
    return structuredClone(agent);
  }
  async inspectProfile(profileHome: string) {
    await this.recoverAdoptions();
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
    placement?: SetupPlacement,
  ) {
    if (this.agents.size + this.pendingCreations >= 8)
      throw new OfficeError(
        "This beta supports up to eight configured agents.",
      );
    const reservation = this.reserveSetup(placement);
    this.pendingCreations++;
    return this.trackMutation(
      this.adoptProfile(
        name,
        profileHome,
        expectedRevision,
        values,
        acknowledgeOwnership,
        reservation.placement,
      ).finally(() => {
        this.pendingCreations--;
        this.setupReservations.delete(reservation.token);
      }),
    );
  }
  private async adoptProfile(
    name: string,
    profileHome: string,
    expectedRevision: string,
    values: ProfileSettings,
    acknowledgeOwnership: boolean,
    placement?: SetupPlacement,
  ) {
    if (this.closing || this.agents.size >= 8)
      throw new OfficeError("This office cannot add another agent right now.");
    values = settingsSchema.parse(values);
    if (!acknowledgeOwnership)
      throw new OfficeError(
        "Confirm the managed single-writer policy before adopting this profile.",
      );
    const inspected = await this.inspectProfile(profileHome);
    profileHome = inspected.profileHome;
    if (inspected.managed)
      throw new OfficeError(
        "This canonical profile is already assigned to an office agent.",
      );
    if (inspected.revision !== expectedRevision)
      throw new OfficeError(
        "Profile changed outside this editor. Reload and review before adopting.",
      );
    if (inspected.liveOwner)
      throw new OfficeError(
        "This profile has a live owner. Stop it before adopting.",
      );
    if (this.activeAdoptions.has(profileHome))
      throw new OfficeError("This profile adoption is already in progress.");
    const previous = this.store
      .adoptions()
      .find((intent) => intent.profileHome === profileHome);
    const id = previous?.id ?? randomUUID();
    this.activeAdoptions.add(profileHome);
    try {
      // Persist the owner association before the helper can publish its ownership marker.
      this.store.beginAdoption({
        id,
        name,
        profileHome,
        model: values.model,
        workspace: values.workspace,
        placement,
      });
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
        {
          profileHome: snapshot.profileHome,
          profileName: snapshot.profileName,
        },
        snapshot.revision,
        placement,
      );
      this.store.finishAdoption(profileHome);
      this.emit("change");
      return { agent, result };
    } finally {
      this.activeAdoptions.delete(profileHome);
    }
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
    const previousBinding = {
      epoch: agent.epoch,
      liveSessionId: agent.liveSessionId,
      replay: agent.replay,
    };
    agent.replay = undefined;
    agent.epoch = randomUUID();
    agent.liveSessionId = null;
    agent.lifecycle = "starting";
    agent.freshness = "current";
    agent.error = null;
    agent.work = "idle";
    agent.busy = false;
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
      rpc.on("gap", (sessionId: string) => {
        if (
          this.runtimes.get(id) === owner &&
          sessionId === agent.liveSessionId
        ) {
          agent.freshness = "unknown";
          for (const request of attention(agent)) request.freshness = "unknown";
          this.changed(agent, "recovery.gap");
          void this.reconcileRequests(agent, owner).catch(() => {});
        }
      });
      rpc.on("failure", () => {
        if (this.runtimes.get(id) !== owner || agent.lifecycle === "stopping")
          return;
        agent.freshness = "unknown";
        agent.work = "unknown";
        for (const request of attention(agent)) request.freshness = "unknown";
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
            request.freshness = "unknown";
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
      for (const pending of attention(agent)) {
        if (pending.epoch !== agent.epoch) {
          pending.state = "lost";
          pending.reason = "Runtime was replaced.";
        }
      }
      this.changed(agent, "runtime.ready");
    } catch (error) {
      agent.lifecycle = "stopping";
      if (rpc) await rpc.stop();
      this.runtimes.delete(id);
      agent.lifecycle = "failed";
      agent.epoch = previousBinding.epoch;
      agent.liveSessionId = previousBinding.liveSessionId;
      agent.replay = previousBinding.replay;
      for (const request of attention(agent)) request.freshness = "unknown";
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
  async lockAnswer(
    id: string,
    requestId: string,
    commandId: string,
    target: Target,
    questionId: string,
    answer: string,
  ) {
    const agent = this.get(id);
    const payload = { requestId, target, questionId, answer };
    if (this.store.command(id, commandId))
      return structuredClone(
        this.admit(agent, commandId, "answer-question", payload)!,
      );
    const rpc = this.assertCurrent(agent, target);
    const request = agent.requests.find(
      (r) =>
        r.id === requestId &&
        r.epoch === target.epoch &&
        r.sessionId === target.sessionId,
    );
    if (!request || request.state !== "open")
      throw new OfficeError("This request is no longer open.");
    const q = request.questions.find((q) => q.qid === questionId);
    if (request.kind !== "clarify" || typeof request.frameId !== "string" || !q)
      throw new OfficeError(
        "This request does not support that question lock.",
        400,
      );
    if (
      q.state === "locked" ||
      request.questions.some(
        (q) => q.state === "pending" || q.state === "unknown",
      )
    )
      throw new OfficeError(
        "This answer is already locked or another answer is awaiting confirmation.",
      );
    if (!validClarificationAnswer(q, answer))
      throw new OfficeError(
        "Provide a permitted answer for this question.",
        400,
      );
    this.admit(agent, commandId, "answer-question", payload);
    const receipt = agent.receipts.at(-1)!;
    q.state = "pending";
    q.answer = answer;
    this.changed(agent, "question.pending");
    try {
      const result = await rpc.request<{
        status: string;
        remaining?: string[];
      }>("clarify.lock", {
        request_id: request.frameId,
        question_id: q.qid,
        answer,
      });
      if (result.status === "expired") {
        q.state = "open";
        request.state = "expired";
        request.reason = "Hermes reports that this request has expired.";
        receipt.state = "failed";
        receipt.message = request.reason;
      } else if (
        result.status === "ok" &&
        Array.isArray(result.remaining) &&
        result.remaining.every((id) =>
          request.questions.some((q) => q.qid === id),
        ) &&
        !result.remaining.includes(q.qid)
      ) {
        q.state = "locked";
        receipt.state = "accepted";
        receipt.message = "Hermes confirmed this question's answer.";
        if (!result.remaining.length && request.state === "open") {
          request.state = "resolved"; // The final lock has an explicit native admission acknowledgement.
        }
      } else throw new RpcFailure("Invalid question acknowledgement.", true);
    } catch (error) {
      const uncertain = !(error instanceof RpcFailure) || error.uncertain;
      q.state = uncertain ? "unknown" : "open";
      receipt.state = uncertain ? "unknown" : "failed";
      receipt.message = uncertain
        ? "Question delivery is uncertain. It will not be sent again automatically."
        : "Hermes rejected this answer. Review the question before trying again.";
      if (uncertain) request.freshness = "unknown";
    }
    this.changed(agent, "question.receipt");
    return structuredClone(receipt);
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
    if (prior)
      return structuredClone(
        this.admit(agent, commandId, "reply", { requestId, target, answer })!,
      );
    if (!request || request.state !== "open")
      throw new OfficeError(
        "This request is no longer open or already has a delivered reply.",
      );
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
        !APPROVAL_CHOICES.includes(answer.choice as ApprovalChoice) ||
        !request.innerId ||
        request.responseSchema !== "hermes.approval.v1" ||
        !request.choices.includes(answer.choice)
      )
        throw new OfficeError(
          "Choose one of the permissions offered by this request.",
          400,
        );
    } else if (request.questions.length) {
      const answers = answer.answers;
      const remaining = request.questions.filter((q) => q.state !== "locked");
      if (
        request.questions.some(
          (q) => q.state === "pending" || q.state === "unknown",
        )
      )
        throw new OfficeError(
          "A question answer is awaiting confirmation. Do not submit it again.",
        );
      if (
        Object.keys(answer).length !== 1 ||
        !answers ||
        typeof answers !== "object" ||
        Array.isArray(answers) ||
        Object.keys(answers).length !== remaining.length ||
        remaining.some((q) => !Object.hasOwn(answers, q.qid))
      )
        throw new OfficeError(
          "The batch answer must contain exactly these unanswered question IDs.",
          400,
        );
      if (
        remaining.some(
          (q) =>
            !validClarificationAnswer(
              q,
              (answers as Record<string, unknown>)[q.qid],
            ),
        )
      )
        throw new OfficeError(
          "Provide a permitted answer for each unanswered question.",
          400,
        );
    } else if (
      Object.keys(answer).length !== 1 ||
      !validClarificationAnswer(singleQuestion(request), answer.answer)
    )
      throw new OfficeError(
        "Provide a permitted answer for this question.",
        400,
      );
    const duplicate = this.admit(agent, commandId, "reply", {
      requestId,
      target,
      answer,
    });
    if (duplicate) return structuredClone(duplicate);
    const receipt = agent.receipts.at(-1)!;
    request.state = "delivered";
    if (request.kind === "approval") {
      request.decision = {
        choice: answer.choice as ApprovalChoice,
        commandId,
        at: now(),
        delivery: "pending",
      };
    }
    if (request.kind === "clarify") {
      if (request.questions.length) {
        const answers = answer.answers as Record<string, string>;
        for (const q of request.questions)
          if (q.state !== "locked") q.answer = answers[q.qid];
      } else request.answer = answer.answer as string;
    }
    this.changed(agent, "request.delivering");
    try {
      rpc.response(request.frameId, answer);
      if (request.decision) request.decision.delivery = "delivered";
      receipt.state = "accepted";
      receipt.message = request.decision
        ? `Decision recorded: ${approvalLabel[request.decision.choice]}. Reply delivered; waiting for Hermes to confirm closure.`
        : "Reply delivered. Waiting for Hermes to confirm the request is closed.";
      await this.reconcileRequests(agent, rpc);
    } catch {
      if (request.decision) request.decision.delivery = "unknown";
      request.freshness = "unknown";
      receipt.state = "unknown";
      receipt.message =
        "Reply delivery is uncertain. It will not be sent again automatically.";
      agent.freshness = "unknown";
    }
    this.changed(agent, "reply.receipt");
    return structuredClone(receipt);
  }
  async reconcileAll() {
    await Promise.allSettled(
      [...this.runtimes].map(([id, rpc]) => {
        const agent = this.get(id);
        return agent.lifecycle === "ready"
          ? this.reconcileRequests(agent, rpc)
          : Promise.resolve();
      }),
    );
  }
  private reconcileRequests(agent: OfficeAgent, rpc: RpcChild): Promise<void> {
    const existing = this.reconciliations.get(agent.id);
    if (existing) return existing;
    // Defer work so synchronous replay-triggered frames see the coalesced operation.
    const work = Promise.resolve()
      .then(() => this.reconcileRuntime(agent, rpc))
      .finally(() => {
        if (this.reconciliations.get(agent.id) === work)
          this.reconciliations.delete(agent.id);
      });
    this.reconciliations.set(agent.id, work);
    return work;
  }
  private async reconcileRuntime(agent: OfficeAgent, rpc: RpcChild) {
    const session = agent.liveSessionId;
    const turn = agent.turnId;
    const known = new Set(attention(agent).map((r) => r.id));
    const current = () =>
      this.runtimes.get(agent.id) === rpc &&
      agent.liveSessionId === session &&
      agent.turnId === turn &&
      agent.lifecycle === "ready";
    if (!session || !current()) return;
    try {
      let replay = await rpc.replay(session);
      if (!current()) return;
      const gap =
        replay.truncated === true ||
        rpc.sequence.cursor(session) < replay.latest_seq;
      let snapshot: Record<string, unknown> | undefined;
      if (gap) {
        agent.freshness = "unknown";
        for (const request of attention(agent)) request.freshness = "unknown";
        this.changed(agent, "recovery.checkpoint_pending");
        // Hermes does not provide an atomic snapshot watermark. Accept a public snapshot
        // only across a quiet native sequence interval; never label missing outcomes complete.
        for (let attempt = 0; attempt < 3; attempt++) {
          const before = await rpc.replay(session, false);
          const candidate: Record<string, unknown> = await rpc.request<
            Record<string, unknown>
          >("session.activate", { session_id: session }, 1200);
          const after = await rpc.replay(session, false);
          if (!current()) return;
          if (
            before.epoch === after.epoch &&
            before.latest_seq === after.latest_seq &&
            rpc.sequence.cursor(session) <= after.latest_seq &&
            candidate.session_id === session &&
            typeof candidate.running === "boolean"
          ) {
            snapshot = candidate;
            replay = after;
            break;
          }
        }
        if (!snapshot)
          throw new Error("Native snapshot changed during recovery.");
        if (
          !Array.isArray(snapshot.messages) ||
          snapshot.messages_omitted === true
        )
          throw new Error("Native checkpoint omitted public history.");
        snapshot = prepareRecoverySnapshot(agent, snapshot);
        rpc.prepareCheckpoint(session, snapshot);
        recoverHistory(agent, snapshot, true);
        agent.work = "unknown";
        agent.busy = snapshot.running === true;
        // Commit the checkpoint before releasing any buffered later events.
        agent.replay = { epoch: replay.epoch, sequence: replay.latest_seq };
        this.changed(agent, "recovery.checkpoint");
        rpc.checkpoint(session, replay.latest_seq);
      } else {
        snapshot = await rpc.request<Record<string, unknown>>(
          "session.activate",
          { session_id: session },
          1200,
        );
        if (!current()) return;
        // A running=false snapshot only releases admission; it cannot prove task success.
        if (snapshot.running === false) agent.busy = false;
      }
      if (!current()) return;
      for (const frame of replay.open_requests) {
        if (frame.params?.session_id !== session || frame.method === "event")
          continue;
        this.frame(agent, rpc, { ...frame, jsonrpc: "2.0" });
        const pending = agent.requests.find(
          (r) => r.epoch === agent.epoch && r.frameId === frame.id,
        );
        if (!pending || !["open", "delivered"].includes(pending.state))
          continue;
        const parsed =
          frame.method === "clarify"
            ? parseClarification(frame.params)
            : undefined;
        if (parsed)
          for (const question of pending.questions) {
            const native = parsed.questions.find((q) => q.qid === question.qid);
            if (native?.state === "locked")
              Object.assign(question, {
                state: "locked",
                answer: native.answer,
              });
          }
        // Unknown reply delivery never becomes permission to resend a one-shot answer.
        pending.freshness =
          pending.decision?.delivery === "unknown" ||
          pending.questions.some((q) => q.state === "unknown")
            ? "unknown"
            : "current";
      }
      for (const pending of attention(agent)) {
        if (
          !known.has(pending.id) ||
          replay.open_requests.some((r) => r.id === pending.frameId)
        )
          continue;
        pending.state =
          !gap && pending.state === "delivered" ? "resolved" : "lost";
        pending.freshness = "current";
        pending.reason =
          "Hermes no longer reports this request as open. Missing outcome was not replayed.";
      }
      if (rpc.sequence.hasGap(session))
        throw new Error("Native events still have a gap.");
      agent.replay = {
        epoch: replay.epoch,
        sequence: rpc.sequence.cursor(session),
      };
      agent.freshness = "current";
      if (!gap && agent.work === "unknown") {
        const terminal = agent.terminal;
        if (terminal?.epoch === agent.epoch && terminal.turnId === turn)
          agent.work = terminal.outcome;
      }
      this.changed(agent, "requests.reconciled");
    } catch (error) {
      if (current()) {
        agent.freshness = "unknown";
        for (const request of attention(agent)) request.freshness = "unknown";
        agent.error =
          "Recovery could not confirm current runtime state. Known history and requests are retained; commands were not resent.";
        this.changed(agent, "recovery.unknown");
      }
      throw error;
    }
  }
  private assistant(agent: OfficeAgent, forceNew = false): ChatItem {
    const segments = agent.messages.filter(
      (m) => m.turnId === agent.turnId && m.role === "assistant",
    );
    const id = `assistant:${agent.turnId}:${segments.length}`;
    let message = forceNew
      ? undefined
      : (segments.find((m) => m.id === agent.activeMessageId) ??
        segments.find((m) => m.state === "streaming"));
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
    agent.activeMessageId = message.id;
    return message;
  }
  private frame(agent: OfficeAgent, rpc: RpcChild, frame: Frame) {
    const params = frame.params ?? {};
    if (params.session_id !== agent.liveSessionId) return;
    if (
      (typeof frame.id === "string" ||
        (typeof frame.id === "number" && Number.isSafeInteger(frame.id))) &&
      frame.method &&
      frame.method !== "event"
    ) {
      const id = `${agent.epoch}:${typeof frame.id}:${frame.id}`;
      if (agent.requests.some((r) => r.id === id)) return;
      const clarification =
        frame.method === "clarify" ? parseClarification(params) : undefined;
      const approval =
        frame.method === "approval" ? parseApproval(params) : undefined;
      const kind = clarification
        ? "clarify"
        : approval
          ? "approval"
          : "unsupported";
      const pending: PendingRequest = {
        id,
        frameId: frame.id,
        epoch: agent.epoch!,
        sessionId: agent.liveSessionId!,
        kind,
        text:
          kind === "unsupported"
            ? "This request uses an input format BlueOffice does not support yet. Interrupt to end the wait."
            : text(params.question),
        choices: kind === "unsupported" ? [] : strings(params.choices),
        questions: [],
        ...clarification,
        ...approval,
        freshness: "current",
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
    if (typeof params.seq === "number" && rpc.replayEpoch)
      agent.replay = { epoch: rpc.replayEpoch, sequence: params.seq };
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
        this.assistant(agent).streamed = true;
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
        message.streamed = payload.already_streamed !== false;
        agent.activeMessageId = null;
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
        agent.terminal = { epoch: agent.epoch!, turnId: agent.turnId, outcome };
        const message = this.assistant(agent);
        message.text = text(payload.text, Infinity) || message.text;
        message.chunkIds.push(key);
        message.state = outcome === "completed" ? "complete" : outcome;
        agent.activeMessageId = null;
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
          request.state =
            payload.reason === "resolved" ? "resolved" : "expired";
          request.freshness = "current";
          request.reason = text(payload.reason, 100);
        }
        break;
      }
      case "error":
        agent.error =
          "Hermes reported a runtime error. The task outcome remains unknown until terminal evidence arrives.";
        break;
      default:
        return; // Only the sequence advances; private event payloads are never journaled.
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
    await Promise.allSettled([
      ...this.startups,
      ...this.mutations,
      ...this.reconciliations.values(),
    ]);
  }
}
