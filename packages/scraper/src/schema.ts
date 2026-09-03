/**
 * Zod schemas for Banner responses.
 *
 * Banner is an external system that can change shape without notice. Parsing every response means
 * a schema break fails the scrape loudly instead of silently emitting a thinner dataset — which
 * for this app would mean confidently telling students that occupied rooms are free.
 *
 * Schemas are deliberately permissive about fields we don't use (`.passthrough()`) and strict
 * about the ones vacancy depends on.
 */
import { z } from "zod";

export const termList = z.array(z.object({ code: z.string(), description: z.string() }));

/** A single meeting block: where and when a section actually convenes. */
export const meetingTime = z
  .object({
    building: z.string().nullable(),
    buildingDescription: z.string().nullable(),
    room: z.string().nullable(),
    campus: z.string().nullable(),
    campusDescription: z.string().nullable(),
    // "HHMM", e.g. "0800". Null for asynchronous/TBA sections.
    beginTime: z.string().nullable(),
    endTime: z.string().nullable(),
    // "MM/DD/YYYY".
    startDate: z.string(),
    endDate: z.string(),
    monday: z.boolean(),
    tuesday: z.boolean(),
    wednesday: z.boolean(),
    thursday: z.boolean(),
    friday: z.boolean(),
    saturday: z.boolean(),
    sunday: z.boolean(),
    meetingScheduleType: z.string().nullable().optional(),
    meetingType: z.string().nullable().optional(),
  })
  .passthrough();

export const bannerSection = z
  .object({
    courseReferenceNumber: z.string(),
    subject: z.string(),
    courseNumber: z.string(),
    courseTitle: z.string().nullable(),
    sequenceNumber: z.string().nullable().optional(),
    campusDescription: z.string().nullable().optional(),
    meetingsFaculty: z
      .array(z.object({ meetingTime: meetingTime.nullable() }).passthrough())
      .nullable()
      .default([]),
  })
  .passthrough();

export const bannerSearchResponse = z
  .object({
    success: z.boolean(),
    totalCount: z.number(),
    data: z.array(bannerSection).nullable().default([]),
  })
  .passthrough()
  .transform((r) => ({ ...r, data: r.data ?? [] }));

export type BannerSection = z.infer<typeof bannerSection>;
export type BannerMeetingTime = z.infer<typeof meetingTime>;
