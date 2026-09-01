"use client";

import { type FormEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type BusinessType,
  type LeadApiResponse,
  type LeadFieldErrors,
  leadFieldLimits,
  validateLeadSubmission,
} from "@/lib/leads";

type FormValues = {
  name: string;
  email: string;
  businessType: "" | BusinessType;
  company: string;
  scopeChallenge: string;
  website: string;
};

const emptyValues: FormValues = {
  name: "",
  email: "",
  businessType: "",
  company: "",
  scopeChallenge: "",
  website: "",
};

export function LeadForm() {
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [fieldErrors, setFieldErrors] = useState<LeadFieldErrors>({});
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "error" | "success"; message: string }
  >({ kind: "idle" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionId = useRef<string | null>(null);
  const submissionInFlight = useRef(false);

  function updateValue<Key extends keyof FormValues>(
    key: Key,
    value: FormValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    if (status.kind !== "idle") setStatus({ kind: "idle" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInFlight.current) return;

    submissionId.current ??= crypto.randomUUID();
    const payload = { submissionId: submissionId.current, ...values };
    const validation = validateLeadSubmission(payload);

    if (!validation.success) {
      setFieldErrors(validation.fieldErrors);
      setStatus({
        kind: "error",
        message: "Check the highlighted fields and try again.",
      });
      return;
    }

    submissionInFlight.current = true;
    setIsSubmitting(true);
    setFieldErrors({});
    setStatus({ kind: "idle" });

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as LeadApiResponse;

      if (!response.ok || !result.ok) {
        setFieldErrors(result.ok ? {} : (result.fieldErrors ?? {}));
        setStatus({
          kind: "error",
          message: result.ok
            ? "We could not send your application. Please try again."
            : result.message,
        });
        return;
      }

      setValues(emptyValues);
      submissionId.current = null;
      setStatus({
        kind: "success",
        message:
          "Application received. We’ll review your fit for the paid pilot and follow up by email.",
      });
    } catch {
      setStatus({
        kind: "error",
        message:
          "We could not send your application. Your answers are still here—please try again shortly.",
      });
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form className="pilot-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <FormField
          id="name"
          label="Your name"
          error={fieldErrors.name}
          required
        >
          <Input
            id="name"
            name="name"
            autoComplete="name"
            value={values.name}
            maxLength={leadFieldLimits.name}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            onChange={(event) => updateValue("name", event.target.value)}
          />
        </FormField>

        <FormField
          id="email"
          label="Work email"
          error={fieldErrors.email}
          required
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={values.email}
            maxLength={leadFieldLimits.email}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            onChange={(event) => updateValue("email", event.target.value)}
          />
        </FormField>

        <FormField
          id="businessType"
          label="I run or work as"
          error={fieldErrors.businessType}
          required
        >
          <select
            id="businessType"
            name="businessType"
            value={values.businessType}
            aria-invalid={Boolean(fieldErrors.businessType)}
            aria-describedby={
              fieldErrors.businessType ? "businessType-error" : undefined
            }
            onChange={(event) =>
              updateValue(
                "businessType",
                event.target.value as FormValues["businessType"],
              )
            }
          >
            <option value="">Select one</option>
            <option value="agency">A software agency</option>
            <option value="freelancer">A senior freelancer</option>
          </select>
        </FormField>

        <FormField
          id="company"
          label="Company name"
          error={fieldErrors.company}
          hint="Optional"
        >
          <Input
            id="company"
            name="company"
            autoComplete="organization"
            value={values.company}
            maxLength={leadFieldLimits.company}
            aria-invalid={Boolean(fieldErrors.company)}
            aria-describedby={fieldErrors.company ? "company-error" : undefined}
            onChange={(event) => updateValue("company", event.target.value)}
          />
        </FormField>
      </div>

      <FormField
        id="scopeChallenge"
        label="Where does scope creep hurt most today?"
        error={fieldErrors.scopeChallenge}
        hint="A short operational example is enough."
        required
      >
        <Textarea
          id="scopeChallenge"
          name="scopeChallenge"
          rows={5}
          value={values.scopeChallenge}
          maxLength={leadFieldLimits.scopeChallenge}
          aria-invalid={Boolean(fieldErrors.scopeChallenge)}
          aria-describedby={
            fieldErrors.scopeChallenge
              ? "scopeChallenge-error"
              : "scopeChallenge-hint"
          }
          onChange={(event) =>
            updateValue("scopeChallenge", event.target.value)
          }
        />
      </FormField>

      <div className="honeypot" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <Input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(event) => updateValue("website", event.target.value)}
        />
      </div>

      <p className="privacy-note">
        Please do not submit contracts, statements of work, or confidential
        client details. We only need a general description of the challenge.
      </p>

      <div className="form-submit-row">
        <Button
          className="button button-light"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Sending application…" : "Apply for a paid pilot"}
          <span aria-hidden="true">↗</span>
        </Button>
        <p
          className={`form-status form-status-${status.kind}`}
          aria-live="polite"
          role={status.kind === "error" ? "alert" : "status"}
        >
          {status.kind === "idle" ? "" : status.message}
        </p>
      </div>
    </form>
  );
}

function FormField({
  id,
  label,
  error,
  hint,
  required = false,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {error ? (
        <span className="field-message field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : hint ? (
        <span className="field-message" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
