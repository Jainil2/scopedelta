import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/auth-forms";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Recover access without support."
      description="We send the same response whether or not the address is registered."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
