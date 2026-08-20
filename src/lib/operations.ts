export const DEFAULT_WEEKLY_DELIVERY_MINUTES = 2_400;

export const PORTFOLIO_ATTENTION_CATEGORIES = [
  "overdue_milestone",
  "client_request",
  "commercial_drift",
  "blocked_work",
  "evidence_gap",
  "unresolved_defect",
  "pending_commercial_decision",
  "pending_acceptance",
  "stale_provider_evidence",
] as const;

export type PortfolioAttentionCategory =
  (typeof PORTFOLIO_ATTENTION_CATEGORIES)[number];

export type PortfolioAttentionSignal = {
  category: PortfolioAttentionCategory;
  count: number;
  href: string;
};

export type WeeklyAllocationFact = {
  id: string;
  projectId: string | null;
  projectKey: string | null;
  projectName: string;
  plannedMinutesPerWeek: number;
  roleLabel: string | null;
};

export type WeeklyCapacityTotal = {
  week: string;
  availableMinutes: number;
  allocatedMinutes: number;
  actualMinutes: number;
  overallocatedMinutes: number;
  allocations: WeeklyAllocationFact[];
};

export type MoneyAmount = {
  currencyCode: string;
  amount: string;
};

export type CommercialScheduleImpact = {
  impactId: string;
  requestId: string;
  requestTitle: string;
  scheduleDeltaDays: number | null;
  targetDate: string | null;
};

export type CommercialExposureSummary = {
  baseline: {
    versionId: string;
    label: string;
    versionNumber: number | null;
    effectiveAt: string | null;
  } | null;
  confirmed: {
    money: MoneyAmount[];
    effortMinutes: number;
    scheduleImpactCount: number;
    scheduleImpacts: CommercialScheduleImpact[];
  };
  pending: {
    money: MoneyAmount[];
    effortMinutes: number;
    scheduleImpactCount: number;
    scheduleImpacts: CommercialScheduleImpact[];
    requestCount: number;
  };
  actual: {
    billableMinutes: number;
    nonBillableMinutes: number;
  };
};

export function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

export function isIsoMonday(value: string) {
  return parseIsoDate(value)?.getUTCDay() === 1;
}

export function addIsoDays(value: string, days: number) {
  const date = parseIsoDate(value);
  if (!date) throw new Error("Invalid ISO date.");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isoWeekStart(value: string) {
  const date = parseIsoDate(value);
  if (!date) throw new Error("Invalid ISO date.");
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function dateInTimeZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function enumerateIsoWeeks(startWeek: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    addIsoDays(startWeek, index * 7),
  );
}
