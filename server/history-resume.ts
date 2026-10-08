import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import type { OfficeAgent } from "../shared/office.js";
import type { ResumePlan } from "../shared/resume.js";
import type { Installation } from "./runtime.js";

const schema = z.object({
  requestedStoredSessionId: z.string().min(1).max(300),
  resolvedStoredSessionId: z.string().min(1).max(300),
  source: z.string().max(100),
  profileName: z.string().min(1),
  profileRevision: z.string().regex(/^[a-f0-9]{64}$/),
});
export function nativeResumePlan(
  installation: Pick<Installation, "source" | "python" | "profile_root"> & {
    revision?: string;
  },
  agent: OfficeAgent,
  storedSessionId: string,
): Promise<ResumePlan> {
  return new Promise((accept, reject) => {
    const child = execFile(
      installation.python,
      [
        "-B",
        "-I",
        resolve("scripts/history_resume.py"),
        installation.source,
        installation.profile_root,
        installation.revision ?? "fixture",
      ],
      {
        timeout: 20_000,
        maxBuffer: 100_000,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          LANG: "C.UTF-8",
          HERMES_HOME: agent.profileHome,
          HERMES_DISABLE_LAZY_INSTALLS: "1",
        },
      },
      (error, stdout) => {
        try {
          const value = JSON.parse(stdout);
          if (error || value.error)
            throw new Error(
              typeof value.error === "string"
                ? value.error
                : "Resume preflight failed.",
            );
          accept(schema.parse(value));
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error("Resume preflight failed."),
          );
        }
      },
    );
    child.stdin?.end(
      JSON.stringify({
        profileHome: agent.profileHome,
        agentId: agent.id,
        model: agent.model,
        storedSessionId,
      }),
    );
  });
}
