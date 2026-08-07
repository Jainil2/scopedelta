import { AuthShell } from "@/components/auth-shell";
import { InvitationAcceptance } from "@/components/platform-forms";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InvitationPage() {
  const session = await getSession();
  return (
    <AuthShell
      eyebrow="Workspace invitation"
      title="Join the right workspace."
      description="Invitation tokens are exchanged from the URL fragment and held only in a secure, short-lived cookie."
    >
      <InvitationAcceptance signedIn={Boolean(session)} />
    </AuthShell>
  );
}
