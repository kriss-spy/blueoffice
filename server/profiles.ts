import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { routingConfig } from "./routes.js";
import type {
  ProfileRequest,
  ProfileSnapshot,
  SettingsResult,
} from "../shared/settings.js";
import { settingsSchema } from "../shared/settings.js";

export class ProfileError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

/** Only allowlisted settings cross this native boundary; raw configuration never leaves it. */
export async function profileOperation(
  installation: { source: string; python: string; profile_root: string },
  request: ProfileRequest,
): Promise<ProfileSnapshot | SettingsResult> {
  const values = request.values
    ? settingsSchema.parse(request.values)
    : undefined;
  const input = {
    ...request,
    ...(values ? { values, routing: routingConfig(values.model) } : {}),
  };
  return new Promise((resolveResult, reject) => {
    const child = execFile(
      installation.python,
      [
        "-B",
        "-I",
        resolve("scripts/profile_settings.py"),
        installation.source,
        installation.profile_root,
      ],
      {
        timeout: 20_000,
        maxBuffer: 250_000,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          LANG: "C.UTF-8",
          HERMES_HOME: request.profileHome,
          HERMES_DISABLE_LAZY_INSTALLS: "1",
        },
      },
      (error, stdout) => {
        try {
          const result = JSON.parse(stdout);
          if (result.error)
            reject(new ProfileError(result.error, result.status ?? 409));
          else if (error)
            reject(
              new ProfileError(
                "Profile operation failed. Reload settings before retrying.",
              ),
            );
          else resolveResult(result);
        } catch {
          reject(
            new ProfileError(
              "Profile operation could not be verified. Reload settings before retrying.",
            ),
          );
        }
      },
    );
    child.stdin?.end(JSON.stringify(input));
  });
}
