/** Reproducible actual office benchmark. Owns all temporary data/processes; never reads existing profiles. */
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { Office } from "../server/office.ts";
import { OfficeStore } from "../server/store.ts";
import { FixtureRuntime } from "../server/fixture-runtime.ts";
import { RpcChild } from "../server/rpc.ts";
import { CharacterRegistry } from "../server/assets.ts";
import { officeServer } from "../server/http.ts";
import { attention } from "../shared/office.ts";
import { layoutInventory } from "../shared/layout.ts";
import { sourceIdentity } from "./verification-evidence.mjs";
import { percentile } from "../shared/scene-quality.ts";
const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const output = resolve(
  option("--output", `artifacts/performance/browser-${Date.now()}`),
);
const manifestPath = option("--manifest");
if (!manifestPath)
  throw new Error(
    "--manifest requires a locally reviewed private intended asset manifest; no GLB bytes enter Git.",
  );
const hardware = !process.argv.includes("--software");
const functionalOnly = process.argv.includes("--functional-only");
const sampleSeconds = Number(option("--seconds", "10"));
if (
  !Number.isFinite(sampleSeconds) ||
  sampleSeconds < (functionalOnly ? 1 : 3) ||
  sampleSeconds > 30
)
  throw new Error(
    "Use 3–30-second measurements, or 1–30 seconds with --functional-only.",
  );
await mkdir(output, { recursive: true });
const data = await mkdtemp(join(tmpdir(), "blueoffice-performance-"));
const store = new OfficeStore(join(data, "office.db"));
const office = new Office(store, new FixtureRuntime(data));
const registry = new CharacterRegistry(store, join(data, "characters"));
const receipts = [];
const ingest = RpcChild.prototype.ingest;
RpcChild.prototype.ingest = function (frame) {
  if (["clarify", "approval"].includes(frame.method))
    receipts.push({
      sessionId: frame.params.session_id,
      frameId: frame.id,
      method: frame.method,
      serverReceivedAt: performance.timeOrigin + performance.now(),
    });
  return ingest.call(this, frame);
};
const app = officeServer(office, resolve("dist"), registry);
const dispatch = app.server.listeners("request")[0];
app.server.removeAllListeners("request");
app.server.on("request", (req, res) => {
  if (req.url === "/performance/clock" || req.url === "/performance/receipts") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify(
        req.url.endsWith("clock")
          ? { now: performance.timeOrigin + performance.now() }
          : receipts,
      ),
    );
  } else dispatch(req, res);
});
let browser;
let chromeProcess;
let benchmarkPage;
const report = {
  source: await sourceIdentity(),
  passed: false,
  hardwareClaim: hardware && !functionalOnly,
  functionalOnly,
  viewport: { width: 1440, height: 900 },
  sampleSeconds,
  phases: [],
  errors: [],
  startedAt: new Date().toISOString(),
};
try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const pack = await registry.import({
    manifest,
    files: await Promise.all(
      manifest.files.map(async (file) => ({
        path: file.path,
        base64: (
          await readFile(resolve(manifestPath, "..", file.path))
        ).toString("base64"),
      })),
    ),
  });
  registry.review({
    ref: pack.ref,
    clips: [...new Set(Object.values(manifest.clips))],
    materials: true,
    coordinates: true,
    limitations: true,
  });
  report.asset = {
    ref: pack.ref,
    manifestSha256: (await import("node:crypto"))
      .createHash("sha256")
      .update(await readFile(manifestPath))
      .digest("hex"),
    bytes: manifest.files.reduce((n, file) => n + file.bytes, 0),
    privateLocalUse: true,
  };
  for (let i = 0; i < 8; i++) {
    const agent = await office.create(
      `Performance ${i + 1}`,
      data,
      undefined,
      undefined,
      { avatar: pack.ref, deskId: `desk-${i + 1}` },
    );
    await office.start(agent.id);
  }
  report.inventory = layoutInventory(office.layout());
  if (report.inventory.furnitureCount !== 40)
    throw new Error(
      "Benchmark must enumerate 40 actual furniture/equipment items.",
    );
  await new Promise((done) => app.server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const args = hardware
    ? ["--use-gl=angle", "--use-angle=gl"]
    : [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ];
  report.flags = args;
  let context;
  let page;
  if (hardware) {
    // Default Playwright contexts force visible focus; attach without those
    // overrides so actual tab visibility and browser throttling are measurable.
    const profile = join(data, "chrome-profile");
    chromeProcess = spawn(
      option("--browser", "/usr/bin/google-chrome"),
      [
        ...args,
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    const deadline = Date.now() + 15000;
    let port;
    while (!port && Date.now() < deadline) {
      try {
        port = Number(
          (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
            "\n",
          )[0],
        );
      } catch {
        await delay(100);
      }
    }
    if (!port) throw new Error("Owned Chrome debugging endpoint unavailable");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
      noDefaults: true,
    });
    context = browser.contexts()[0];
    page = context.pages()[0];
    const viewportSession = await context.newCDPSession(page);
    await viewportSession.send("Emulation.setDeviceMetricsOverride", {
      ...report.viewport,
      deviceScaleFactor: 1.5,
      mobile: false,
    });
    report.visibilityMethod =
      "Actual tab switch in owned Chrome default context; CDP noDefaults, no focus override";
  } else {
    browser = await chromium.launch({ headless: true, args });
    context = await browser.newContext({
      viewport: report.viewport,
      deviceScaleFactor: 1.5,
    });
    page = await context.newPage();
  }
  report.browserVersion = browser.version();
  report.host = {
    uname: execFileSync("uname", ["-a"], { encoding: "utf8" }).trim(),
    os: await readFile("/etc/os-release", "utf8"),
    cpu: execFileSync("lscpu", ["-J"], { encoding: "utf8" }),
    memory: (await readFile("/proc/meminfo", "utf8")).split("\n").slice(0, 3),
  };
  await page.setViewportSize(report.viewport);
  const metricsSession = await context.newCDPSession(page);
  async function applyViewport() {
    await metricsSession.send("Emulation.setDeviceMetricsOverride", {
      ...report.viewport,
      deviceScaleFactor: 1.5,
      mobile: false,
    });
  }
  async function viewportFacts() {
    const facts = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const rect = canvas?.getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        devicePixelRatio,
        canvasCss: rect && { width: rect.width, height: rect.height },
        canvasBuffer: canvas && { width: canvas.width, height: canvas.height },
      };
    });
    if (
      facts.width !== 1440 ||
      facts.height !== 900 ||
      facts.devicePixelRatio !== 1.5
    )
      throw new Error(`Measured viewport is invalid: ${JSON.stringify(facts)}`);
    return facts;
  }
  async function captureViewport(path) {
    const capture = await metricsSession.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(path, Buffer.from(capture.data, "base64"));
  }
  await applyViewport();
  benchmarkPage = page;
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.addInitScript(() => {
    window.__bench = {
      frames: [],
      draws: 0,
      markerTimes: {},
      longTasks: [],
      inputTimes: [],
    };
    for (const type of [WebGLRenderingContext, WebGL2RenderingContext])
      for (const method of [
        "drawArrays",
        "drawElements",
        "drawElementsInstanced",
        "drawArraysInstanced",
      ]) {
        const original = type.prototype[method];
        if (!original) continue;
        type.prototype[method] = function (...args) {
          window.__bench.draws++;
          return original.apply(this, args);
        };
      }
    let previous;
    function frame(at) {
      if (previous !== undefined && !document.hidden)
        window.__bench.frames.push({
          at,
          deltaMs: at - previous,
          draws: window.__bench.draws,
        });
      window.__bench.draws = 0;
      previous = at;
      const diagnostic = document.querySelector("[data-office-scene]");
      const agents = diagnostic
        ? JSON.parse(diagnostic.dataset.officeScene).agents
        : [];
      const visible = (node) => {
        if (!node || !node.checkVisibility({ checkVisibilityCSS: true }))
          return false;
        const rect = node.getBoundingClientRect();
        let left = Math.max(0, rect.left),
          top = Math.max(0, rect.top),
          right = Math.min(innerWidth, rect.right),
          bottom = Math.min(innerHeight, rect.bottom);
        for (
          let parent = node.parentElement;
          parent;
          parent = parent.parentElement
        ) {
          const style = getComputedStyle(parent);
          if (
            [style.overflow, style.overflowX, style.overflowY].some((value) =>
              ["hidden", "auto", "scroll", "clip"].includes(value),
            )
          ) {
            const box = parent.getBoundingClientRect();
            left = Math.max(left, box.left);
            top = Math.max(top, box.top);
            right = Math.min(right, box.right);
            bottom = Math.min(bottom, box.bottom);
          }
        }
        return right - left > 8 && bottom - top > 8;
      };
      for (const agent of agents)
        for (const id of agent.requests) {
          if (window.__bench.markerTimes[id]) continue;
          const row = [
            ...document.querySelectorAll("[data-scene-request]"),
          ].find((node) => node.dataset.sceneRequest === id);
          const plate = document.querySelector(
            `[data-scene-agent="${agent.id}"]`,
          );
          if (
            visible(row) ||
            (visible(plate) && /tone-(question|approval)/.test(plate.className))
          ) {
            window.__bench.markerTimes[id] = performance.timeOrigin + at;
          }
        }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.__bench.longTasks.push({
          startTime: entry.startTime,
          duration: entry.duration,
        });
    }).observe({ entryTypes: ["longtask"] });
    document.addEventListener("input", (event) => {
      if (
        !(event.target instanceof HTMLTextAreaElement) ||
        event.target.id !== "prompt"
      )
        return;
      const began = performance.now();
      requestAnimationFrame(() => {
        const visibleFrame = performance.now();
        window.__bench.inputTimes.push(visibleFrame - began);
        window.__bench.inputEvents.push({
          target: "textarea#prompt",
          label: event.target.labels?.[0]?.textContent,
          began,
          visibleFrame,
          durationMs: visibleFrame - began,
        });
      });
    });
  });
  await page.addInitScript(
    (id) => localStorage.setItem("blueoffice.selected.v1", id),
    office.snapshot().agents[0].id,
  );
  const loadStart = performance.now();
  report.gpuTimingEnabled = process.argv.includes("--gpu-timing");
  await page.goto(
    `${url}/?performance=1${report.gpuTimingEnabled ? "&gpu-timing=1" : ""}`,
  );
  await page.bringToFront();
  report.initialVisibility = await page.evaluate(
    () => document.visibilityState,
  );
  await page.waitForFunction(
    () => {
      const node = document.querySelector("[data-office-scene]");
      return (
        node &&
        Object.keys(JSON.parse(node.dataset.officeScene).avatars).length === 8
      );
    },
    { timeout: 30000 },
  );
  report.loadMs = performance.now() - loadStart;
  report.loadedViewport = await viewportFacts();
  report.renderer = await page.evaluate(() => {
    const gl = document.querySelector("canvas").getContext("webgl2");
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: gl.getParameter(debug.UNMASKED_VENDOR_WEBGL),
      renderer: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
      version: gl.getParameter(gl.VERSION),
      timerQuery: !!gl.getExtension("EXT_disjoint_timer_query_webgl2"),
    };
  });
  if (
    hardware &&
    /swiftshader|llvmpipe|software/i.test(report.renderer.renderer)
  )
    throw new Error(
      "Actual WebGL renderer is software; this cannot support hardware performance claims.",
    );
  report.clockCalibration = await page.evaluate(async () => {
    const samples = [];
    for (let i = 0; i < 15; i++) {
      const sent = performance.timeOrigin + performance.now();
      const server = await (await fetch("/performance/clock")).json();
      const arrived = performance.timeOrigin + performance.now();
      samples.push({
        sent,
        arrived,
        server: server.now,
        roundTripMs: arrived - sent,
        serverMinusBrowserMs: server.now - (sent + arrived) / 2,
      });
    }
    return samples;
  });
  const bestClock = [...report.clockCalibration].sort(
    (a, b) => a.roundTripMs - b.roundTripMs,
  )[0];
  report.clockUncertaintyMs = bestClock.roundTripMs / 2;
  async function measure(quality, phase) {
    await applyViewport();
    const selector = page.getByRole("combobox", {
      name: "Scene quality",
      exact: true,
    });
    if (await selector.count()) await selector.selectOption(quality);
    else if (quality === "reduced")
      throw new Error("Reduced quality must be implemented before comparison.");
    await delay(1000);
    const viewportBefore = await viewportFacts();
    const since = await page.evaluate(() => performance.now());
    await delay(sampleSeconds * 1000);
    const captured = await page.evaluate(
      (since) => ({
        browserFrames: window.__bench.frames.filter(
          (frame) => frame.at >= since,
        ),
        scene: window.__blueofficePerformance,
        longTasks: window.__bench.longTasks.filter(
          (entry) => entry.startTime >= since,
        ),
        diagnostics: JSON.parse(
          document.querySelector("[data-office-scene]").dataset.officeScene,
        ),
      }),
      since,
    );
    const deltas = captured.browserFrames.map((frame) => frame.deltaMs);
    const elapsed = deltas.reduce((sum, value) => sum + value, 0);
    const summary = {
      quality,
      phase,
      frames: deltas.length,
      meanFps: (1000 * deltas.length) / elapsed,
      medianFrameMs: percentile(deltas, 0.5),
      p95FrameMs: percentile(deltas, 0.95),
      p99FrameMs: percentile(deltas, 0.99),
      meanDraws:
        captured.browserFrames.reduce((sum, frame) => sum + frame.draws, 0) /
        deltas.length,
      viewportBefore,
      viewportAfter: await viewportFacts(),
      targetFps: quality === "ordinary" ? 60 : 30,
      raw: captured,
    };
    const actual =
      captured.scene?.frames.filter((frame) => frame.at >= since) ?? [];
    summary.actualSceneFrames = actual.length;
    summary.actualSceneFps = actual.length
      ? (1000 * actual.length) /
        actual.reduce((sum, frame) => sum + frame.deltaMs, 0)
      : null;
    const gpu =
      captured.scene?.gpuSamples.filter((sample) => sample.at >= since) ?? [];
    summary.gpuMedianMs = percentile(
      gpu.map((sample) => sample.elapsedMs),
      0.5,
    );
    summary.gpuP95Ms = percentile(
      gpu.map((sample) => sample.elapsedMs),
      0.95,
    );
    summary.targetMet =
      summary.actualSceneFps !== null &&
      summary.actualSceneFps >= summary.targetFps;
    report.phases.push(summary);
    await captureViewport(join(output, `${phase}-${quality}.png`));
    summary.viewportAfterCapture = await viewportFacts();
    console.log(
      JSON.stringify({
        quality,
        phase,
        meanFps: summary.meanFps,
        p95FrameMs: summary.p95FrameMs,
        targetMet: summary.targetMet,
      }),
    );
  }
  await measure("ordinary", "ready-idle");
  await measure("reduced", "ready-idle");
  await Promise.all(
    office
      .snapshot()
      .agents.map((agent) =>
        office.prompt(
          agent.id,
          randomUUID(),
          { epoch: agent.epoch, sessionId: agent.liveSessionId },
          "slow synthetic work",
        ),
      ),
  );
  await delay(4000);
  await measure("ordinary", "working-seated");
  await measure("reduced", "working-seated");
  await Promise.all(
    office.snapshot().agents.map((agent) =>
      office.interrupt(agent.id, {
        epoch: agent.epoch,
        sessionId: agent.liveSessionId,
      }),
    ),
  );
  // Dense input/stream scenarios stay within the owned fixture profiles.
  for (const agent of office.snapshot().agents)
    await office.prompt(
      agent.id,
      randomUUID(),
      { epoch: agent.epoch, sessionId: agent.liveSessionId },
      "single question",
    );
  await page.waitForFunction(
    () => document.querySelectorAll("[data-scene-request]").length === 8,
  );
  const markerTimes = await page.evaluate(() => window.__bench.markerTimes);
  report.attention = receipts.map((received) => {
    const agent = office
      .snapshot()
      .agents.find((a) => a.liveSessionId === received.sessionId);
    const request = agent?.requests.find((r) => r.frameId === received.frameId);
    const visible = markerTimes[request?.id];
    return {
      ...received,
      requestId: request?.id,
      browserVisibleAt: visible,
      calibratedLatencyMs:
        visible + bestClock.serverMinusBrowserMs - received.serverReceivedAt,
    };
  });
  report.attentionP95Ms = percentile(
    report.attention.map((entry) => entry.calibratedLatencyMs),
    0.95,
  );
  report.attentionTargetMet =
    report.attention.length === 8 &&
    report.attention.every((entry) =>
      Number.isFinite(entry.calibratedLatencyMs),
    ) &&
    report.attentionP95Ms + report.clockUncertaintyMs < 500;
  await measure("reduced", "dense-attention");
  const rigBefore = await page.evaluate(
    () =>
      JSON.parse(
        document.querySelector("[data-office-scene]").dataset.officeScene,
      ).avatars,
  );
  let journalBefore = office.snapshot().revision;
  await page.evaluate(() => {
    window.__bench.updateEvents = 0;
    window.__bench.streamEvents = [];
    window.__bench.streamChunks = {};
    const Original = window.EventSource;
    // Count batches using a second owned subscriber, without changing the application stream.
    const open = async () => {
      const snapshot = await (await fetch("/api/snapshot")).json();
      window.__bench.stream = new Original(
        `/api/events?since=${snapshot.revision}&journal=${encodeURIComponent(snapshot.journalId)}`,
      );
      window.__bench.stream.addEventListener("updates", (message) => {
        window.__bench.updateEvents++;
        for (const event of JSON.parse(message.data).events) {
          if (event.revision <= window.__bench.streamFromRevision) continue;
          window.__bench.streamEvents.push({
            revision: event.revision,
            key: event.key,
            kind: event.kind,
            agentId: event.agentId,
          });
          const chunks = (window.__bench.streamChunks[event.agentId] ??= []);
          for (const item of [
            ...event.change.messages.append,
            ...event.change.messages.upsert,
          ]) {
            for (const match of item.text.matchAll(
              /Public stream chunk (\d+)\./g,
            )) {
              const index = Number(match[1]);
              if (!chunks.includes(index)) chunks.push(index);
            }
          }
        }
      });
    };
    return open();
  });
  for (const agent of office.snapshot().agents) {
    const request = attention(agent)[0];
    await office.reply(
      agent.id,
      request.id,
      randomUUID(),
      { epoch: agent.epoch, sessionId: agent.liveSessionId },
      { answer: "Oak" },
    );
  }
  {
    const deadline = Date.now() + 15000;
    while (office.snapshot().agents.some((agent) => agent.busy)) {
      if (Date.now() > deadline)
        throw new Error("Owned streaming workload did not finish");
      await delay(20);
    }
  }
  const streamingAgents = office.snapshot().agents.slice(0, 7);
  const composerAgent = office.snapshot().agents[7];
  await page
    .getByRole("navigation", { name: "Select an agent" })
    .getByRole("button", { name: /Performance 8/ })
    .click();
  journalBefore = office.snapshot().revision;
  await page.evaluate((revision) => {
    window.__bench.updateEvents = 0;
    window.__bench.streamEvents = [];
    window.__bench.streamChunks = {};
    window.__bench.streamFromRevision = revision;
  }, journalBefore);
  const streamStart = performance.now();
  await Promise.all(
    streamingAgents.map((agent) =>
      office.prompt(
        agent.id,
        randomUUID(),
        { epoch: agent.epoch, sessionId: agent.liveSessionId },
        "history stream",
      ),
    ),
  );
  await page.evaluate(() => {
    window.__bench.inputTimes = [];
    window.__bench.inputEvents = [];
  });
  const input = page.getByLabel("Message Performance 8", { exact: true });
  const inputBusyBefore = office
    .snapshot()
    .agents.filter((agent) => agent.busy).length;
  if (inputBusyBefore !== 7)
    throw new Error("Input responsiveness requires seven unfinished streams");
  await input.click();
  await input.pressSequentially("Active chat", {
    delay: 8,
  });
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
  const inputBusyAfter = office
    .snapshot()
    .agents.filter((agent) => agent.busy).length;
  if (inputBusyAfter !== 7)
    throw new Error("Input measurement missed the active streaming window");
  const inputTimes = await page.evaluate(() => window.__bench.inputTimes);
  const inputEvents = await page.evaluate(() => window.__bench.inputEvents);
  {
    const deadline = Date.now() + 15000;
    while (office.snapshot().agents.some((agent) => agent.busy)) {
      if (Date.now() > deadline)
        throw new Error("Owned streaming workload did not finish");
      await delay(20);
    }
  }
  await page.waitForFunction(() =>
    JSON.parse(
      document.querySelector("[data-office-scene]").dataset.officeScene,
    ).agents.every((agent) => agent.work === "completed"),
  );
  const finalStreamRevision = office.snapshot().revision;
  await page.waitForFunction(
    (revision) =>
      window.__bench.streamEvents.some((event) => event.revision === revision),
    finalStreamRevision,
  );
  await page.evaluate((revision) => {
    window.__bench.streamFinalRevision = revision;
  }, finalStreamRevision);
  const expectedStreamEvents = office
    .eventsSince(journalBefore, office.snapshot().journalId)
    .events.filter((event) => event.revision <= finalStreamRevision)
    .map((event) => ({
      revision: event.revision,
      key: event.key,
      kind: event.kind,
      agentId: event.agentId,
    }));
  const streamAfter = await page.evaluate(() => ({
    rigs: JSON.parse(
      document.querySelector("[data-office-scene]").dataset.officeScene,
    ).avatars,
    updates: window.__bench.updateEvents,
    events: window.__bench.streamEvents.filter(
      (event) => event.revision <= window.__bench.streamFinalRevision,
    ),
    chunks: window.__bench.streamChunks,
  }));
  report.streaming = {
    durationMs: performance.now() - streamStart,
    journalEvents: office.snapshot().revision - journalBefore,
    receivedUpdateBatches: streamAfter.updates,
    journalFromRevision: journalBefore,
    journalThroughRevision: finalStreamRevision,
    expectedEvents: expectedStreamEvents,
    receivedEvents: streamAfter.events,
    allJournalEdgesDelivered:
      JSON.stringify(expectedStreamEvents) ===
      JSON.stringify(streamAfter.events),
    streamAgentIds: streamingAgents.map((agent) => agent.id),
    composerAgentId: composerAgent.id,
    workload:
      "8 runtimes/avatars, 7 concurrent streams plus eighth idle composer",
    inputBusyBefore,
    inputBusyAfter,
    inputEvents,
    inputToFrameMs: inputTimes,
    inputToFrameP95Ms: percentile(inputTimes, 0.95),
    geometryStable: Object.keys(rigBefore).every(
      (id) => rigBefore[id].geometryId === streamAfter.rigs[id]?.geometryId,
    ),
    independentRigs:
      new Set(Object.values(streamAfter.rigs).map((rig) => rig.boneId)).size ===
      8,
    completeAgents: office
      .snapshot()
      .agents.filter(
        (agent) =>
          streamingAgents.some((stream) => stream.id === agent.id) &&
          agent.work === "completed",
      ).length,
    retainedChunks: office
      .snapshot()
      .agents.filter((agent) =>
        streamingAgents.some((stream) => stream.id === agent.id),
      )
      .map((agent) => ({
        id: agent.id,
        userMessageCount: agent.messages.filter(
          (message) => message.role === "user",
        ).length,
        observedPublicChunkIndices: streamAfter.chunks[agent.id] ?? [],
        streamChunksDelivered: Array.from(
          { length: 8 },
          (_, index) => index,
        ).every((index) => streamAfter.chunks[agent.id]?.includes(index)),
        retainedChunkIds: agent.messages.find(
          (message) =>
            message.role === "assistant" && message.turnId === agent.turnId,
        )?.chunkIds,
        authoritativeFinalText: agent.messages.find(
          (message) =>
            message.role === "assistant" && message.turnId === agent.turnId,
        )?.text,
        finalComplete: agent.messages.some(
          (message) =>
            message.role === "assistant" &&
            message.turnId === agent.turnId &&
            message.state === "complete",
        ),
      })),
  };
  await page.evaluate(() => window.__bench.stream.close());
  for (let round = 0; round < 3; round++) {
    await Promise.all(
      office
        .snapshot()
        .agents.map((agent) =>
          office.prompt(
            agent.id,
            randomUUID(),
            { epoch: agent.epoch, sessionId: agent.liveSessionId },
            round % 2 ? "approval" : "single question",
          ),
        ),
    );
    await page.waitForFunction(
      () => document.querySelectorAll("[data-scene-request]").length === 8,
    );
    await delay(100);
    if (round < 2) {
      for (const agent of office.snapshot().agents) {
        const request = attention(agent)[0];
        const target = { epoch: agent.epoch, sessionId: agent.liveSessionId };
        if (request.kind === "approval")
          await office.reply(agent.id, request.id, randomUUID(), target, {
            choice: "deny",
          });
        else
          await office.reply(agent.id, request.id, randomUUID(), target, {
            answer: "Oak",
          });
      }
      while (office.snapshot().agents.some((agent) => agent.busy))
        await delay(20);
    }
  }
  const allVisible = await page.evaluate(() => window.__bench.markerTimes);
  report.attention = receipts.map((received) => {
    const agent = office
      .snapshot()
      .agents.find((a) => a.liveSessionId === received.sessionId);
    const request = agent?.requests.find((r) => r.frameId === received.frameId);
    const visible = allVisible[request?.id];
    return {
      ...received,
      requestId: request?.id,
      browserVisibleAt: visible,
      calibratedLatencyMs:
        visible + bestClock.serverMinusBrowserMs - received.serverReceivedAt,
    };
  });
  report.attentionP95Ms = percentile(
    report.attention.map((entry) => entry.calibratedLatencyMs),
    0.95,
  );
  report.attentionTargetMet =
    report.attention.length === 32 &&
    report.attention.every((entry) =>
      Number.isFinite(entry.calibratedLatencyMs),
    ) &&
    report.attentionP95Ms + report.clockUncertaintyMs < 500;
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await page.waitForFunction(
    () => document.hidden && window.__blueofficePerformance?.hidden,
    undefined,
    { polling: 100 },
  );
  const pausedBefore = await page.evaluate(() => ({
    frames: window.__blueofficePerformance.frames.length,
    diagnostics: JSON.parse(
      document.querySelector("[data-office-scene]").dataset.officeScene,
    ),
  }));
  await delay(1000);
  const pausedAfter = await page.evaluate(() => ({
    frames: window.__blueofficePerformance.frames.length,
    diagnostics: JSON.parse(
      document.querySelector("[data-office-scene]").dataset.officeScene,
    ),
  }));
  report.hiddenTab = {
    actualHidden: true,
    additionalSceneFrames: pausedAfter.frames - pausedBefore.frames,
    pendingRequestsPreserved: pausedAfter.diagnostics.agents.every(
      (agent, i) =>
        agent.requests[0] === pausedBefore.diagnostics.agents[i].requests[0],
    ),
    freshTelemetry: pausedAfter.diagnostics.agents.every(
      (agent) => agent.label === "Needs an answer",
    ),
  };
  await page.bringToFront();
  await page.waitForFunction(
    () => !document.hidden && !window.__blueofficePerformance?.hidden,
    undefined,
    { polling: 100 },
  );
  await other.close();
  const session = await context.newCDPSession(page);
  const reconnectedAt = performance.now();
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await page.waitForFunction(() =>
    document.querySelector(".connection")?.textContent.includes("Connecting"),
  );
  const healthyAt = performance.now();
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".connection")
        ?.textContent.includes("Connected locally") &&
      document.querySelectorAll("[data-scene-request]").length === 8,
  );
  report.reconnect = {
    outageStartedAt: reconnectedAt,
    healthyReconnectMs: performance.now() - healthyAt,
    targetMs: 3000,
  };
  report.reconnect.targetMet = report.reconnect.healthyReconnectMs < 3000;
  await page.evaluate(() =>
    document
      .querySelector("canvas")
      .getContext("webgl2")
      .getExtension("WEBGL_lose_context")
      .loseContext(),
  );
  await page.waitForFunction(
    () => document.querySelector(".scene-fallback") !== null,
  );
  report.contextLoss = {
    visibleAttention: await page.locator("[data-scene-request]").count(),
    selectedChat: await page.locator(".chat-panel").count(),
  };
  await captureViewport(join(output, "context-loss-dense-attention.png"));
  const remainingBefore = office
    .snapshot()
    .agents.slice(1)
    .map((agent) => agent.requests.at(-1).id);
  await page
    .locator(
      `[data-scene-request="${attention(office.snapshot().agents[0])[0].id}"]`,
    )
    .click();
  const question = page
    .getByRole("region", { name: "Question request" })
    .last();
  await question.getByRole("radio", { name: "Oak", exact: true }).check();
  await question
    .getByRole("button", { name: "Send answer", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll("[data-scene-request]").length === 7,
  );
  report.contextLoss.replyRetainsOtherRequests = office
    .snapshot()
    .agents.slice(1)
    .every((agent, i) => attention(agent)[0]?.id === remainingBefore[i]);
  report.passed =
    report.errors.length === 0 &&
    report.attentionTargetMet &&
    report.reconnect.targetMet &&
    report.contextLoss.visibleAttention === 8 &&
    report.contextLoss.replyRetainsOtherRequests &&
    report.hiddenTab.additionalSceneFrames === 0 &&
    report.hiddenTab.pendingRequestsPreserved &&
    report.streaming.allJournalEdgesDelivered &&
    report.streaming.geometryStable &&
    report.streaming.independentRigs &&
    report.streaming.completeAgents === 7 &&
    report.streaming.inputEvents.length >= 10 &&
    report.streaming.inputBusyBefore === 7 &&
    report.streaming.inputBusyAfter === 7 &&
    report.streaming.retainedChunks.every(
      (agent) =>
        agent.finalComplete &&
        agent.streamChunksDelivered &&
        agent.retainedChunkIds.length >= 10 &&
        agent.authoritativeFinalText ===
          "Fixture task complete. Your workspace is ready.",
    );
  report.performanceTargetsMet =
    !report.functionalOnly &&
    !report.gpuTimingEnabled &&
    report.phases.every((phase) => phase.targetMet);
  report.limits = [
    "Fixture browser runtime; native CPU/RSS measured separately. Instrumented browser RAF is compositor cadence, with actual scene capture retained separately.",
    "Mean FPS targets are provisional; raw frame tails/long tasks are preserved. No live-provider performance or dedicated GPU memory claim.",
  ];
} catch (error) {
  report.error = error.message;
  if (benchmarkPage && !benchmarkPage.isClosed()) {
    report.failureBrowser = await benchmarkPage
      .evaluate(() => ({
        visibility: document.visibilityState,
        url: location.href,
        scene: document
          .querySelector("[data-office-scene]")
          ?.getAttribute("data-office-scene"),
        performance: window.__blueofficePerformance,
      }))
      .catch(() => null);
    await benchmarkPage
      .screenshot({ path: join(output, "failure.png") })
      .catch(() => {});
  }
  console.error(error);
} finally {
  report.finalSource = await sourceIdentity();
  report.sourceUnchanged =
    report.source.fingerprint === report.finalSource.fingerprint;
  if (!report.sourceUnchanged) {
    report.passed = false;
    report.error = "Source changed during benchmark; rerun.";
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  if (chromeProcess && chromeProcess.exitCode === null) {
    const exited = new Promise((done) => chromeProcess.once("exit", done));
    chromeProcess.kill("SIGTERM");
    await Promise.race([exited, delay(3000)]);
    if (chromeProcess.exitCode === null) chromeProcess.kill("SIGKILL");
  }
  await app.close();
  store.close();
  RpcChild.prototype.ingest = ingest;
  await rm(data, { recursive: true, force: true });
}
console.log(`Browser performance evidence: ${join(output, "report.json")}`);
if (!report.passed) process.exitCode = 1;
