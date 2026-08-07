import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "@/components/auth-forms";

export default async function SignInPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ callbackURL?: string }>;
}>) {
  const { callbackURL } = await searchParams;
  const safeCallback =
    callbackURL?.startsWith("/") && !callbackURL.startsWith("//")
      ? callbackURL
      : "/app";
  return (
    <AuthShell
      eyebrow="Account access"
      title="Return to your delivery workspace."
      description="Sessions are stored server-side and every workspace read is checked against your membership."
    >
      <SignInForm callbackURL={safeCallback} />
    </AuthShell>
  );
}
