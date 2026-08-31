"use client";

import {
  cloneElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export function AppField({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: Readonly<{
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}>) {
  const messageId = hint || error ? `${id}-message` : undefined;
  return (
    <div className={`app-field${className ? ` ${className}` : ""}`}>
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {cloneElement(children, {
        id,
        required,
        "aria-describedby": messageId,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <span className="app-field-message app-field-error" id={messageId}>
          {error}
        </span>
      ) : hint ? (
        <span className="app-field-message" id={messageId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function AppInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="app-control" {...props} />;
}

export function AppTextarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return <textarea className="app-control" {...props} />;
}

export function AppSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="app-control" {...props} />;
}

export function AppFormActions({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="app-form-actions">{children}</div>;
}

export function AppButton({
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
}) {
  return <button className={`app-button app-button-${variant}`} {...props} />;
}
