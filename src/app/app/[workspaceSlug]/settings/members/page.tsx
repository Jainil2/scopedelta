import { MemberManagement } from "@/components/platform-forms";
import { requireSession } from "@/lib/session";
import { getWorkspaceBySlug, listWorkspaceMembers } from "@/server/workspaces";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
  const directory = await listWorkspaceMembers(actor, workspace.id);
  return (
    <div className="app-content">
      <header className="app-page-header">
        <div>
          <p className="app-eyebrow">Workspace access</p>
          <h1>Members and invitations</h1>
          <p>Roles are enforced by the same domain services used by the API.</p>
        </div>
      </header>
      <section className="settings-section" aria-label="Member management">
        <MemberManagement
          workspaceId={workspace.id}
          currentUserId={session.user.id}
          currentRole={directory.role}
          members={directory.members.map((member) => ({
            ...member,
            joinedAt: member.joinedAt.toISOString(),
          }))}
          invitations={directory.invitations.map((invitation) => ({
            ...invitation,
            expiresAt: invitation.expiresAt.toISOString(),
          }))}
        />
      </section>
    </div>
  );
}
