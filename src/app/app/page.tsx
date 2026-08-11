import { redirect } from "next/navigation";

import { requireSession } from "@/lib/session";
import { listClientProjects } from "@/server/client-collaboration";
import { listWorkspaces } from "@/server/workspaces";

export default async function AppEntryPage() {
  const session = await requireSession();
  const workspaces = await listWorkspaces({
    userId: session.user.id,
    email: session.user.email,
  });
  if (workspaces[0]) redirect(`/app/${workspaces[0].slug}`);
  const clientProjects = await listClientProjects({
    userId: session.user.id,
    email: session.user.email,
  });
  redirect(clientProjects.length ? "/client" : "/onboarding");
}
