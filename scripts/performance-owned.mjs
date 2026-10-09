/** Run exclusively inside performance-native.py's owned disposable namespace. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { Office } from "../server/office.ts";
import { OfficeStore } from "../server/store.ts";
import { HermesRuntime } from "../server/runtime.ts";
import { attention } from "../shared/office.ts";
const installation = JSON.parse(process.argv[2]);
const duration = Number(process.argv[3]) * 1000;
const hz = Number(
  execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).trim(),
);
const pages = Number(
  execFileSync("getconf", ["PAGESIZE"], { encoding: "utf8" }).trim(),
);
const store = new OfficeStore("/tmp/performance-office/office.db");
const office = new Office(
  store,
  new HermesRuntime(installation, "/tmp/alpha/mock-key"),
);
const phases = [];
async function proc(pid) {
  try {
    const value = await readFile(`/proc/${pid}/stat`, "utf8");
    const fields = value.slice(value.lastIndexOf(")") + 2).split(" ");
    return {
      pid,
      ppid: Number(fields[1]),
      ticks:
        Number(fields[11]) +
        Number(fields[12]) +
        Number(fields[13]) +
        Number(fields[14]),
      started: fields[19],
      rssBytes: Number(fields[21]) * pages,
    };
  } catch {
    return undefined;
  }
}
async function sample() {
  const roots = [...office.runtimes.values()].map((rpc) => rpc.child.pid);
  const processes = (
    await Promise.all(
      (await readdir("/proc"))
        .filter((p) => /^\d+$/.test(p))
        .map((p) => proc(Number(p))),
    )
  ).filter(Boolean);
  const owned = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of processes)
      if (owned.has(p.ppid) && !owned.has(p.pid)) {
        owned.add(p.pid);
        changed = true;
      }
  }
  return {
    at: performance.now(),
    roots,
    processes: processes.filter((p) => owned.has(p.pid)),
    supervisor: await proc(process.pid),
  };
}
async function measure(count, phase) {
  const samples = [];
  const began = performance.now();
  while (performance.now() - began < duration) {
    samples.push(await sample());
    await delay(250);
  }
  samples.push(await sample());
  const first = samples[0],
    last = samples.at(-1);
  const ticks = (s) => s.processes.reduce((total, p) => total + p.ticks, 0);
  const rss = (s) => s.processes.reduce((total, p) => total + p.rssBytes, 0);
  const wallSeconds = (last.at - first.at) / 1000;
  const record = {
    count,
    phase,
    durationSeconds: wallSeconds,
    cpuPercentOfOneCore:
      (100 * (ticks(last) - ticks(first))) / hz / wallSeconds,
    finalSumRssMiB: rss(last) / 1048576,
    peakSampledSumRssMiB: Math.max(...samples.map(rss)) / 1048576,
    supervisorCpuPercentOfOneCore:
      (100 * (last.supervisor.ticks - first.supervisor.ticks)) /
      hz /
      wallSeconds,
    supervisorRssMiB: last.supervisor.rssBytes / 1048576,
    samples,
  };
  phases.push(record);
  console.log(
    JSON.stringify({
      count,
      phase,
      cpuPercentOfOneCore: record.cpuPercentOfOneCore,
      sumRssMiB: record.finalSumRssMiB,
    }),
  );
}
try {
  for (const count of [1, 4, 8]) {
    while (office.snapshot().agents.length < count) {
      const agent = await office.create(
        `Measured Hermes ${office.snapshot().agents.length + 1}`,
        "/tmp/alpha/workspace",
      );
      await office.start(agent.id);
    }
    await delay(3500);
    await measure(count, "ready-idle");
    await Promise.all(
      office.snapshot().agents.map(async (agent) => {
        if (attention(agent).length) return;
        await office.prompt(
          agent.id,
          randomUUID(),
          { epoch: agent.epoch, sessionId: agent.liveSessionId },
          "PROBE_SINGLE",
        );
      }),
    );
    const deadline = Date.now() + 20000;
    while (office.snapshot().agents.some((agent) => !attention(agent).length)) {
      if (Date.now() > deadline)
        throw new Error("Native pending workload did not become ready");
      await delay(20);
    }
    await measure(count, "structured-question-pending");
    // Resolve existing questions before growing the ready-idle workload.
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
    const finish = Date.now() + 20000;
    while (
      office
        .snapshot()
        .agents.some((agent) => agent.busy || attention(agent).length)
    ) {
      if (Date.now() > finish)
        throw new Error("Native synthetic workload did not complete");
      await delay(20);
    }
  }
  await writeFile(
    "/evidence/report.json",
    JSON.stringify(
      {
        passed:
          phases.length === 6 &&
          phases.every(
            (phase) =>
              Number.isFinite(phase.cpuPercentOfOneCore) &&
              phase.cpuPercentOfOneCore >= 0,
          ),
        syntheticProvider: true,
        clockTicksPerSecond: hz,
        pageBytes: pages,
        phases,
        limitation:
          "Ready-idle and structured-input waits, not sustained real-provider generation. Sum RSS includes shared pages; CPU percent uses one-core denominator. Sampling adds supervisor overhead.",
      },
      null,
      2,
    ),
  );
} finally {
  await office.shutdown();
  store.close();
}
