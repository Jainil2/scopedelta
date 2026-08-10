import type { Metadata } from "next";

import { AuthShell } from "@/components/auth-shell";
import { ClientInvitationAcceptance } from "@/components/client-invitation-acceptance";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Accept client invitation — ScopeDelta",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ClientInvitationPage() {
  const session = await getSession();
  return (
    <AuthShell
      eyebrow="Client invitation"
      title="Step into the shared project view."
      description="The invitation is matched to your verified account. Private delivery and commercial notes stay within the project team."
    >
      <ClientInvitationAcceptance signedIn={Boolean(session)} />
    </AuthShell>
  );
}
