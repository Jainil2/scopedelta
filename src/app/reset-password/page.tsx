import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/auth-forms";

export default async function ResetPasswordPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ token?: string }>;
}>) {
  const { token } = await searchParams;
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password."
      description="A successful reset revokes your existing sessions so every device must authenticate again."
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
