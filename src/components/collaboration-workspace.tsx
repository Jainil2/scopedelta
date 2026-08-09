"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { ProjectTabs } from "@/components/planning-workspace";

type Project = { id: string; key: string; name: string; clientName: string };
type PageInfo = { number: number; size: number; total: number; pages: number };
type Member = { userId: string; name: string };
type Activity = {
  id: string;
  actorName: string;
  description: string;
  occurredAt: string | Date;
};
type Note = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  updatedAt: string | Date;
  archivedAt: string | Date | null;
};
type Comment = {
  id: string;
  parentCommentId: string | null;
  authorUserId: string;
  authorName: string;
  body: string | null;
  version: number;
  editedAt: string | Date | null;
  deletedAt: string | Date | null;
  createdAt: string | Date;
  contextOnly?: boolean;
};
type CommentRevision = {
  id: string;
  version: number;
  body: string;
  editorName: string;
  createdAt: string | Date;
};
type WorkItem = {
  id: string;
  number: number;
  title: string;
  status: string;
  archivedAt: string | Date | null;
};
type Notification = {
  id: string;
  kind: "mention" | "work_item_assigned" | "comment_added" | "comment_reply";
  actorName: string | null;
  projectKey: string;
  projectId: string;
  workItemId: string | null;
  workItemNumber: number | null;
  projectNoteId: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
};

async function mutate<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
) {
  const response = await fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message ?? "The change could not be saved.");
  return payload.data as T;
}

function ProjectHeader({
  project,
  workspaceSlug,
  current,
  title,
  detail,
}: Readonly<{
  project: Project;
  workspaceSlug: string;
  current: "brief" | "activity";
  title: string;
  detail: string;
}>) {
  return (
    <header className="project-header">
      <div>
        <p className="eyebrow">{project.clientName}</p>
        <div className="delivery-row-title">
          <span className="project-key">{project.key}</span>
          <h1>{title}</h1>
        </div>
        <p>
          {detail} · {project.name}
        </p>
      </div>
      <ProjectTabs
        workspaceSlug={workspaceSlug}
        projectKey={project.key}
        current={current}
      />
    </header>
  );
}

function MentionControl({
  members,
  workspaceId,
  projectId,
  onInsert,
}: Readonly<{
  members: Member[];
  workspaceId: string;
  projectId: string;
  onInsert: (value: string) => void;
}>) {
  const [options, setOptions] = useState(members);
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [resultPage, setResultPage] = useState<PageInfo | null>(null);
  const [searching, startSearch] = useTransition();
  const search = (page = 1) =>
    startSearch(async () => {
      try {
        setStatus("");
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "50",
        });
        if (query.trim()) params.set("query", query.trim());
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/projects/${projectId}/mentionable-members?${params}`,
        );
        const payload = (await response.json()) as {
          data?: { data: Member[]; page: PageInfo };
          error?: { message?: string };
        };
        if (!response.ok || !payload.data) {
          throw new Error(
            payload.error?.message ?? "Unable to find project members.",
          );
        }
        setOptions(payload.data.data);
        setResultPage(payload.data.page);
        setUserId("");
        setStatus(
          payload.data.page.total
            ? `${payload.data.page.total} matching project members.`
            : "No matching project members.",
        );
      } catch (cause) {
        setResultPage(null);
        setStatus(
          cause instanceof Error
            ? cause.message
            : "Unable to find project members.",
        );
      }
    });
  return (
    <div className="mention-picker">
      <div className="mention-search">
        <label>
          Find member
          <input
            value={query}
            maxLength={100}
            placeholder="Search by name"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                search(1);
              }
            }}
          />
        </label>
        <button
          type="button"
          className="button-secondary"
          disabled={searching}
          onClick={() => search(1)}
        >
          {searching ? "Searching…" : "Search members"}
        </button>
      </div>
      <div className="mention-control">
        <label>
          Mention
          <select
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">Choose a project member</option>
            {options.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button-secondary"
          disabled={!userId}
          onClick={() => {
            const member = options.find(
              (candidate) => candidate.userId === userId,
            );
            if (member) onInsert(`@[${member.name}](user:${member.userId})`);
          }}
        >
          Insert mention
        </button>
      </div>
      {status ? (
        <p className="metadata" role="status">
          {status}
        </p>
      ) : null}
      {resultPage && resultPage.pages > 1 ? (
        <div className="mention-result-pages">
          <button
            type="button"
            className="text-button"
            disabled={searching || resultPage.number <= 1}
            onClick={() => search(resultPage.number - 1)}
          >
            Previous matches
          </button>
          <span className="metadata">
            Page {resultPage.number} of {resultPage.pages}
          </span>
          <button
            type="button"
            className="text-button"
            disabled={searching || resultPage.number >= resultPage.pages}
            onClick={() => search(resultPage.number + 1)}
          >
            Next matches
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ProjectBriefWorkspace({
  workspaceId,
  workspaceSlug,
  project,
  initialNotes,
  members,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  project: Project;
  initialNotes: Note[];
  members: Member[];
}>) {
  const [notes, setNotes] = useState(initialNotes);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [showingArchived, setShowingArchived] = useState(false);
  const [pending, startTransition] = useTransition();
  const base = `/api/v1/workspaces/${workspaceId}/projects/${project.id}/notes`;
  const save = () =>
    startTransition(async () => {
      try {
        setError("");
        const note = editingNoteId
          ? await mutate<Note>(`${base}/${editingNoteId}`, "PATCH", {
              title,
              body,
            })
          : await mutate<Note>(base, "POST", {
              requestId: crypto.randomUUID(),
              title,
              body,
            });
        setNotes((current) =>
          editingNoteId
            ? current.map((item) => (item.id === editingNoteId ? note : item))
            : [note, ...current],
        );
        setTitle("");
        setBody("");
        setEditingNoteId(null);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Unable to save note.",
        );
      }
    });
  const loadNotes = (archived: boolean) =>
    startTransition(async () => {
      try {
        const response = await fetch(
          `${base}?archived=${archived}&pageSize=50`,
        );
        const payload = (await response.json()) as {
          data?: { data: Note[] };
          error?: { message?: string };
        };
        if (!response.ok || !payload.data)
          throw new Error(payload.error?.message ?? "Unable to load notes.");
        setNotes(payload.data.data);
        setShowingArchived(archived);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Unable to load notes.",
        );
      }
    });
  const toggleArchive = (note: Note) =>
    startTransition(async () => {
      try {
        const updated = await mutate<Note>(`${base}/${note.id}`, "PATCH", {
          archived: !note.archivedAt,
        });
        setNotes((current) =>
          current.map((item) => (item.id === note.id ? updated : item)),
        );
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Unable to update note.",
        );
      }
    });
  return (
    <section className="collaboration-page">
      <ProjectHeader
        project={project}
        workspaceSlug={workspaceSlug}
        current="brief"
        title="Project brief"
        detail="Durable context for the delivery team"
      />
      <div className="collaboration-split">
        <form
          className="context-composer"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div>
            <p className="eyebrow">
              {editingNoteId ? "Edit context note" : "New context note"}
            </p>
            <h2>
              {editingNoteId
                ? "Refine the shared context"
                : "Capture a decision or constraint"}
            </h2>
          </div>
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              required
            />
          </label>
          <label>
            Context
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={8}
              maxLength={20_000}
              required
            />
          </label>
          <MentionControl
            members={members}
            workspaceId={workspaceId}
            projectId={project.id}
            onInsert={(mention) =>
              setBody((value) => `${value}${value ? " " : ""}${mention} `)
            }
          />
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="composer-actions">
            <button type="submit" disabled={pending}>
              {editingNoteId ? "Save changes" : "Save note"}
            </button>
            {editingNoteId ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setEditingNoteId(null);
                  setTitle("");
                  setBody("");
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
        <div className="context-ledger" aria-live="polite">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Team context</p>
              <h2>{notes.length} notes</h2>
            </div>
            <button
              type="button"
              className="text-button"
              disabled={pending}
              onClick={() => loadNotes(!showingArchived)}
            >
              {showingArchived ? "Show active" : "Show archived"}
            </button>
          </div>
          {notes.length === 0 ? (
            <p className="empty-copy">
              No context notes yet. Capture the first decision the team should
              not lose.
            </p>
          ) : (
            notes.map((note) => (
              <article
                className={
                  note.archivedAt ? "context-note is-archived" : "context-note"
                }
                key={note.id}
              >
                <div>
                  <h3>{note.title}</h3>
                  <p className="metadata">
                    {note.authorName} · {formatDate(note.updatedAt)}
                  </p>
                </div>
                <p className="context-body">{displayBody(note.body)}</p>
                <div className="comment-actions">
                  {!note.archivedAt ? (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setEditingNoteId(note.id);
                        setTitle(note.title);
                        setBody(note.body);
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-button"
                    disabled={pending}
                    onClick={() => toggleArchive(note)}
                  >
                    {note.archivedAt ? "Restore" : "Archive"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export function ActivityWorkspace({
  workspaceSlug,
  project,
  activities,
  page,
}: Readonly<{
  workspaceSlug: string;
  project: Project;
  activities: Activity[];
  page: PageInfo;
}>) {
  return (
    <section className="collaboration-page">
      <ProjectHeader
        project={project}
        workspaceSlug={workspaceSlug}
        current="activity"
        title="Project activity"
        detail="A factual, privacy-safe delivery timeline"
      />
      <ActivityLedger activities={activities} />
      <p className="metadata">
        Showing {activities.length} of {page.total} events.
      </p>
      <Pagination
        page={page}
        ariaLabel="Project activity pages"
        href={(number) =>
          `/app/${workspaceSlug}/projects/${project.key}/activity?page=${number}`
        }
      />
    </section>
  );
}

function Pagination({
  page,
  ariaLabel,
  href,
}: Readonly<{
  page: PageInfo;
  ariaLabel: string;
  href: (page: number) => string;
}>) {
  if (page.pages <= 1) return null;
  return (
    <nav className="pagination" aria-label={ariaLabel}>
      {page.number > 1 ? (
        <Link href={href(page.number - 1)}>Previous</Link>
      ) : (
        <span />
      )}
      <span>
        Page {page.number} of {page.pages}
      </span>
      {page.number < page.pages ? (
        <Link href={href(page.number + 1)}>Next</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function workCollaborationHref(
  workspaceSlug: string,
  projectKey: string,
  workItemId: string,
  commentPage: number,
  activityPage: number,
) {
  const params = new URLSearchParams();
  if (commentPage > 1) params.set("commentPage", String(commentPage));
  if (activityPage > 1) params.set("activityPage", String(activityPage));
  const query = params.toString();
  const path = `/app/${workspaceSlug}/projects/${projectKey}/work/${workItemId}`;
  return query ? `${path}?${query}` : path;
}

function ActivityLedger({ activities }: Readonly<{ activities: Activity[] }>) {
  return (
    <ol className="activity-ledger">
      {activities.length === 0 ? (
        <li className="empty-copy">No activity has been recorded yet.</li>
      ) : (
        activities.map((activity) => (
          <li key={activity.id}>
            <span className="activity-marker" aria-hidden="true" />
            <div>
              <p>
                <strong>{activity.actorName}</strong> {activity.description}
              </p>
              <time dateTime={new Date(activity.occurredAt).toISOString()}>
                {formatDate(activity.occurredAt)}
              </time>
            </div>
          </li>
        ))
      )}
    </ol>
  );
}

export function WorkCollaborationWorkspace({
  actorUserId,
  workspaceId,
  workspaceSlug,
  project,
  workItem,
  initialComments,
  commentPage,
  activities,
  activityPage,
  members,
  initialWatching,
  commercialPanel,
}: Readonly<{
  actorUserId: string;
  workspaceId: string;
  workspaceSlug: string;
  project: Project;
  workItem: WorkItem;
  initialComments: Comment[];
  commentPage: PageInfo;
  activities: Activity[];
  activityPage: PageInfo;
  members: Member[];
  initialWatching: boolean;
  commercialPanel?: ReactNode;
}>) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [watching, setWatching] = useState(initialWatching);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const base = `/api/v1/workspaces/${workspaceId}/projects/${project.id}/work-items/${workItem.id}`;
  const roots = useMemo(() => {
    const byId = new Map(comments.map((comment) => [comment.id, comment]));
    const rootIds: string[] = [];
    const seen = new Set<string>();
    for (const comment of comments) {
      const rootId =
        comment.parentCommentId && byId.has(comment.parentCommentId)
          ? comment.parentCommentId
          : comment.id;
      if (!seen.has(rootId)) {
        seen.add(rootId);
        rootIds.push(rootId);
      }
    }
    return rootIds
      .map((rootId) => byId.get(rootId))
      .filter((comment): comment is Comment => Boolean(comment));
  }, [comments]);
  const submit = () =>
    startTransition(async () => {
      try {
        setError("");
        const comment = await mutate<Comment>(`${base}/comments`, "POST", {
          requestId: crypto.randomUUID(),
          body,
          parentCommentId: replyTo,
        });
        setComments((current) => [comment, ...current]);
        setWatching(true);
        setBody("");
        setReplyTo(null);
        if (commentPage.number > 1) {
          router.replace(
            workCollaborationHref(
              workspaceSlug,
              project.key,
              workItem.id,
              1,
              activityPage.number,
            ),
          );
        } else {
          router.refresh();
        }
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Unable to add comment.",
        );
      }
    });
  const remove = (commentId: string) =>
    startTransition(async () => {
      try {
        await mutate(`${base}/comments/${commentId}`, "DELETE");
        setComments((current) =>
          current.map((comment) =>
            comment.id === commentId
              ? { ...comment, body: null, deletedAt: new Date().toISOString() }
              : comment,
          ),
        );
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Unable to delete comment.",
        );
      }
    });
  const edit = async (commentId: string, nextBody: string) => {
    const updated = await mutate<Comment>(
      `${base}/comments/${commentId}`,
      "PATCH",
      { body: nextBody },
    );
    setComments((current) =>
      current.map((comment) => (comment.id === commentId ? updated : comment)),
    );
  };
  const toggleWatch = () =>
    startTransition(async () => {
      try {
        const result = await mutate<{ watching: boolean }>(
          `${base}/subscription`,
          "PATCH",
          { watching: !watching },
        );
        setWatching(result.watching);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to update watch status.",
        );
      }
    });
  return (
    <section className="collaboration-page">
      <header className="work-context-header">
        <div>
          <Link
            className="back-link"
            href={`/app/${workspaceSlug}/projects/${project.key}/backlog`}
          >
            ← Back to backlog
          </Link>
          <p className="eyebrow">
            {project.key}-{workItem.number} ·{" "}
            {workItem.status.replaceAll("_", " ")}
          </p>
          <h1>{workItem.title}</h1>
        </div>
        <button
          type="button"
          className="button-secondary"
          onClick={toggleWatch}
          disabled={pending}
        >
          {watching ? "Watching" : "Watch"}
        </button>
      </header>
      {commercialPanel}
      <div className="work-collaboration-grid">
        <div className="discussion-thread">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Discussion</p>
              <h2>{commentPage.total} comments</h2>
            </div>
          </div>
          {roots.map((comment) => (
            <div key={comment.id} className="thread-group">
              {comment.contextOnly ? (
                <p className="metadata">Parent context from another page</p>
              ) : null}
              <CommentRow
                comment={comment}
                canDelete={
                  !comment.contextOnly && comment.authorUserId === actorUserId
                }
                onDelete={remove}
                onEdit={edit}
                historyUrl={`${base}/comments/${comment.id}/history`}
                onReply={
                  comment.contextOnly ? undefined : () => setReplyTo(comment.id)
                }
              />
              {comments
                .filter((reply) => reply.parentCommentId === comment.id)
                .map((reply) => (
                  <div className="thread-reply" key={reply.id}>
                    <CommentRow
                      comment={reply}
                      canDelete={reply.authorUserId === actorUserId}
                      onDelete={remove}
                      onEdit={edit}
                      historyUrl={`${base}/comments/${reply.id}/history`}
                    />
                  </div>
                ))}
            </div>
          ))}
          <p className="metadata">
            Showing page {commentPage.number} of {commentPage.pages || 1}.
          </p>
          <Pagination
            page={commentPage}
            ariaLabel="Discussion pages"
            href={(number) =>
              workCollaborationHref(
                workspaceSlug,
                project.key,
                workItem.id,
                number,
                activityPage.number,
              )
            }
          />
          <form
            className="comment-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div>
              <label htmlFor="comment-body">
                {replyTo ? "Reply" : "Add a comment"}
              </label>
              {replyTo ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setReplyTo(null)}
                >
                  Cancel reply
                </button>
              ) : null}
            </div>
            <textarea
              id="comment-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              maxLength={10_000}
              required
              disabled={Boolean(workItem.archivedAt)}
            />
            <MentionControl
              members={members}
              workspaceId={workspaceId}
              projectId={project.id}
              onInsert={(mention) =>
                setBody((value) => `${value}${value ? " " : ""}${mention} `)
              }
            />
            {workItem.archivedAt ? (
              <p className="metadata">
                Restore this work item before adding comments.
              </p>
            ) : null}
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending || Boolean(workItem.archivedAt)}
            >
              Comment
            </button>
          </form>
        </div>
        <aside className="work-activity">
          <p className="eyebrow">Activity</p>
          <h2>Delivery history</h2>
          <ActivityLedger activities={activities} />
          <p className="metadata">
            Showing page {activityPage.number} of {activityPage.pages || 1}.
          </p>
          <Pagination
            page={activityPage}
            ariaLabel="Work activity pages"
            href={(number) =>
              workCollaborationHref(
                workspaceSlug,
                project.key,
                workItem.id,
                commentPage.number,
                number,
              )
            }
          />
        </aside>
      </div>
    </section>
  );
}

function CommentRow({
  comment,
  canDelete,
  onDelete,
  onEdit,
  historyUrl,
  onReply,
}: Readonly<{
  comment: Comment;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string, body: string) => Promise<void>;
  historyUrl: string;
  onReply?: () => void;
}>) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body ?? "");
  const [history, setHistory] = useState<CommentRevision[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function toggleHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(historyUrl);
      const payload = (await response.json()) as {
        data?: { data: CommentRevision[] };
      };
      if (!response.ok || !payload.data)
        throw new Error("Unable to load comment history.");
      setHistory(payload.data.data);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="comment-row">
      <div className="comment-meta">
        <strong>{comment.authorName}</strong>
        <time dateTime={new Date(comment.createdAt).toISOString()}>
          {formatDate(comment.createdAt)}
        </time>
        {comment.editedAt ? <span>edited</span> : null}
      </div>
      <p>
        {comment.deletedAt ? (
          <em>
            Comment deleted. Version history is retained for authorized project
            members.
          </em>
        ) : (
          displayBody(comment.body ?? "")
        )}
      </p>
      {editing ? (
        <form
          className="inline-comment-edit"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            void onEdit(comment.id, editBody)
              .then(() => setEditing(false))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Edit comment
            <textarea
              value={editBody}
              onChange={(event) => setEditBody(event.target.value)}
              rows={4}
              maxLength={10_000}
              required
            />
          </label>
          <div className="comment-actions">
            <button disabled={busy}>Save edit</button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditing(false);
                setEditBody(comment.body ?? "");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {history ? (
        <ol className="comment-history">
          {history.map((revision) => (
            <li key={revision.id}>
              <strong>Version {revision.version}</strong> ·{" "}
              {revision.editorName}
              <time dateTime={new Date(revision.createdAt).toISOString()}>
                {formatDate(revision.createdAt)}
              </time>
              <p>{displayBody(revision.body)}</p>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="comment-actions">
        {onReply && !comment.deletedAt ? (
          <button type="button" className="text-button" onClick={onReply}>
            Reply
          </button>
        ) : null}
        {canDelete && !comment.deletedAt ? (
          <button
            type="button"
            className="text-button"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        ) : null}
        {comment.version > 1 || comment.deletedAt ? (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void toggleHistory()}
          >
            {history ? "Hide history" : "History"}
          </button>
        ) : null}
        {canDelete && !comment.deletedAt ? (
          <button
            type="button"
            className="text-button danger-text"
            onClick={() => {
              if (
                window.confirm(
                  "Delete this comment? Its version history remains available to authorized project members.",
                )
              )
                onDelete(comment.id);
            }}
          >
            Delete
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function InboxWorkspace({
  workspaceId,
  workspaceSlug,
  initialNotifications,
  page,
}: Readonly<{
  workspaceId: string;
  workspaceSlug: string;
  initialNotifications: Notification[];
  page: PageInfo;
}>) {
  const [items, setItems] = useState(initialNotifications);
  const [pending, startTransition] = useTransition();
  const unread = items.filter((item) => !item.readAt).length;
  const mark = (ids: string[], read: boolean) =>
    startTransition(async () => {
      await mutate(`/api/v1/workspaces/${workspaceId}/notifications`, "PATCH", {
        ids,
        read,
      });
      setItems((current) =>
        current.map((item) =>
          ids.includes(item.id)
            ? { ...item, readAt: read ? new Date().toISOString() : null }
            : item,
        ),
      );
    });
  return (
    <section className="collaboration-page inbox-page">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Personal inbox</p>
          <h1>Notifications</h1>
          <p>
            Mentions, assignments, and discussion updates from projects you can
            still access.
          </p>
        </div>
        {unread ? (
          <button
            type="button"
            className="button-secondary"
            disabled={pending}
            onClick={() =>
              mark(
                items.filter((item) => !item.readAt).map((item) => item.id),
                true,
              )
            }
          >
            Mark all read
          </button>
        ) : null}
      </header>
      <div className="notification-list">
        {items.length === 0 ? (
          <p className="empty-copy">You are all caught up.</p>
        ) : (
          items.map((item) => {
            const href = item.workItemId
              ? `/app/${workspaceSlug}/projects/${item.projectKey}/work/${item.workItemId}`
              : `/app/${workspaceSlug}/projects/${item.projectKey}/brief`;
            return (
              <article
                key={item.id}
                className={
                  item.readAt
                    ? "notification-row"
                    : "notification-row is-unread"
                }
              >
                <span className="notification-dot" aria-hidden="true" />
                <div>
                  <p>
                    <strong>{item.actorName ?? "A former member"}</strong>{" "}
                    {notificationLabel(item.kind)}{" "}
                    <span className="project-key">
                      {item.projectKey}
                      {item.workItemNumber ? `-${item.workItemNumber}` : ""}
                    </span>
                  </p>
                  <time dateTime={new Date(item.createdAt).toISOString()}>
                    {formatDate(item.createdAt)}
                  </time>
                </div>
                <div className="notification-actions">
                  <Link
                    href={href}
                    onClick={() => {
                      if (!item.readAt) mark([item.id], true);
                    }}
                  >
                    Open
                  </Link>
                  <button
                    type="button"
                    className="text-button"
                    disabled={pending}
                    onClick={() => mark([item.id], !item.readAt)}
                  >
                    {item.readAt ? "Mark unread" : "Mark read"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
      <p className="metadata">
        Showing {items.length} of {page.total} accessible notifications.
      </p>
      {page.pages > 1 ? (
        <nav className="pagination" aria-label="Notification pages">
          {page.number > 1 ? (
            <Link href={`/app/${workspaceSlug}/inbox?page=${page.number - 1}`}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page.number} of {page.pages}
          </span>
          {page.number < page.pages ? (
            <Link href={`/app/${workspaceSlug}/inbox?page=${page.number + 1}`}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}

function notificationLabel(kind: Notification["kind"]) {
  if (kind === "mention") return "mentioned you";
  if (kind === "work_item_assigned") return "assigned work to you";
  if (kind === "comment_reply") return "replied to your comment";
  return "added a comment to watched work";
}

function displayBody(value: string) {
  return value.replace(/@\[([^\]\n]{1,100})\]\(user:[0-9a-f-]{36}\)/gi, "@$1");
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
