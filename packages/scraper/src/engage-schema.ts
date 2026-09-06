/**
 * Zod schemas for the Engage event list.
 *
 * The endpoint is undocumented and can change shape without notice, so the two structural
 * guarantees the parser depends on, a `fields` list and positional `p*` values, are asserted
 * rather than assumed. Everything else is passed through: this validates the contract we rely on,
 * not the parts of the payload we ignore.
 */
import { z } from "zod";

export const engageRecord = z
  .object({
    fields: z.string(),
    // Present and null on event records, the string "true" on the date separators between them.
    listingSeparator: z.string().nullable().optional(),
    counter: z.string().nullable().optional(),
  })
  .passthrough();

export const engageResponse = z.array(engageRecord);

export type EngageRecord = z.infer<typeof engageRecord>;
