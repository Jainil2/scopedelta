"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

type Status = { kind: "idle" | "error" | "success"; message: string };

const idle: Status = { kind: "idle", message: "" };

export function SignUpForm({
  callbackURL = "/onboarding",
}: {
  callbackURL?: string;
}) {
  const [status, setStatus] = useState(idle);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("confirmPassword") ?? "")) {
      setStatus({ kind: "error", message: "Passwords do not match." });
      return;
    }
    setPending(true);
    setStatus(idle);
    const result = await authClient.signUp.email({
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "")
        .trim()
        .toLowerCase(),
      password,
      callbackURL: `/verification-status?next=${encodeURIComponent(callbackURL)}`,
    });
    setPending(false);
    if (result.error) {
      setStatus({
        kind: "error",
        message:
          "We could not create the account. Check the fields and try again.",
      });
      return;
    }
    setStatus({
      kind: "success",
      message:
        "Check your email for a verification link. The same message is shown for an existing account.",
    });
    form.reset();
  }

  return (
    <form className="platform-form" onSubmit={submit}>
      <FormControl
        label="Full name"
        name="name"
        autoComplete="name"
        maxLength={100}
      />
      <FormControl
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        maxLength={254}
      />
      <FormControl
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        hint="8–128 characters"
      />
      <FormControl
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
      />
      <SubmitButton pending={pending}>Create account</SubmitButton>
      <FormStatus status={status} />
      <p className="form-alternative">
        Already registered?{" "}
        <Link href={`/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`}>
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function SignInForm({ callbackURL = "/app" }: { callbackURL?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(idle);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    setStatus(idle);
    const result = await authClient.signIn.email({
      email: String(data.get("email") ?? "")
        .trim()
        .toLowerCase(),
      password: String(data.get("password") ?? ""),
      callbackURL,
    });
    setPending(false);
    if (result.error) {
      setStatus({
        kind: "error",
        message:
          result.error.code === "EMAIL_NOT_VERIFIED"
            ? "Verify your email before signing in. A fresh verification link has been sent."
            : "The email or password was not accepted.",
      });
      return;
    }
    router.push(callbackURL);
    router.refresh();
  }

  return (
    <form className="platform-form" onSubmit={submit}>
      <FormControl
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        maxLength={254}
      />
      <FormControl
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        minLength={8}
        maxLength={128}
      />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
      <FormStatus status={status} />
      <div className="form-links">
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href={`/sign-up?callbackURL=${encodeURIComponent(callbackURL)}`}>
          Create account
        </Link>
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [status, setStatus] = useState(idle);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    await authClient.requestPasswordReset({
      email: String(data.get("email") ?? "")
        .trim()
        .toLowerCase(),
      redirectTo: "/reset-password",
    });
    setPending(false);
    setStatus({
      kind: "success",
      message: "If an account exists, a password-reset link is on its way.",
    });
  }

  return (
    <form className="platform-form" onSubmit={submit}>
      <FormControl
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        maxLength={254}
      />
      <SubmitButton pending={pending}>Send reset link</SubmitButton>
      <FormStatus status={status} />
      <p className="form-alternative">
        <Link href="/sign-in">Return to sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(
    token
      ? idle
      : {
          kind: "error",
          message: "This reset link is invalid or has expired.",
        },
  );
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !token) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("confirmPassword") ?? "")) {
      setStatus({ kind: "error", message: "Passwords do not match." });
      return;
    }
    setPending(true);
    const result = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setPending(false);
    if (result.error) {
      setStatus({
        kind: "error",
        message: "This reset link is invalid or has expired.",
      });
      return;
    }
    setStatus({
      kind: "success",
      message: "Password updated. Redirecting to sign in…",
    });
    setTimeout(() => router.push("/sign-in"), 700);
  }

  return (
    <form className="platform-form" onSubmit={submit}>
      <FormControl
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        hint="8–128 characters"
        disabled={!token}
      />
      <FormControl
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        disabled={!token}
      />
      <SubmitButton pending={pending} disabled={!token}>
        Update password
      </SubmitButton>
      <FormStatus status={status} />
    </form>
  );
}

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  async function signOut() {
    if (pending) return;
    setPending(true);
    await authClient.signOut();
    window.location.assign("/sign-in");
  }
  return (
    <button
      className="app-text-button"
      type="button"
      onClick={signOut}
      disabled={pending}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

function FormControl({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  const id = `auth-${props.name}`;
  return (
    <label className="platform-field" htmlFor={id}>
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      <input id={id} required {...props} />
    </label>
  );
}

function SubmitButton({
  pending,
  disabled,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className="app-primary-button"
      type="submit"
      disabled={pending || disabled}
    >
      {pending ? "Please wait…" : children}
      <span aria-hidden="true">↗</span>
    </button>
  );
}

function FormStatus({ status }: { status: Status }) {
  return (
    <p
      className={`platform-status platform-status-${status.kind}`}
      role={status.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {status.message}
    </p>
  );
}
