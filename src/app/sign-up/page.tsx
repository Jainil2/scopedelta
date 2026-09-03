import { WebMcpBridge } from "@/components/webmcp-bridge";
import { AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "@/components/auth-forms";

export default async function SignUpPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ callbackURL?: string }>;
}>) {
  const { callbackURL } = await searchParams;
  return (
    <AuthShell
      eyebrow="Account setup"
      title="Start with a verified identity."
      description="Create your account, verify your work email, then open the first isolated workspace."
    >
      <SignUpForm callbackURL={safeCallback(callbackURL, "/onboarding")} />
      <WebMcpBridge workspaceId="" userId="" surface="public" />
    </AuthShell>
  );
}

function safeCallback(value: string | undefined, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
