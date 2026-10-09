import { z } from "zod";
import { assetRefSchema } from "./assets.js";
export const setupPlacementSchema = z
  .object({
    avatar: assetRefSchema.nullable(),
    deskId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,80}$/)
      .nullable(),
  })
  .strict();
export type SetupPlacement = z.infer<typeof setupPlacementSchema>;
