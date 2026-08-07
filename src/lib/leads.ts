export const MAX_LEAD_BODY_BYTES = 16 * 1024;

export const leadFieldLimits = {
  name: 100,
  email: 254,
  company: 120,
  scopeChallenge: 1000,
  website: 200,
} as const;

export type BusinessType = "agency" | "freelancer";

export type LeadSubmission = {
  submissionId: string;
  name: string;
  email: string;
  businessType: BusinessType;
  company: string | null;
  scopeChallenge: string;
  website: string;
};

export type LeadField =
  | "submissionId"
  | "name"
  | "email"
  | "businessType"
  | "company"
  | "scopeChallenge";

export type LeadFieldErrors = Partial<Record<LeadField, string>>;

export type LeadApiResponse =
  | { ok: true }
  | {
      ok: false;
      code: "validation_error" | "payload_too_large" | "submission_unavailable";
      message: string;
      fieldErrors?: LeadFieldErrors;
    };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateLeadSubmission(
  input: unknown,
):
  | { success: true; data: LeadSubmission }
  | { success: false; fieldErrors: LeadFieldErrors } {
  const value =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};

  const submissionId = stringValue(value.submissionId);
  const name = stringValue(value.name);
  const email = stringValue(value.email).toLowerCase();
  const businessType = stringValue(value.businessType);
  const company = stringValue(value.company);
  const scopeChallenge = stringValue(value.scopeChallenge);
  const website = stringValue(value.website);
  const fieldErrors: LeadFieldErrors = {};

  if (!uuidPattern.test(submissionId)) {
    fieldErrors.submissionId = "Please refresh the page and try again.";
  }

  if (name.length < 2 || name.length > leadFieldLimits.name) {
    fieldErrors.name = "Enter your name (2–100 characters).";
  }

  if (!emailPattern.test(email) || email.length > leadFieldLimits.email) {
    fieldErrors.email = "Enter a valid email address.";
  }

  if (businessType !== "agency" && businessType !== "freelancer") {
    fieldErrors.businessType = "Choose agency or freelancer.";
  }

  if (company.length > leadFieldLimits.company) {
    fieldErrors.company = "Keep the company name under 120 characters.";
  }

  if (scopeChallenge.length < 20) {
    fieldErrors.scopeChallenge =
      "Share at least 20 characters about your scope challenge.";
  } else if (scopeChallenge.length > leadFieldLimits.scopeChallenge) {
    fieldErrors.scopeChallenge =
      "Keep the scope challenge under 1,000 characters.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    data: {
      submissionId,
      name,
      email,
      businessType: businessType as BusinessType,
      company: company || null,
      scopeChallenge,
      website: website.slice(0, leadFieldLimits.website),
    },
  };
}
