import { execFile } from "node:child_process";
import { resolve } from "node:path";
import type { HistoryProfile, HistoryReadResult } from "../shared/history.js";
import { HistoryError } from "./history.js";
import { historyProfilesSchema, historyReadSchema } from "./history-schema.js";

export async function nativeHistory<
  T extends HistoryProfile[] | HistoryReadResult,
>(
  installation: {
    source: string;
    python: string;
    profile_root: string;
    revision?: string;
  },
  request: {
    action?: "profiles";
    profileHome?: string;
    storedSessionId?: string;
  },
  secret?: string,
): Promise<T> {
  return new Promise((accept, reject) => {
    const child = execFile(
      installation.python,
      [
        "-B",
        "-I",
        resolve("scripts/history_reader.py"),
        installation.source,
        installation.profile_root,
        installation.revision ?? "fixture",
      ],
      {
        timeout: 20_000,
        maxBuffer: 4_000_000,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          LANG: "C.UTF-8",
          HERMES_HOME: installation.profile_root,
          HERMES_DISABLE_LAZY_INSTALLS: "1",
        },
      },
      (error, stdout) => {
        try {
          const value = JSON.parse(stdout, (_key, item) =>
            typeof item === "string" && secret
              ? item.replaceAll(secret, "[redacted]")
              : item,
          );
          if (error || value.error) throw new Error();
          accept(
            (request.action === "profiles"
              ? historyProfilesSchema.parse(value)
              : historyReadSchema.parse(value)) as T,
          );
        } catch {
          reject(
            new HistoryError(
              "History could not be read safely. Check the profile database and supported Hermes revision; no history was changed.",
            ),
          );
        }
      },
    );
    child.stdin?.end(JSON.stringify(request));
  });
}
