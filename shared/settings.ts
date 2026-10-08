import { z } from "zod";
import { MODEL_IDS } from "./routes.js";

export const settingsSchema = z
  .object({
    workspace: z.string().min(1).max(4096),
    model: z.enum(MODEL_IDS),
    soul: z.string().max(32000),
    toolsets: z
      .array(z.enum(["terminal", "file", "clarify"]))
      .min(1)
      .max(3)
      .refine(
        (values) => new Set(values).size === values.length,
        "Choose each tool group once.",
      ),
    approvalMode: z.enum(["manual", "off"]),
  })
  .strict();
export type ProfileSettings = z.infer<typeof settingsSchema>;
export type ProfileDefaults = Pick<
  ProfileSettings,
  "soul" | "toolsets" | "approvalMode"
>;
export type SettingsSection = keyof ProfileSettings;
export interface ProfileSnapshot {
  profileHome: string;
  profileName: string;
  revision: string;
  values: ProfileSettings;
  managed: boolean;
  ownerId: string | null;
  liveOwner: boolean;
  supported: boolean;
  scope: "profile";
  effect: "next-start";
}
export interface SettingsResult {
  ok: boolean;
  snapshot: ProfileSnapshot;
  sections: Partial<
    Record<SettingsSection, { applied: boolean; message: string }>
  >;
}
export interface ProfileRequest {
  action: "read" | "save" | "adopt";
  profileHome: string;
  agentId?: string;
  expectedRevision?: string;
  values?: ProfileSettings;
  acknowledgeOwnership?: boolean;
}
