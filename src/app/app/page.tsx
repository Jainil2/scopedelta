import { redirect } from "next/navigation";

import { requireSession } from "@/lib/session";
import { listWorkspaces } from "@/server/workspaces";

export default async function AppEntryPage() {
  const session = await requireSession();
  const workspaces = await listWorkspaces({
    userId: session.user.id,
    email: session.user.email,
  });
  redirect(workspaces[0] ? `/app/${workspaces[0].slug}` : "/onboarding");
}
