import { createHash } from "node:crypto";

import type {
  MigrationSourceKind,
  WorkItemPriority,
  WorkItemStatus,
} from "@/db/schema";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_PREVIEW_BODY_BYTES = MAX_CSV_BYTES * 2 + 1024 * 1024;
export const MAX_CSV_ROWS = 5_000;
export const MAX_CSV_COLUMNS = 64;
export const MAX_CSV_FIELD_LENGTH = 10_000;
export const IMPORT_BATCH_SIZE = 100;

export const migrationFields = [
  "projectKey",
  "projectName",
  "issueKey",
  "title",
  "description",
  "acceptanceCriteria",
  "issueType",
  "status",
  "priority",
  "assignee",
  "reporter",
  "parentKey",
  "labels",
  "createdAt",
  "updatedAt",
  "dueDate",
  "estimatePoints",
  "sourceUrl",
] as const;

export type MigrationField = (typeof migrationFields)[number];

export type CsvMapping = {
  columns: Partial<Record<MigrationField, string>>;
  statusValues: Record<string, WorkItemStatus>;
  priorityValues: Record<string, WorkItemPriority>;
};

export type ImportPreviewOptions = {
  clientId: string;
  defaultLeadUserId: string;
  defaultProjectKey: string | null;
  defaultProjectName: string | null;
};

export type PreviewMessage = {
  code: string;
  message: string;
  field?: string;
};

export type SourceIdentity = {
  identityKey: string;
  displayName: string | null;
  email: string | null;
};

export type NormalizedImportRow = {
  rowNumber: number;
  sourceProjectKey: string;
  projectName: string;
  sourceObjectKey: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  issueType: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  assigneeIdentity: SourceIdentity | null;
  reporterIdentity: SourceIdentity | null;
  parentSourceObjectKey: string | null;
  labels: string[];
  sourceCreatedAt: string | null;
  sourceUpdatedAt: string | null;
  targetDate: string | null;
  estimatePoints: number | null;
  sourceUrl: string | null;
  unsupported: Record<string, string>;
};

export type PreviewRow = {
  rowNumber: number;
  outcome: "valid" | "warning" | "blocked";
  messages: PreviewMessage[];
  normalized: NormalizedImportRow;
  fingerprint: string;
};

export type CsvPreview = {
  headers: string[];
  mapping: CsvMapping;
  unsupportedColumns: string[];
  rows: PreviewRow[];
  counts: { total: number; valid: number; warning: number; blocked: number };
};

export class CsvBoundaryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type ParsedCsv = {
  headers: string[];
  rows: Array<{ rowNumber: number; values: string[] }>;
};

const jiraColumnAliases: Record<MigrationField, string[]> = {
  projectKey: ["Project key", "Project Key", "Space key", "Space Key"],
  projectName: ["Project name", "Project Name", "Space name", "Space Name"],
  issueKey: ["Issue key", "Issue Key", "Key"],
  title: ["Summary", "Title"],
  description: ["Description"],
  acceptanceCriteria: ["Acceptance Criteria", "Acceptance criteria"],
  issueType: ["Issue Type", "Issue type", "Work type", "Type"],
  status: ["Status"],
  priority: ["Priority"],
  assignee: ["Assignee", "Assignee email", "Assignee Email"],
  reporter: ["Reporter", "Reporter email", "Reporter Email"],
  parentKey: ["Parent", "Parent key", "Parent Key"],
  labels: ["Labels", "Label"],
  createdAt: ["Created", "Created date", "Created Date"],
  updatedAt: ["Updated", "Updated date", "Updated Date"],
  dueDate: ["Due date", "Due Date", "Due"],
  estimatePoints: ["Story Points", "Story points", "Story point estimate"],
  sourceUrl: ["Issue URL", "Issue Url", "URL", "Url"],
};

const jiraStatusValues: Record<string, WorkItemStatus> = {
  backlog: "backlog",
  open: "backlog",
  "to do": "backlog",
  todo: "backlog",
  ready: "ready",
  "selected for development": "ready",
  "in progress": "in_progress",
  "in review": "in_review",
  "code review": "in_review",
  resolved: "done",
  closed: "done",
  done: "done",
  canceled: "canceled",
  cancelled: "canceled",
  "won't do": "canceled",
  "wont do": "canceled",
};

const jiraPriorityValues: Record<string, WorkItemPriority> = {
  highest: "urgent",
  urgent: "urgent",
  high: "high",
  medium: "medium",
  low: "low",
  lowest: "low",
  none: "none",
};

export function parseBoundedCsv(csvText: string): ParsedCsv {
  const bytes = Buffer.byteLength(csvText, "utf8");
  if (!bytes)
    throw new CsvBoundaryError("csv_empty", "Choose a non-empty CSV file.");
  if (bytes > MAX_CSV_BYTES) {
    throw new CsvBoundaryError(
      "csv_too_large",
      `CSV files are limited to ${MAX_CSV_BYTES / 1024 / 1024} MB. Split larger exports into batches.`,
    );
  }

  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;

  const pushField = () => {
    if (field.length > MAX_CSV_FIELD_LENGTH) {
      throw new CsvBoundaryError(
        "csv_field_too_large",
        `CSV fields are limited to ${MAX_CSV_FIELD_LENGTH} characters.`,
      );
    }
    record.push(field);
    field = "";
    if (record.length > MAX_CSV_COLUMNS) {
      throw new CsvBoundaryError(
        "csv_too_many_columns",
        `CSV files are limited to ${MAX_CSV_COLUMNS} columns.`,
      );
    }
  };
  const pushRecord = () => {
    pushField();
    if (record.some((value) => value.length > 0)) records.push(record);
    record = [];
    if (records.length > MAX_CSV_ROWS + 1) {
      throw new CsvBoundaryError(
        "csv_too_many_rows",
        `CSV files are limited to ${MAX_CSV_ROWS} data rows. Split larger exports into batches.`,
      );
    }
  };

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    if (quoted) {
      if (character === '"' && csvText[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += character;
      }
      continue;
    }
    if (closedQuote) {
      if (character === ",") {
        pushField();
        closedQuote = false;
      } else if (character === "\n") {
        pushRecord();
        closedQuote = false;
      } else if (character === "\r") {
        if (csvText[index + 1] === "\n") index += 1;
        pushRecord();
        closedQuote = false;
      } else {
        throw new CsvBoundaryError(
          "csv_malformed_quote",
          "A closing quote must be followed by a delimiter or line ending.",
        );
      }
      continue;
    }
    if (character === '"') {
      if (field.length) {
        throw new CsvBoundaryError(
          "csv_malformed_quote",
          "A quoted field must begin immediately after a delimiter.",
        );
      }
      quoted = true;
    } else if (character === ",") {
      pushField();
    } else if (character === "\n") {
      pushRecord();
    } else if (character === "\r") {
      if (csvText[index + 1] === "\n") index += 1;
      pushRecord();
    } else {
      field += character;
    }
  }
  if (quoted) {
    throw new CsvBoundaryError(
      "csv_unclosed_quote",
      "The CSV ends inside a quoted field.",
    );
  }
  if (field.length || record.length) pushRecord();
  if (records.length < 2) {
    throw new CsvBoundaryError(
      "csv_no_data",
      "The CSV needs a header and at least one data row.",
    );
  }

  const headers = records[0].map((value, index) => {
    const header = value.replace(/^\uFEFF/, "").trim();
    return header || `Unnamed column ${index + 1}`;
  });
  const oversizedRowIndex = records
    .slice(1)
    .findIndex((values) => values.length > headers.length);
  if (oversizedRowIndex >= 0) {
    throw new CsvBoundaryError(
      "csv_row_too_many_fields",
      `CSV row ${oversizedRowIndex + 2} has more fields than the header. Fix the row before previewing it.`,
    );
  }
  return {
    headers,
    rows: records.slice(1).map((values, index) => ({
      rowNumber: index + 2,
      values: headers.map((_, valueIndex) => values[valueIndex] ?? ""),
    })),
  };
}

export function suggestCsvMapping(
  headers: string[],
  sourceKind: MigrationSourceKind,
): CsvMapping {
  const aliases =
    sourceKind === "jira_csv" ? jiraColumnAliases : genericAliases();
  const columns: Partial<Record<MigrationField, string>> = {};
  for (const field of migrationFields) {
    const match = aliases[field].find((candidate) =>
      headers.some((header) => normalize(header) === normalize(candidate)),
    );
    if (match) {
      columns[field] =
        headers.find((header) => normalize(header) === normalize(match)) ??
        match;
    }
  }
  return {
    columns,
    statusValues: sourceKind === "jira_csv" ? { ...jiraStatusValues } : {},
    priorityValues: sourceKind === "jira_csv" ? { ...jiraPriorityValues } : {},
  };
}

export function buildCsvPreview(input: {
  csvText: string;
  sourceKind: MigrationSourceKind;
  mapping?: Partial<CsvMapping>;
  options: ImportPreviewOptions;
}): CsvPreview {
  const parsed = parseBoundedCsv(input.csvText);
  const batchFingerprint = fingerprint(input.csvText);
  const suggested = suggestCsvMapping(parsed.headers, input.sourceKind);
  const mapping: CsvMapping = {
    columns: { ...suggested.columns, ...(input.mapping?.columns ?? {}) },
    statusValues: normalizeValueMap({
      ...suggested.statusValues,
      ...(input.mapping?.statusValues ?? {}),
    }),
    priorityValues: normalizeValueMap({
      ...suggested.priorityValues,
      ...(input.mapping?.priorityValues ?? {}),
    }),
  };
  validateMappedColumns(parsed.headers, mapping.columns);
  const mappedHeaders = new Set(
    Object.values(mapping.columns)
      .filter((value): value is string => Boolean(value))
      .map(normalize),
  );
  const unsupportedColumns = [
    ...new Set(
      parsed.headers.filter(
        (header, index) =>
          !mappedHeaders.has(normalize(header)) &&
          parsed.rows.some((row) => row.values[index]?.trim()),
      ),
    ),
  ];
  const rows = parsed.rows.map((row) =>
    normalizePreviewRow(
      parsed.headers,
      row,
      mapping,
      input.options,
      unsupportedColumns,
      batchFingerprint,
    ),
  );
  applyHierarchyValidation(rows);
  return {
    headers: parsed.headers,
    mapping,
    unsupportedColumns,
    rows,
    counts: countPreviewRows(rows),
  };
}

function normalizePreviewRow(
  headers: string[],
  row: { rowNumber: number; values: string[] },
  mapping: CsvMapping,
  options: ImportPreviewOptions,
  unsupportedColumns: string[],
  batchFingerprint: string,
): PreviewRow {
  const messages: PreviewMessage[] = [];
  const sourceProjectKey = (
    mappedValue(headers, row.values, mapping.columns.projectKey) ||
    options.defaultProjectKey ||
    ""
  )
    .trim()
    .toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(sourceProjectKey)) {
    messages.push({
      code: "invalid_project_key",
      field: "projectKey",
      message: "Project key must use 2–10 uppercase letters or numbers.",
    });
  }
  let projectName =
    mappedValue(headers, row.values, mapping.columns.projectName).trim() ||
    options.defaultProjectName?.trim() ||
    "";
  if (!projectName && sourceProjectKey) {
    projectName = `Imported ${sourceProjectKey}`;
    messages.push({
      code: "project_name_inferred",
      field: "projectName",
      message:
        "Project name was not supplied; a visible imported name will be used.",
    });
  }
  if (projectName.length < 2 || projectName.length > 160) {
    messages.push({
      code: "invalid_project_name",
      field: "projectName",
      message: "Project name must contain 2–160 characters.",
    });
  }
  const rawIssueKey = mappedValue(
    headers,
    row.values,
    mapping.columns.issueKey,
  ).trim();
  const sourceObjectKey =
    rawIssueKey || `csv-${batchFingerprint}-row-${row.rowNumber}`;
  if (!rawIssueKey) {
    messages.push({
      code: "source_key_inferred",
      field: "issueKey",
      message:
        "No source key was mapped; the exact file fingerprint and CSV row number will identify this item.",
    });
  }
  const title = mappedValue(headers, row.values, mapping.columns.title).trim();
  if (!title || title.length > 240) {
    messages.push({
      code: "invalid_title",
      field: "title",
      message: "Title is required and limited to 240 characters.",
    });
  }
  const description = boundedNullable(
    mappedValue(headers, row.values, mapping.columns.description),
    10_000,
    "description",
    messages,
  );
  const acceptanceCriteria = boundedNullable(
    mappedValue(headers, row.values, mapping.columns.acceptanceCriteria),
    10_000,
    "acceptanceCriteria",
    messages,
  );
  const rawStatus = mappedValue(
    headers,
    row.values,
    mapping.columns.status,
  ).trim();
  const status = rawStatus
    ? mapping.statusValues[normalize(rawStatus)]
    : "backlog";
  if (!status) {
    messages.push({
      code: "unmapped_status",
      field: "status",
      message: `Status “${boundedLabel(rawStatus)}” needs an explicit ScopeDelta mapping.`,
    });
  }
  const rawPriority = mappedValue(
    headers,
    row.values,
    mapping.columns.priority,
  ).trim();
  const priority = rawPriority
    ? mapping.priorityValues[normalize(rawPriority)]
    : "none";
  if (!priority) {
    messages.push({
      code: "unmapped_priority",
      field: "priority",
      message: `Priority “${boundedLabel(rawPriority)}” is unsupported and will remain none.`,
    });
  }
  const rawEstimate = mappedValue(
    headers,
    row.values,
    mapping.columns.estimatePoints,
  ).trim();
  const estimatePoints = parseEstimate(rawEstimate, messages);
  const targetDate = parseSourceDate(
    mappedValue(headers, row.values, mapping.columns.dueDate),
    "dueDate",
    messages,
  );
  const sourceCreatedAt = parseSourceDateTime(
    mappedValue(headers, row.values, mapping.columns.createdAt),
    "createdAt",
    messages,
  );
  const sourceUpdatedAt = parseSourceDateTime(
    mappedValue(headers, row.values, mapping.columns.updatedAt),
    "updatedAt",
    messages,
  );
  const labels = parseLabels(
    mappedValue(headers, row.values, mapping.columns.labels),
    messages,
  );
  const unsupported = preserveUnsupported(
    headers,
    row.values,
    unsupportedColumns,
    messages,
  );
  const normalized: NormalizedImportRow = {
    rowNumber: row.rowNumber,
    sourceProjectKey,
    projectName,
    sourceObjectKey,
    title,
    description,
    acceptanceCriteria,
    issueType: nullable(
      mappedValue(headers, row.values, mapping.columns.issueType),
      120,
    ),
    status: status ?? "backlog",
    priority: priority ?? "none",
    assigneeIdentity: parseIdentity(
      mappedValue(headers, row.values, mapping.columns.assignee),
    ),
    reporterIdentity: parseIdentity(
      mappedValue(headers, row.values, mapping.columns.reporter),
    ),
    parentSourceObjectKey: nullable(
      mappedValue(headers, row.values, mapping.columns.parentKey),
      120,
    ),
    labels,
    sourceCreatedAt,
    sourceUpdatedAt,
    targetDate,
    estimatePoints,
    sourceUrl: safeSourceUrl(
      mappedValue(headers, row.values, mapping.columns.sourceUrl),
      messages,
    ),
    unsupported,
  };
  for (const [field, value] of Object.entries(normalized)) {
    if (typeof value === "string" && isFormulaLike(value)) {
      messages.push({
        code: "formula_like_text",
        field,
        message:
          "Formula-like source text is stored as inert text and never executed.",
      });
    }
  }
  return finalizePreviewRow(normalized, messages);
}

function applyHierarchyValidation(rows: PreviewRow[]) {
  const identities = new Map<string, PreviewRow[]>();
  for (const row of rows) {
    const key = sourceIdentity(
      row.normalized.sourceProjectKey,
      row.normalized.sourceObjectKey,
    );
    identities.set(key, [...(identities.get(key) ?? []), row]);
  }
  for (const duplicates of identities.values()) {
    if (duplicates.length < 2) continue;
    for (const row of duplicates) {
      addBlockingMessage(row, {
        code: "duplicate_source_key",
        field: "issueKey",
        message:
          "This source key appears more than once in the same source project.",
      });
    }
  }
  for (const row of rows) {
    const parentKey = row.normalized.parentSourceObjectKey;
    if (!parentKey) continue;
    const parent = identities.get(
      sourceIdentity(row.normalized.sourceProjectKey, parentKey),
    )?.[0];
    if (!parent) {
      addBlockingMessage(row, {
        code: "missing_parent",
        field: "parentKey",
        message: `Parent “${boundedLabel(parentKey)}” is not present in this source project.`,
      });
      continue;
    }
    if (parent === row) {
      addBlockingMessage(row, {
        code: "circular_parent",
        field: "parentKey",
        message: "A work item cannot be its own parent.",
      });
    } else if (parent.normalized.parentSourceObjectKey) {
      addBlockingMessage(row, {
        code: "unsupported_hierarchy_depth",
        field: "parentKey",
        message:
          "ScopeDelta supports one parent/subtask level; deeper hierarchy is not flattened.",
      });
    }
  }
}

function addBlockingMessage(row: PreviewRow, message: PreviewMessage) {
  row.messages.push(message);
  row.outcome = "blocked";
  row.fingerprint = fingerprint(row.normalized);
}

function finalizePreviewRow(
  normalized: NormalizedImportRow,
  messages: PreviewMessage[],
): PreviewRow {
  const blockingCodes = new Set([
    "invalid_project_key",
    "invalid_project_name",
    "invalid_title",
    "unmapped_status",
    "field_too_long",
  ]);
  const outcome = messages.some((message) => blockingCodes.has(message.code))
    ? "blocked"
    : messages.length
      ? "warning"
      : "valid";
  return {
    rowNumber: normalized.rowNumber,
    outcome,
    messages,
    normalized,
    fingerprint: fingerprint(normalized),
  };
}

function countPreviewRows(rows: PreviewRow[]) {
  return rows.reduce(
    (counts, row) => {
      counts.total += 1;
      counts[row.outcome] += 1;
      return counts;
    },
    { total: 0, valid: 0, warning: 0, blocked: 0 },
  );
}

function mappedValue(headers: string[], values: string[], header?: string) {
  if (!header) return "";
  return headers
    .map((candidate, index) =>
      normalize(candidate) === normalize(header) ? values[index]?.trim() : "",
    )
    .filter(Boolean)
    .join(", ");
}

function validateMappedColumns(
  headers: string[],
  columns: Partial<Record<MigrationField, string>>,
) {
  for (const [field, header] of Object.entries(columns)) {
    if (
      header &&
      !headers.some((candidate) => normalize(candidate) === normalize(header))
    ) {
      throw new CsvBoundaryError(
        "csv_mapping_column_missing",
        `Mapped ${field} column “${boundedLabel(header)}” is not present in the CSV.`,
      );
    }
  }
}

function genericAliases(): Record<MigrationField, string[]> {
  return Object.fromEntries(
    migrationFields.map((field) => [field, [field, humanize(field)]]),
  ) as Record<MigrationField, string[]>;
}

function humanize(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function normalizeValueMap<T extends string>(values: Record<string, T>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [normalize(key), value]),
  ) as Record<string, T>;
}

function boundedNullable(
  value: string,
  maximum: number,
  field: string,
  messages: PreviewMessage[],
) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maximum) {
    messages.push({
      code: "field_too_long",
      field,
      message: `${humanize(field)} exceeds ${maximum} characters.`,
    });
  }
  return trimmed.slice(0, maximum);
}

function nullable(value: string, maximum: number) {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximum) : null;
}

function parseEstimate(value: string, messages: PreviewMessage[]) {
  if (!value) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 100) {
    messages.push({
      code: "incompatible_estimate",
      field: "estimatePoints",
      message:
        "Only whole-number point estimates from 1–100 are imported; time estimates are not converted.",
    });
    return null;
  }
  return number;
}

function parseLabels(value: string, messages: PreviewMessage[]) {
  const seen = new Set<string>();
  const labels = value
    .split(/[;,]/)
    .map((label) => label.trim())
    .filter((label) => {
      if (!label) return false;
      const key = normalize(label);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (labels.some((label) => label.length > 40) || labels.length > 20) {
    messages.push({
      code: "labels_bounded",
      field: "labels",
      message:
        "Labels are limited to 20 values of 40 characters; excess values are reported and omitted.",
    });
  }
  return labels.filter((label) => label.length <= 40).slice(0, 20);
}

function parseSourceDate(
  value: string,
  field: string,
  messages: PreviewMessage[],
) {
  const parsed = compatibleDate(value);
  if (value.trim() && !parsed) {
    messages.push({
      code: "unsupported_date",
      field,
      message: `${humanize(field)} could not be mapped safely and remains source metadata only.`,
    });
  }
  return parsed;
}

function parseSourceDateTime(
  value: string,
  field: string,
  messages: PreviewMessage[],
) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  const date = compatibleDate(value);
  if (date) return `${date}T00:00:00.000Z`;
  messages.push({
    code: "unsupported_date",
    field,
    message: `${humanize(field)} could not be mapped safely and remains visible in the row report.`,
  });
  return null;
}

function compatibleDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed)?.[1];
  if (iso && validIsoDate(iso)) return iso;
  const jira = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2}|\d{4})/.exec(trimmed);
  if (!jira) return null;
  const months: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const month = months[jira[2].toLowerCase()];
  if (!month) return null;
  const year = jira[3].length === 2 ? `20${jira[3]}` : jira[3];
  const date = `${year}-${month}-${jira[1].padStart(2, "0")}`;
  return validIsoDate(date) ? date : null;
}

function validIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function parseIdentity(value: string): SourceIdentity | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const bracketed = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(trimmed);
  const rawEmail =
    bracketed?.[2] ?? (/^[^\s@]+@[^\s@]+$/.test(trimmed) ? trimmed : null);
  const email = rawEmail?.toLocaleLowerCase("en-US") ?? null;
  const displayName =
    (bracketed?.[1] || (email ? null : trimmed))?.trim() || null;
  return {
    identityKey: email ? `email:${email}` : `name:${normalize(trimmed)}`,
    displayName,
    email,
  };
}

function preserveUnsupported(
  headers: string[],
  values: string[],
  unsupportedColumns: string[],
  messages: PreviewMessage[],
) {
  const unsupported = Object.fromEntries(
    headers
      .map((header, index) => [header, values[index]?.trim()] as const)
      .filter(([header, value]) => unsupportedColumns.includes(header) && value)
      .slice(0, 20)
      .map(([header, value]) => [header, value.slice(0, 2_000)]),
  );
  if (Object.keys(unsupported).length) {
    messages.push({
      code: "unsupported_columns_preserved",
      message:
        "Unsupported source values are preserved as bounded migration metadata and are not applied as workflow fields.",
    });
  }
  return unsupported;
}

function safeSourceUrl(value: string, messages: PreviewMessage[]) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error();
    return url.toString().slice(0, 2_000);
  } catch {
    messages.push({
      code: "invalid_source_url",
      field: "sourceUrl",
      message:
        "Source URL is not HTTP(S); it remains in the row report but is not linked.",
    });
    return null;
  }
}

function isFormulaLike(value: string) {
  return /^[=+\-@]/.test(value.trimStart());
}

function boundedLabel(value: string) {
  return value.slice(0, 80);
}

function sourceIdentity(projectKey: string, objectKey: string) {
  return `${normalize(projectKey)}\u0000${normalize(objectKey)}`;
}

export function fingerprint(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text.trimStart())) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvRecord(values: unknown[]) {
  return values.map(csvCell).join(",");
}
