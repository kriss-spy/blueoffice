import { z } from "zod";

const at = z.string().datetime({ offset: true }).nullable();
const metric = z.number().finite().nonnegative().nullable();
const record = z.object({
  lineageEvidence: z.literal("native-delegate-marker").nullable().optional(),
  storedSessionId: z.string().min(1).max(300),
  title: z.string().max(300),
  source: z.string().min(1).max(100),
  startedAt: at,
  lastActivityAt: at,
  endedAt: at,
  endReason: z.string().max(100).nullable(),
  parentStoredSessionId: z.string().max(300).nullable(),
  metrics: z.object({
    inputTokens: metric,
    outputTokens: metric,
    calls: metric,
    costUsd: metric,
    costKind: z.enum(["actual", "estimated", "included"]).nullable(),
  }),
});
export const historyReadSchema = z.object({
  records: z.array(record).max(500),
  truncated: z.boolean(),
  capability: z.object({
    reader: z.string().min(1).max(200),
    textSearch: z.literal("public-loaded"),
    lineage: z.boolean(),
    resume: z.boolean(),
    resumeReason: z.string().max(1000),
  }),
  messages: z
    .array(
      z.object({
        id: z.string().max(500),
        role: z.enum(["user", "assistant"]),
        text: z.string().max(32000),
        at,
      }),
    )
    .max(500)
    .optional(),
  tools: z
    .array(
      z.object({
        id: z.string().max(500),
        name: z.string().max(100),
        context: z.string().max(1000),
        at,
        outcome: z.enum(["unknown", "completed", "failed", "interrupted"]),
      }),
    )
    .max(500)
    .optional(),
});
export const historyProfilesSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(200),
      name: z.string().min(1).max(300),
      home: z.string().min(1).max(4000),
    }),
  )
  .max(1000);
