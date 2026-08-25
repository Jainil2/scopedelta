import { MemberManagement } from "@/components/platform-forms";
import {
  parseInput,
  workspaceDirectoryFiltersSchema,
} from "@/lib/platform-validation";
import { requireSession } from "@/lib/session";
import { getWorkspaceBySlug, listWorkspaceMembers } from "@/server/workspaces";

export default async function MembersPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await requireSession();
  const actor = { userId: session.user.id, email: session.user.email };
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(actor, workspaceSlug);
  const query = await searchParams;
  const filters = parseInput(workspaceDirectoryFiltersSchema, {
    page: typeof query.page === "string" ? query.page : undefined,
    invitationPage:
      typeof query.invitationPage === "string"
        ? query.invitationPage
        : undefined,
    query: typeof query.query === "string" ? query.query : undefined,
    role: typeof query.role === "string" ? query.role : undefined,
    status: typeof query.status === "string" ? query.status : undefined,
    invitationState:
      typeof query.invitationState === "string"
        ? query.invitationState
        : undefined,
  });
  const directory = await listWorkspaceMembers(actor, workspace.id, filters);
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
        <form className="operations-filterbar" method="get">
          <label>
            Search directory
            <input name="query" defaultValue={filters.query} maxLength={120} />
          </label>
          <label>
            Access status
            <select name="status" defaultValue={filters.status ?? ""}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <button type="submit">Search members</button>
        </form>
        <MemberManagement
          workspaceId={workspace.id}
          currentUserId={session.user.id}
          currentRole={directory.role}
          workspaceSlug={workspace.slug}
          memberPage={directory.memberPage}
          invitationPage={directory.invitationPage}
          query={filters.query ?? ""}
          members={directory.members.map((member) => ({
            ...member,
            joinedAt: member.joinedAt.toISOString(),
            suspendedAt: member.suspendedAt?.toISOString() ?? null,
          }))}
          invitations={directory.invitations.map((invitation) => ({
            ...invitation,
            expiresAt: invitation.expiresAt.toISOString(),
            lastEmailAttemptAt:
              invitation.lastEmailAttemptAt?.toISOString() ?? null,
          }))}
        />
      </section>
    </div>
  );
}
