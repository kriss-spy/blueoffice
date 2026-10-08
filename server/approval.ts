import { z } from "zod";
import { APPROVAL_CHOICES } from "../shared/approval.js";

const approval = z.object({
  session_id: z.string(),
  request_id: z.string().min(1).max(1000),
  command: z.string().max(32000).default(""),
  description: z.string().max(32000).default(""),
  choices: z.array(z.enum(APPROVAL_CHOICES)).min(1).max(4),
  allow_permanent: z.boolean().nullable().optional(),
  allow_session: z.boolean().nullable().optional(),
  smart_denied: z.boolean().nullable().optional(),
});

/** Hermes redacts command context before its approval frame leaves the gateway.
 * Only that public context and the supported decision contract enter office storage.
 * Tool-specific metadata, pattern keys and private request fields are never projected. */
export function parseApproval(params: unknown) {
  const parsed = approval.safeParse(params);
  if (!parsed.success) return undefined;
  const p = parsed.data;
  if (
    new Set(p.choices).size !== p.choices.length ||
    (p.choices.includes("always") &&
      (p.allow_permanent === false ||
        p.allow_session === false ||
        p.smart_denied)) ||
    (p.choices.includes("session") &&
      (p.allow_session === false || p.smart_denied))
  )
    return undefined;
  return {
    innerId: p.request_id,
    text: [p.description, p.command].filter(Boolean).join("\n"),
    choices: p.choices,
    responseSchema: "hermes.approval.v1" as const,
  };
}
