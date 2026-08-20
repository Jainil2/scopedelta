import { describe, expect, it } from "vitest";

import {
  addIsoDays,
  dateInTimeZone,
  enumerateIsoWeeks,
  isIsoMonday,
  isoWeekStart,
  parseIsoDate,
} from "@/lib/operations";
import {
  allocationInputSchema,
  portfolioFiltersSchema,
  timeEntryInputSchema,
} from "@/lib/operations-validation";

describe("operations week semantics", () => {
  it("keeps ISO weeks stable across month and year boundaries", () => {
    expect(isIsoMonday("2026-12-28")).toBe(true);
    expect(isIsoMonday("2027-01-01")).toBe(false);
    expect(addIsoDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(enumerateIsoWeeks("2026-12-28", 3)).toEqual([
      "2026-12-28",
      "2027-01-04",
      "2027-01-11",
    ]);
    expect(isoWeekStart("2027-01-03")).toBe("2026-12-28");
  });

  it("rejects rollover dates and derives workspace-local dates", () => {
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(
      dateInTimeZone(new Date("2026-08-20T20:30:00.000Z"), "Asia/Kolkata"),
    ).toBe("2026-08-21");
  });

  it("validates Monday-aligned allocations and bounded actuals", () => {
    expect(
      allocationInputSchema.safeParse({
        memberUserId: "c7c70f54-17f0-4d51-9d41-01158bd0ac26",
        projectId: "ed616af0-0aa0-49b1-8295-e5757c298b4c",
        startWeek: "2026-08-18",
        endWeek: "2026-08-24",
        plannedMinutesPerWeek: 600,
      }).success,
    ).toBe(false);
    expect(
      timeEntryInputSchema.safeParse({
        projectId: "ed616af0-0aa0-49b1-8295-e5757c298b4c",
        workDate: "2026-08-20",
        durationMinutes: 1_441,
        classification: "billable",
        note: "x".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("defaults portfolio URLs to a bounded active page", () => {
    expect(portfolioFiltersSchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      lifecycle: "active",
    });
    expect(portfolioFiltersSchema.safeParse({ pageSize: 101 }).success).toBe(
      false,
    );
  });
});
