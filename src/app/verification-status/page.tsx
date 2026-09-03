import { WebMcpBridge } from "@/components/webmcp-bridge";
import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function VerificationStatusPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ next?: string }>;
}>) {
  const session = await getSession();
  const { next } = await searchParams;
  const destination = safeDestination(next);
  const verified = Boolean(session?.user.emailVerified);

  return (
    <AuthShell
      eyebrow="Identity verification"
      title={verified ? "Email verified." : "Check your email."}
      description={
        verified
          ? "Your database-backed identity is ready. Continue to your requested workspace step."
          : "Open the verification link sent to your work email. Verification links expire after one hour."
      }
    >
      <div className="verification-status" role="status" aria-live="polite">
        <p>
          {verified
            ? "Verification is complete."
            : "For privacy, this status does not reveal whether an account already exists."}
        </p>
        {verified ? (
          <Link className="app-primary-button" href={destination}>
            Continue <span aria-hidden="true">↗</span>
          </Link>
        ) : (
          <Link className="app-secondary-link" href="/sign-in">
            Return to sign in
          </Link>
        )}
      </div>
      <WebMcpBridge workspaceId="" userId="" surface="public" />
    </AuthShell>
  );
}

function safeDestination(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/onboarding";
}
