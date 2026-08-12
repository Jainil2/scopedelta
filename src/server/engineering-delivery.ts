import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditEvents,
  clientAcceptanceActions,
  clientAcceptanceTargets,
  clientProjectItems,
  commercialBasisLinks,
  commercialDecisions,
  commercialRequests,
  commercialScopeItemRevisions,
  commercialScopeItems,
  defects,
  engineeringProviderInstallations,
  engineeringRepositories,
  implementationArtifacts,
  implementationArtifactSnapshots,
  milestones,
  projects,
  providerWebhookDeliveries,
  users,
  verificationRecords,
  workImplementationLinks,
  workItems,
  workspaces,
  type ImplementationCheckRollup,
} from "@/db/schema";
import type {
  CreateDefectInput,
  CreateVerificationInput,
  EngineeringCoverageFilters,
  ManualImplementationLinkInput,
} from "@/lib/engineering-validation";
import {
  getGitHubAppAuthorizeUrl,
  getGitHubAppInstallUrl,
  isGitHubAppConfigured,
} from "@/lib/env";
import { notFound, PlatformError } from "@/lib/platform-errors";
import {
  exchangeGitHubUserCode,
  getGitHubInstallation,
  getGitHubPullRequestEvidence,
  getGitHubUserInstallationRepository,
  listGitHubPullRequestEvidence,
  type GitHubRepository,
  type ProviderPullRequestEvidence,
} from "@/server/github-provider";
import {
  createGitHubInstallationState,
  verifyGitHubInstallationState,
} from "@/server/github-installation-state";
import {
  assertProjectManager,
  assertWritableProject,
  getProjectAccess,
  type Executor,
  type Transaction,
} from "@/server/delivery";
import type { UserActor } from "@/server/workspaces";

const MAX_RECONCILED_PULLS = 25;
const MAX_COVERAGE_WORK = 1_000;
const MAX_PROJECT_EVIDENCE = 5_000;

async function auditEngineeringEvent(
  transaction: Transaction,
  event: {
    workspaceId: string;
    actorType: "human" | "integration";
    actorId: string | null;
    eventType: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, string | string[]>;
  },
) {
  await transaction.insert(auditEvents).values({
    id: randomUUID(),
    ...event,
    metadata: event.metadata ?? {},
  });
}

async function requireProjectManager(
  database: Executor,
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  const access = await assertWritableProject(
    database,
    actor,
    workspaceId,
    projectId,
  );
  assertProjectManager(access, actor.userId);
  return access;
}

function providerErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "github_app_unconfigured") return "provider_unconfigured";
  if (message.includes("_401") || message.includes("_403")) {
    return "provider_access_revoked";
  }
  if (message.includes("_404")) return "provider_resource_unavailable";
  return "provider_unavailable";
}

function providerUnavailable(error: unknown) {
  return new PlatformError(
    providerErrorCode(error),
    502,
    "GitHub evidence is temporarily unavailable. Existing evidence remains preserved and marked stale.",
  );
}

function artifactFingerprint(evidence: ProviderPullRequestEvidence) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        state: evidence.state,
        headSha: evidence.headSha,
        reviewRollup: evidence.reviewRollup,
        approvalsCount: evidence.approvalsCount,
        changesRequestedCount: evidence.changesRequestedCount,
        checkRollup: evidence.checkRollup,
        mergedAt: evidence.mergedAt?.toISOString() ?? null,
        mergeCommitSha: evidence.mergeCommitSha,
      }),
    )
    .digest("hex");
}

function workFingerprint(work: {
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: work.title,
        description: work.description,
        acceptanceCriteria: work.acceptanceCriteria,
      }),
    )
    .digest("hex");
}

function workNumbersFromEvidence(
  projectKey: string,
  evidence: ProviderPullRequestEvidence,
) {
  const backslash = String.fromCodePoint(92);
  const escaped = projectKey.replace(
    /[.*+?^${}()|[\]\\]/g,
    (character) => `${backslash}${character}`,
  );
  const pattern = new RegExp(
    String.raw`(?:^|[^A-Z0-9])${escaped}-(\d+)(?=$|[^0-9])`,
    "gi",
  );
  const numbers = new Set<number>();
  for (const field of [evidence.title, evidence.headRef]) {
    for (const match of field.matchAll(pattern)) {
      const number = Number(match[1]);
      if (Number.isSafeInteger(number) && number > 0) numbers.add(number);
    }
  }
  return [...numbers].slice(0, 20);
}

async function autoLinkEvidence(
  transaction: Transaction,
  projectId: string,
  projectKey: string,
  artifactId: string,
  evidence: ProviderPullRequestEvidence,
) {
  const numbers = workNumbersFromEvidence(projectKey, evidence);
  if (!numbers.length) return;
  const matchingWork = await transaction
    .select({ id: workItems.id })
    .from(workItems)
    .where(
      and(
        eq(workItems.projectId, projectId),
        inArray(workItems.number, numbers),
      ),
    );
  for (const work of matchingWork) {
    const existing = await transaction
      .select({
        id: workImplementationLinks.id,
        removedAt: workImplementationLinks.removedAt,
      })
      .from(workImplementationLinks)
      .where(
        and(
          eq(workImplementationLinks.workItemId, work.id),
          eq(workImplementationLinks.artifactId, artifactId),
        ),
      )
      .limit(1);
    if (existing[0]) continue;
    await transaction.insert(workImplementationLinks).values({
      id: randomUUID(),
      projectId,
      workItemId: work.id,
      artifactId,
      provenance: "provider_key",
    });
  }
}

/** Server-internal adapter boundary used by reconciliation and provider tests. */
export async function upsertProviderEvidence(
  repositoryId: string,
  evidence: ProviderPullRequestEvidence[],
  actorType: "human" | "integration",
  actorId: string | null,
) {
  const db = getDb();
  const repositoryRows = await db
    .select({
      id: engineeringRepositories.id,
      workspaceId: engineeringRepositories.workspaceId,
      projectId: engineeringRepositories.projectId,
      state: engineeringRepositories.state,
      projectKey: projects.key,
    })
    .from(engineeringRepositories)
    .innerJoin(projects, eq(projects.id, engineeringRepositories.projectId))
    .where(eq(engineeringRepositories.id, repositoryId))
    .limit(1);
  const repository = repositoryRows[0];
  if (repository?.state !== "active") throw notFound();

  await db.transaction(async (transaction) => {
    for (const item of evidence) {
      const existing = await transaction
        .select({
          id: implementationArtifacts.id,
          providerUpdatedAt: implementationArtifacts.providerUpdatedAt,
        })
        .from(implementationArtifacts)
        .where(
          and(
            eq(implementationArtifacts.repositoryId, repository.id),
            eq(
              implementationArtifacts.providerArtifactId,
              item.providerArtifactId,
            ),
          ),
        )
        .limit(1);
      if (
        (existing[0]?.providerUpdatedAt.getTime() ?? Number.NEGATIVE_INFINITY) >
        item.providerUpdatedAt.getTime()
      ) {
        continue;
      }
      const artifactId = existing[0]?.id ?? randomUUID();
      const values = {
        projectId: repository.projectId,
        repositoryId: repository.id,
        provider: "github" as const,
        kind: "pull_request" as const,
        providerArtifactId: item.providerArtifactId,
        number: item.number,
        url: item.url,
        title: item.title,
        state: item.state,
        headRef: item.headRef,
        headSha: item.headSha,
        baseBranch: item.baseBranch,
        authorRef: item.authorRef,
        reviewRollup: item.reviewRollup,
        approvalsCount: item.approvalsCount,
        changesRequestedCount: item.changesRequestedCount,
        checkRollup: item.checkRollup,
        mergedAt: item.mergedAt,
        mergeCommitSha: item.mergeCommitSha,
        providerUpdatedAt: item.providerUpdatedAt,
        syncedAt: new Date(),
        staleAt: null,
        updatedAt: new Date(),
      };
      if (existing[0]) {
        await transaction
          .update(implementationArtifacts)
          .set(values)
          .where(eq(implementationArtifacts.id, artifactId));
      } else {
        await transaction.insert(implementationArtifacts).values({
          id: artifactId,
          ...values,
        });
      }
      await transaction
        .insert(implementationArtifactSnapshots)
        .values({
          id: randomUUID(),
          projectId: repository.projectId,
          artifactId,
          fingerprint: artifactFingerprint(item),
          state: item.state,
          headSha: item.headSha,
          reviewRollup: item.reviewRollup,
          approvalsCount: item.approvalsCount,
          changesRequestedCount: item.changesRequestedCount,
          checkRollup: item.checkRollup,
          mergedAt: item.mergedAt,
          mergeCommitSha: item.mergeCommitSha,
          providerUpdatedAt: item.providerUpdatedAt,
        })
        .onConflictDoNothing();
      await autoLinkEvidence(
        transaction,
        repository.projectId,
        repository.projectKey,
        artifactId,
        item,
      );
    }
    await transaction
      .update(engineeringRepositories)
      .set({
        lastSyncedAt: new Date(),
        staleAt: null,
        lastSyncErrorCode: null,
        updatedAt: new Date(),
      })
      .where(eq(engineeringRepositories.id, repository.id));
    await auditEngineeringEvent(transaction, {
      workspaceId: repository.workspaceId,
      actorType,
      actorId,
      eventType: "engineering.repository.reconciled.v1",
      targetType: "engineering_repository",
      targetId: repository.id,
      metadata: { artifactCount: String(evidence.length) },
    });
  });
}

async function markRepositoryStale(repositoryId: string, error: unknown) {
  const now = new Date();
  await getDb().transaction(async (transaction) => {
    await transaction
      .update(engineeringRepositories)
      .set({
        staleAt: now,
        lastSyncErrorCode: providerErrorCode(error),
        updatedAt: now,
      })
      .where(eq(engineeringRepositories.id, repositoryId));
    await transaction
      .update(implementationArtifacts)
      .set({ staleAt: now, updatedAt: now })
      .where(eq(implementationArtifacts.repositoryId, repositoryId));
  });
}

async function repositoryProviderContext(repositoryId: string) {
  const rows = await getDb()
    .select({
      id: engineeringRepositories.id,
      installationId: engineeringProviderInstallations.providerInstallationId,
      providerRepositoryId: engineeringRepositories.providerRepositoryId,
      owner: engineeringRepositories.owner,
      name: engineeringRepositories.name,
      fullName: engineeringRepositories.fullName,
      url: engineeringRepositories.url,
      defaultBranch: engineeringRepositories.defaultBranch,
      private: engineeringRepositories.private,
      state: engineeringRepositories.state,
    })
    .from(engineeringRepositories)
    .innerJoin(
      engineeringProviderInstallations,
      eq(
        engineeringProviderInstallations.id,
        engineeringRepositories.installationId,
      ),
    )
    .where(eq(engineeringRepositories.id, repositoryId))
    .limit(1);
  if (rows[0]?.state !== "active") throw notFound();
  return rows[0];
}

function asGitHubRepository(
  context: Awaited<ReturnType<typeof repositoryProviderContext>>,
): GitHubRepository {
  return {
    id: Number(context.providerRepositoryId),
    name: context.name,
    full_name: context.fullName,
    html_url: context.url,
    private: context.private,
    default_branch: context.defaultBranch,
    owner: { login: context.owner },
  };
}

async function reconcileRepositoryById(
  repositoryId: string,
  actorType: "human" | "integration",
  actorId: string | null,
  pullNumber?: number,
) {
  const context = await repositoryProviderContext(repositoryId);
  try {
    const repository = asGitHubRepository(context);
    const evidence = pullNumber
      ? [
          await getGitHubPullRequestEvidence(
            context.installationId,
            repository,
            pullNumber,
          ),
        ]
      : await listGitHubPullRequestEvidence(
          context.installationId,
          repository,
          MAX_RECONCILED_PULLS,
        );
    await upsertProviderEvidence(repositoryId, evidence, actorType, actorId);
    return evidence.length;
  } catch (error) {
    await markRepositoryStale(repositoryId, error);
    throw error;
  }
}

export async function createGitHubRepositoryInstallationUrl(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  repositoryFullName: string,
) {
  const access = await requireProjectManager(
    getDb(),
    actor,
    workspaceId,
    projectId,
  );
  const workspaceRows = await getDb()
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspaceRows[0]) throw notFound();
  const returnPath = `/app/${workspaceRows[0].slug}/projects/${access.key}/engineering`;
  const state = createGitHubInstallationState({
    phase: "setup",
    workspaceId,
    projectId,
    userId: actor.userId,
    repositoryFullName,
    returnPath,
    installationId: null,
  });
  return getGitHubAppInstallUrl(state);
}

export async function continueGitHubRepositoryInstallation(
  actor: UserActor,
  stateValue: string,
  installationId: string,
) {
  const state = verifyGitHubInstallationState(
    stateValue,
    "setup",
    actor.userId,
  );
  await requireProjectManager(
    getDb(),
    actor,
    state.workspaceId,
    state.projectId,
  );
  const oauthState = createGitHubInstallationState({
    ...state,
    phase: "oauth",
    installationId,
  });
  return getGitHubAppAuthorizeUrl(oauthState);
}

export async function completeGitHubRepositoryInstallation(
  actor: UserActor,
  stateValue: string,
  code: string,
) {
  const state = verifyGitHubInstallationState(
    stateValue,
    "oauth",
    actor.userId,
  );
  if (!state.installationId) throw notFound();
  await requireProjectManager(
    getDb(),
    actor,
    state.workspaceId,
    state.projectId,
  );
  let installation: Awaited<ReturnType<typeof getGitHubInstallation>>;
  let providerRepository: GitHubRepository;
  try {
    const userAccessToken = await exchangeGitHubUserCode(code);
    providerRepository = await getGitHubUserInstallationRepository(
      userAccessToken,
      state.installationId,
      state.repositoryFullName,
    );
    installation = await getGitHubInstallation(state.installationId);
  } catch (error) {
    const code = providerErrorCode(error);
    if (
      code === "provider_access_revoked" ||
      code === "provider_resource_unavailable"
    ) {
      throw notFound();
    }
    throw providerUnavailable(error);
  }
  await connectAuthorizedGitHubRepository(
    actor,
    state.workspaceId,
    state.projectId,
    {
      installationId: state.installationId,
      repositoryFullName: state.repositoryFullName,
    },
    installation,
    providerRepository,
  );
  return { returnPath: state.returnPath };
}

async function connectAuthorizedGitHubRepository(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: { installationId: string; repositoryFullName: string },
  installation: Awaited<ReturnType<typeof getGitHubInstallation>>,
  providerRepository: GitHubRepository,
) {
  await requireProjectManager(getDb(), actor, workspaceId, projectId);
  if (
    providerRepository.full_name.toLowerCase() !==
    input.repositoryFullName.toLowerCase()
  ) {
    throw notFound();
  }

  const db = getDb();
  const repositoryId = await db.transaction(async (transaction) => {
    await requireProjectManager(transaction, actor, workspaceId, projectId);
    const installationRows = await transaction
      .select({
        id: engineeringProviderInstallations.id,
        workspaceId: engineeringProviderInstallations.workspaceId,
      })
      .from(engineeringProviderInstallations)
      .where(
        and(
          eq(engineeringProviderInstallations.provider, "github"),
          eq(
            engineeringProviderInstallations.providerInstallationId,
            input.installationId,
          ),
        ),
      )
      .limit(1);
    if (
      installationRows[0] &&
      installationRows[0].workspaceId !== workspaceId
    ) {
      throw notFound();
    }
    const installationId = installationRows[0]?.id ?? randomUUID();
    if (installationRows[0]) {
      await transaction
        .update(engineeringProviderInstallations)
        .set({
          accountId: String(installation.account.id),
          accountLogin: installation.account.login,
          state: "active",
          disconnectedAt: null,
          disconnectedByUserId: null,
          updatedAt: new Date(),
        })
        .where(eq(engineeringProviderInstallations.id, installationId));
    } else {
      await transaction.insert(engineeringProviderInstallations).values({
        id: installationId,
        workspaceId,
        provider: "github",
        providerInstallationId: input.installationId,
        accountId: String(installation.account.id),
        accountLogin: installation.account.login,
        connectedByUserId: actor.userId,
      });
    }
    const existing = await transaction
      .select({ id: engineeringRepositories.id })
      .from(engineeringRepositories)
      .where(
        and(
          eq(engineeringRepositories.projectId, projectId),
          eq(engineeringRepositories.provider, "github"),
          eq(
            engineeringRepositories.providerRepositoryId,
            String(providerRepository.id),
          ),
        ),
      )
      .limit(1);
    const id = existing[0]?.id ?? randomUUID();
    const values = {
      workspaceId,
      projectId,
      installationId,
      provider: "github" as const,
      providerRepositoryId: String(providerRepository.id),
      owner: providerRepository.owner.login,
      name: providerRepository.name,
      fullName: providerRepository.full_name,
      url: providerRepository.html_url,
      defaultBranch: providerRepository.default_branch,
      private: providerRepository.private,
      state: "active" as const,
      staleAt: null,
      lastSyncErrorCode: null,
      disconnectedAt: null,
      disconnectedByUserId: null,
      updatedAt: new Date(),
    };
    if (existing[0]) {
      await transaction
        .update(engineeringRepositories)
        .set(values)
        .where(eq(engineeringRepositories.id, id));
    } else {
      await transaction.insert(engineeringRepositories).values({
        id,
        ...values,
        connectedByUserId: actor.userId,
      });
    }
    await auditEngineeringEvent(transaction, {
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "engineering.repository.connected.v1",
      targetType: "engineering_repository",
      targetId: id,
      metadata: { provider: "github", projectId },
    });
    return id;
  });

  try {
    await reconcileRepositoryById(repositoryId, "human", actor.userId);
  } catch {
    // Connection identity and explicit grant were already validated. The stale
    // marker keeps the recoverable provider outage factual for the user.
  }
  return { id: repositoryId, provider: "github" as const };
}

export async function disconnectEngineeringRepository(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  repositoryId: string,
) {
  const now = new Date();
  await getDb().transaction(async (transaction) => {
    await requireProjectManager(transaction, actor, workspaceId, projectId);
    const rows = await transaction
      .select({ id: engineeringRepositories.id })
      .from(engineeringRepositories)
      .where(
        and(
          eq(engineeringRepositories.id, repositoryId),
          eq(engineeringRepositories.projectId, projectId),
          eq(engineeringRepositories.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw notFound();
    await transaction
      .update(engineeringRepositories)
      .set({
        state: "disconnected",
        disconnectedByUserId: actor.userId,
        disconnectedAt: now,
        staleAt: now,
        lastSyncErrorCode: "provider_disconnected",
        updatedAt: now,
      })
      .where(eq(engineeringRepositories.id, repositoryId));
    await transaction
      .update(implementationArtifacts)
      .set({ staleAt: now, updatedAt: now })
      .where(eq(implementationArtifacts.repositoryId, repositoryId));
    await auditEngineeringEvent(transaction, {
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "engineering.repository.disconnected.v1",
      targetType: "engineering_repository",
      targetId: repositoryId,
      metadata: { projectId },
    });
  });
}

export async function reconcileEngineeringRepository(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  repositoryId: string,
) {
  await assertWritableProject(getDb(), actor, workspaceId, projectId);
  const rows = await getDb()
    .select({ id: engineeringRepositories.id })
    .from(engineeringRepositories)
    .where(
      and(
        eq(engineeringRepositories.id, repositoryId),
        eq(engineeringRepositories.workspaceId, workspaceId),
        eq(engineeringRepositories.projectId, projectId),
        eq(engineeringRepositories.state, "active"),
      ),
    )
    .limit(1);
  if (!rows[0]) throw notFound();
  try {
    const artifactCount = await reconcileRepositoryById(
      repositoryId,
      "human",
      actor.userId,
    );
    return { artifactCount };
  } catch (error) {
    throw providerUnavailable(error);
  }
}

export async function linkImplementationEvidence(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: ManualImplementationLinkInput,
) {
  const id = randomUUID();
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const [work, artifact] = await Promise.all([
      transaction
        .select({ id: workItems.id })
        .from(workItems)
        .where(
          and(
            eq(workItems.id, input.workItemId),
            eq(workItems.projectId, projectId),
          ),
        )
        .limit(1),
      transaction
        .select({ id: implementationArtifacts.id })
        .from(implementationArtifacts)
        .where(
          and(
            eq(implementationArtifacts.id, input.artifactId),
            eq(implementationArtifacts.projectId, projectId),
          ),
        )
        .limit(1),
    ]);
    if (!work[0] || !artifact[0]) throw notFound();
    await transaction
      .insert(workImplementationLinks)
      .values({
        id,
        projectId,
        workItemId: input.workItemId,
        artifactId: input.artifactId,
        provenance: "manual",
        createdByUserId: actor.userId,
      })
      .onConflictDoUpdate({
        target: [
          workImplementationLinks.workItemId,
          workImplementationLinks.artifactId,
        ],
        set: {
          provenance: "manual",
          createdByUserId: actor.userId,
          createdAt: new Date(),
          removedByUserId: null,
          removedAt: null,
        },
      });
    await auditEngineeringEvent(transaction, {
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "engineering.implementation.linked.v1",
      targetType: "implementation_artifact",
      targetId: input.artifactId,
      metadata: { workItemId: input.workItemId, provenance: "manual" },
    });
  });
  return { id };
}

export async function unlinkImplementationEvidence(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  linkId: string,
) {
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const rows = await transaction
      .select({
        id: workImplementationLinks.id,
        artifactId: workImplementationLinks.artifactId,
        workItemId: workImplementationLinks.workItemId,
      })
      .from(workImplementationLinks)
      .where(
        and(
          eq(workImplementationLinks.id, linkId),
          eq(workImplementationLinks.projectId, projectId),
          isNull(workImplementationLinks.removedAt),
        ),
      )
      .limit(1);
    if (!rows[0]) throw notFound();
    await transaction
      .update(workImplementationLinks)
      .set({ removedByUserId: actor.userId, removedAt: new Date() })
      .where(eq(workImplementationLinks.id, linkId));
    await auditEngineeringEvent(transaction, {
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "engineering.implementation.unlinked.v1",
      targetType: "implementation_artifact",
      targetId: rows[0].artifactId,
      metadata: { workItemId: rows[0].workItemId },
    });
  });
}

async function targetContext(
  database: Executor,
  projectId: string,
  input: {
    workItemId?: string | null;
    scopeItemRevisionId?: string | null;
    artifactId?: string | null;
    milestoneId?: string | null;
    acceptanceTargetId?: string | null;
    commercialRequestId?: string | null;
    commercialDecisionId?: string | null;
    verificationId?: string | null;
  },
) {
  const checks: Array<Promise<unknown[]>> = [];
  if (input.workItemId) {
    checks.push(
      database
        .select({ id: workItems.id })
        .from(workItems)
        .where(
          and(
            eq(workItems.id, input.workItemId),
            eq(workItems.projectId, projectId),
          ),
        )
        .limit(1),
    );
  }
  if (input.scopeItemRevisionId) {
    checks.push(
      database
        .select({ id: commercialScopeItemRevisions.id })
        .from(commercialScopeItemRevisions)
        .where(
          and(
            eq(commercialScopeItemRevisions.id, input.scopeItemRevisionId),
            eq(commercialScopeItemRevisions.projectId, projectId),
          ),
        )
        .limit(1),
    );
  }
  if (input.artifactId) {
    checks.push(
      database
        .select({ id: implementationArtifacts.id })
        .from(implementationArtifacts)
        .where(
          and(
            eq(implementationArtifacts.id, input.artifactId),
            eq(implementationArtifacts.projectId, projectId),
          ),
        )
        .limit(1),
    );
  }
  if (input.milestoneId) {
    checks.push(
      database
        .select({ id: milestones.id })
        .from(milestones)
        .where(
          and(
            eq(milestones.id, input.milestoneId),
            eq(milestones.projectId, projectId),
          ),
        )
        .limit(1),
    );
  }
  if (input.acceptanceTargetId) {
    checks.push(
      database
        .select({ id: clientAcceptanceTargets.id })
        .from(clientAcceptanceTargets)
        .where(
          and(
            eq(clientAcceptanceTargets.id, input.acceptanceTargetId),
            eq(clientAcceptanceTargets.projectId, projectId),
          ),
        )
        .limit(1),
    );
  }
  if (input.commercialRequestId) {
    checks.push(
      database
        .select({ id: commercialRequests.id })
        .from(commercialRequests)
        .where(
          and(
            eq(commercialRequests.id, input.commercialRequestId),
            eq(commercialRequests.projectId, projectId),
          ),
        )
        .limit(1),
    );
  }
  if (input.commercialDecisionId) {
    checks.push(
      database
        .select({ id: commercialDecisions.id })
        .from(commercialDecisions)
        .where(
          and(
            eq(commercialDecisions.id, input.commercialDecisionId),
            eq(commercialDecisions.projectId, projectId),
          ),
        )
        .limit(1),
    );
  }
  if (input.verificationId) {
    checks.push(
      database
        .select({ id: verificationRecords.id })
        .from(verificationRecords)
        .where(
          and(
            eq(verificationRecords.id, input.verificationId),
            eq(verificationRecords.projectId, projectId),
          ),
        )
        .limit(1),
    );
  }
  const results = await Promise.all(checks);
  if (results.some((result) => result.length !== 1)) throw notFound();
}

export async function createVerificationRecord(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateVerificationInput,
) {
  const id = randomUUID();
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    await targetContext(transaction, projectId, input);
    const [workRows, artifactRows] = await Promise.all([
      input.workItemId
        ? transaction
            .select({
              title: workItems.title,
              description: workItems.description,
              acceptanceCriteria: workItems.acceptanceCriteria,
            })
            .from(workItems)
            .where(eq(workItems.id, input.workItemId))
            .limit(1)
        : Promise.resolve([]),
      input.artifactId
        ? transaction
            .select({ headSha: implementationArtifacts.headSha })
            .from(implementationArtifacts)
            .where(eq(implementationArtifacts.id, input.artifactId))
            .limit(1)
        : Promise.resolve([]),
    ]);
    await transaction.insert(verificationRecords).values({
      id,
      projectId,
      ...input,
      subjectFingerprint: workRows[0] ? workFingerprint(workRows[0]) : null,
      artifactHeadSha: artifactRows[0]?.headSha ?? null,
      recordedByUserId: actor.userId,
    });
    await auditEngineeringEvent(transaction, {
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "engineering.verification.recorded.v1",
      targetType: "verification_record",
      targetId: id,
      metadata: { method: input.method, result: input.result, projectId },
    });
  });
  return { id };
}

export async function createDefect(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  input: CreateDefectInput,
) {
  const id = randomUUID();
  let number = 0;
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    await targetContext(transaction, projectId, input);
    await transaction.execute(
      sql`select id from ${projects} where id = ${projectId} for update`,
    );
    const projectRows = await transaction
      .select({ nextDefectNumber: projects.nextDefectNumber })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projectRows[0]) throw notFound();
    number = projectRows[0].nextDefectNumber;
    await transaction
      .update(projects)
      .set({ nextDefectNumber: number + 1, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    await transaction.insert(defects).values({
      id,
      projectId,
      number,
      ...input,
      createdByUserId: actor.userId,
    });
    await auditEngineeringEvent(transaction, {
      workspaceId,
      actorType: "human",
      actorId: actor.userId,
      eventType: "engineering.defect.created.v1",
      targetType: "defect",
      targetId: id,
      metadata: { severity: input.severity, projectId },
    });
  });
  return { id, number };
}

export async function setDefectStatus(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  defectId: string,
  status: "open" | "resolved",
) {
  await getDb().transaction(async (transaction) => {
    await assertWritableProject(transaction, actor, workspaceId, projectId);
    const rows = await transaction
      .select({ id: defects.id, status: defects.status })
      .from(defects)
      .where(and(eq(defects.id, defectId), eq(defects.projectId, projectId)))
      .limit(1);
    if (!rows[0]) throw notFound();
    if (rows[0].status !== status) {
      await transaction
        .update(defects)
        .set({
          status,
          resolvedAt: status === "resolved" ? new Date() : null,
          resolvedByUserId: status === "resolved" ? actor.userId : null,
          updatedAt: new Date(),
        })
        .where(eq(defects.id, defectId));
      await auditEngineeringEvent(transaction, {
        workspaceId,
        actorType: "human",
        actorId: actor.userId,
        eventType: "engineering.defect.status_updated.v1",
        targetType: "defect",
        targetId: defectId,
        metadata: { from: rows[0].status, to: status },
      });
    }
  });
}

export async function listEngineeringWorkspace(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
) {
  const access = await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const db = getDb();
  const [
    repositoryRows,
    artifactRows,
    linkRows,
    workRows,
    verificationRows,
    defectRows,
    milestoneRows,
    scopeRows,
    requestRows,
    acceptanceRows,
  ] = await Promise.all([
    db
      .select({
        id: engineeringRepositories.id,
        provider: engineeringRepositories.provider,
        fullName: engineeringRepositories.fullName,
        url: engineeringRepositories.url,
        defaultBranch: engineeringRepositories.defaultBranch,
        private: engineeringRepositories.private,
        state: engineeringRepositories.state,
        lastSyncedAt: engineeringRepositories.lastSyncedAt,
        staleAt: engineeringRepositories.staleAt,
        lastSyncErrorCode: engineeringRepositories.lastSyncErrorCode,
      })
      .from(engineeringRepositories)
      .where(eq(engineeringRepositories.projectId, projectId))
      .orderBy(asc(engineeringRepositories.fullName))
      .limit(100),
    db
      .select({
        id: implementationArtifacts.id,
        repositoryId: implementationArtifacts.repositoryId,
        number: implementationArtifacts.number,
        url: implementationArtifacts.url,
        title: implementationArtifacts.title,
        state: implementationArtifacts.state,
        headRef: implementationArtifacts.headRef,
        headSha: implementationArtifacts.headSha,
        baseBranch: implementationArtifacts.baseBranch,
        authorRef: implementationArtifacts.authorRef,
        reviewRollup: implementationArtifacts.reviewRollup,
        approvalsCount: implementationArtifacts.approvalsCount,
        changesRequestedCount: implementationArtifacts.changesRequestedCount,
        checkRollup: implementationArtifacts.checkRollup,
        mergedAt: implementationArtifacts.mergedAt,
        mergeCommitSha: implementationArtifacts.mergeCommitSha,
        providerUpdatedAt: implementationArtifacts.providerUpdatedAt,
        syncedAt: implementationArtifacts.syncedAt,
        staleAt: implementationArtifacts.staleAt,
      })
      .from(implementationArtifacts)
      .where(eq(implementationArtifacts.projectId, projectId))
      .orderBy(
        desc(implementationArtifacts.providerUpdatedAt),
        desc(implementationArtifacts.id),
      )
      .limit(100),
    db
      .select({
        id: workImplementationLinks.id,
        workItemId: workImplementationLinks.workItemId,
        artifactId: workImplementationLinks.artifactId,
        provenance: workImplementationLinks.provenance,
      })
      .from(workImplementationLinks)
      .where(
        and(
          eq(workImplementationLinks.projectId, projectId),
          isNull(workImplementationLinks.removedAt),
        ),
      )
      .limit(MAX_PROJECT_EVIDENCE),
    db
      .select({
        id: workItems.id,
        number: workItems.number,
        title: workItems.title,
        status: workItems.status,
        purpose: workItems.purpose,
        milestoneId: workItems.milestoneId,
      })
      .from(workItems)
      .where(
        and(eq(workItems.projectId, projectId), isNull(workItems.archivedAt)),
      )
      .orderBy(asc(workItems.number))
      .limit(1_000),
    db
      .select({
        id: verificationRecords.id,
        workItemId: verificationRecords.workItemId,
        scopeItemRevisionId: verificationRecords.scopeItemRevisionId,
        artifactId: verificationRecords.artifactId,
        milestoneId: verificationRecords.milestoneId,
        acceptanceTargetId: verificationRecords.acceptanceTargetId,
        method: verificationRecords.method,
        category: verificationRecords.category,
        result: verificationRecords.result,
        referenceUrl: verificationRecords.referenceUrl,
        notes: verificationRecords.notes,
        subjectFingerprint: verificationRecords.subjectFingerprint,
        artifactHeadSha: verificationRecords.artifactHeadSha,
        recordedByName: users.name,
        recordedAt: verificationRecords.recordedAt,
        currentWorkTitle: workItems.title,
        currentWorkDescription: workItems.description,
        currentAcceptanceCriteria: workItems.acceptanceCriteria,
        currentArtifactHeadSha: implementationArtifacts.headSha,
        artifactStaleAt: implementationArtifacts.staleAt,
      })
      .from(verificationRecords)
      .innerJoin(users, eq(users.id, verificationRecords.recordedByUserId))
      .leftJoin(workItems, eq(workItems.id, verificationRecords.workItemId))
      .leftJoin(
        implementationArtifacts,
        eq(implementationArtifacts.id, verificationRecords.artifactId),
      )
      .where(eq(verificationRecords.projectId, projectId))
      .orderBy(
        desc(verificationRecords.recordedAt),
        desc(verificationRecords.id),
      )
      .limit(100),
    db
      .select({
        id: defects.id,
        number: defects.number,
        title: defects.title,
        description: defects.description,
        status: defects.status,
        severity: defects.severity,
        workItemId: defects.workItemId,
        scopeItemRevisionId: defects.scopeItemRevisionId,
        commercialRequestId: defects.commercialRequestId,
        commercialDecisionId: defects.commercialDecisionId,
        artifactId: defects.artifactId,
        verificationId: defects.verificationId,
        milestoneId: defects.milestoneId,
        acceptanceTargetId: defects.acceptanceTargetId,
        detectedAt: defects.detectedAt,
        resolvedAt: defects.resolvedAt,
      })
      .from(defects)
      .where(eq(defects.projectId, projectId))
      .orderBy(asc(defects.status), desc(defects.detectedAt), desc(defects.id))
      .limit(100),
    db
      .select({
        id: milestones.id,
        name: milestones.name,
        status: milestones.status,
      })
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(asc(milestones.name))
      .limit(100),
    db
      .selectDistinctOn([commercialScopeItemRevisions.scopeItemId], {
        id: commercialScopeItemRevisions.id,
        title: commercialScopeItemRevisions.title,
        kind: commercialScopeItemRevisions.kind,
      })
      .from(commercialScopeItemRevisions)
      .innerJoin(
        commercialScopeItems,
        eq(commercialScopeItems.id, commercialScopeItemRevisions.scopeItemId),
      )
      .where(
        and(
          eq(commercialScopeItemRevisions.projectId, projectId),
          isNull(commercialScopeItems.archivedAt),
        ),
      )
      .orderBy(
        commercialScopeItemRevisions.scopeItemId,
        desc(commercialScopeItemRevisions.revisionNumber),
      )
      .limit(500),
    db
      .select({ id: commercialRequests.id, title: commercialRequests.title })
      .from(commercialRequests)
      .where(eq(commercialRequests.projectId, projectId))
      .orderBy(desc(commercialRequests.receivedAt))
      .limit(100),
    db
      .select({
        id: clientAcceptanceTargets.id,
        title: clientAcceptanceTargets.snapshotTitle,
      })
      .from(clientAcceptanceTargets)
      .where(eq(clientAcceptanceTargets.projectId, projectId))
      .orderBy(desc(clientAcceptanceTargets.publishedAt))
      .limit(100),
  ]);
  const verifications = verificationRows.map((record) => {
    const currentFingerprint = record.currentWorkTitle
      ? workFingerprint({
          title: record.currentWorkTitle,
          description: record.currentWorkDescription,
          acceptanceCriteria: record.currentAcceptanceCriteria,
        })
      : null;
    return {
      ...record,
      stale:
        Boolean(
          record.subjectFingerprint &&
          currentFingerprint !== record.subjectFingerprint,
        ) ||
        Boolean(
          record.artifactHeadSha &&
          record.currentArtifactHeadSha !== record.artifactHeadSha,
        ) ||
        Boolean(record.artifactStaleAt),
    };
  });
  return {
    configuration: {
      githubConfigured: isGitHubAppConfigured(),
    },
    canManageConnections:
      access.workspaceRole !== "member" || access.leadUserId === actor.userId,
    repositories: repositoryRows,
    artifacts: artifactRows,
    links: linkRows,
    workItems: workRows,
    verifications,
    defects: defectRows,
    milestones: milestoneRows,
    scopeItems: scopeRows,
    requests: requestRows,
    acceptanceTargets: acceptanceRows,
  };
}

type CoverageItem = {
  workItemId: string | null;
  identifier: string;
  title: string;
  milestoneId: string | null;
  gaps: string[];
};

type CoverageWork = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  status: string;
  milestoneId: string | null;
};

type CoverageArtifact = {
  id: string;
  state: string;
  headSha: string | null;
  checkRollup: string;
  staleAt: Date | null;
};

type CoverageVerification = {
  result: string;
  subjectFingerprint: string | null;
  artifactHeadSha: string | null;
  artifactId: string | null;
};

type VerificationArtifactState = Pick<CoverageArtifact, "headSha" | "staleAt">;

function isVerificationStale(
  work: CoverageWork,
  verification: CoverageVerification,
  artifact: VerificationArtifactState | null | undefined,
) {
  const subjectChanged =
    Boolean(verification.subjectFingerprint) &&
    verification.subjectFingerprint !== workFingerprint(work);
  const implementationChanged =
    Boolean(verification.artifactHeadSha && artifact) &&
    verification.artifactHeadSha !== artifact?.headSha;
  return Boolean(subjectChanged || implementationChanged || artifact?.staleAt);
}

function implementationCoverageGaps(artifacts: CoverageArtifact[]) {
  const gaps: string[] = [];
  if (!artifacts.length) gaps.push("missing_implementation");
  if (artifacts.some((artifact) => artifact.state !== "merged")) {
    gaps.push("open_implementation");
  }
  const checks = new Set(
    artifacts.map((artifact) =>
      artifact.staleAt ? "unknown" : artifact.checkRollup,
    ),
  );
  if (checks.has("failing")) gaps.push("failing_checks");
  if (checks.has("pending")) gaps.push("pending_checks");
  if (checks.has("unknown")) gaps.push("unknown_checks");
  return gaps;
}

function verificationCoverageGaps(
  work: CoverageWork,
  verification: CoverageVerification | undefined,
  artifactsById: Map<string, CoverageArtifact>,
) {
  if (!verification) return ["missing_verification"];
  const gaps: string[] = [];
  if (verification.result !== "passed") {
    gaps.push(`${verification.result}_verification`);
  }
  const artifact = verification.artifactId
    ? artifactsById.get(verification.artifactId)
    : null;
  if (isVerificationStale(work, verification, artifact)) {
    gaps.push("stale_verification");
  }
  return gaps;
}

function buildCoverageItem(
  work: CoverageWork,
  projectKey: string,
  artifactsById: Map<string, CoverageArtifact>,
  artifactIdsByWork: Map<string, string[]>,
  latestVerification: Map<string, CoverageVerification>,
  workWithDefects: Set<string>,
  acceptanceByMilestone: Map<string, string | null>,
): CoverageItem {
  const artifactIds = artifactIdsByWork.get(work.id) ?? [];
  const linkedArtifacts = artifactIds.flatMap((id) => {
    const artifact = artifactsById.get(id);
    return artifact ? [artifact] : [];
  });
  const gaps = [
    ...(work.status === "done" ? [] : ["incomplete_material_work"]),
    ...implementationCoverageGaps(linkedArtifacts),
    ...verificationCoverageGaps(
      work,
      latestVerification.get(work.id),
      artifactsById,
    ),
  ];
  if (workWithDefects.has(work.id)) gaps.push("unresolved_defect");
  const acceptance = work.milestoneId
    ? acceptanceByMilestone.get(work.milestoneId)
    : null;
  if (
    work.milestoneId &&
    acceptanceByMilestone.has(work.milestoneId) &&
    acceptance !== "accepted"
  ) {
    gaps.push("pending_acceptance");
  }
  return {
    workItemId: work.id,
    identifier: `${projectKey}-${work.number}`,
    title: work.title,
    milestoneId: work.milestoneId,
    gaps,
  };
}

export async function getEngineeringCoverage(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  filters: EngineeringCoverageFilters,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const db = getDb();
  const projectRows = await db
    .select({ key: projects.key })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!projectRows[0]) throw notFound();
  const workConditions = [
    eq(workItems.projectId, projectId),
    eq(workItems.purpose, "client_delivery"),
    isNull(workItems.archivedAt),
    sql`${workItems.status} <> 'canceled'`,
  ];
  if (filters.milestoneId)
    workConditions.push(eq(workItems.milestoneId, filters.milestoneId));
  const [
    workRows,
    linkRows,
    artifactRows,
    verificationRows,
    defectRows,
    acceptanceRows,
  ] = await Promise.all([
    db
      .select({
        id: workItems.id,
        number: workItems.number,
        title: workItems.title,
        description: workItems.description,
        acceptanceCriteria: workItems.acceptanceCriteria,
        status: workItems.status,
        milestoneId: workItems.milestoneId,
      })
      .from(workItems)
      .where(and(...workConditions))
      .orderBy(asc(workItems.number))
      .limit(MAX_COVERAGE_WORK + 1),
    db
      .select({
        workItemId: workImplementationLinks.workItemId,
        artifactId: workImplementationLinks.artifactId,
      })
      .from(workImplementationLinks)
      .where(
        and(
          eq(workImplementationLinks.projectId, projectId),
          isNull(workImplementationLinks.removedAt),
        ),
      )
      .limit(MAX_PROJECT_EVIDENCE + 1),
    db
      .select({
        id: implementationArtifacts.id,
        state: implementationArtifacts.state,
        headSha: implementationArtifacts.headSha,
        checkRollup: implementationArtifacts.checkRollup,
        staleAt: implementationArtifacts.staleAt,
      })
      .from(implementationArtifacts)
      .where(eq(implementationArtifacts.projectId, projectId))
      .limit(MAX_PROJECT_EVIDENCE + 1),
    db
      .selectDistinctOn([verificationRecords.workItemId], {
        workItemId: verificationRecords.workItemId,
        result: verificationRecords.result,
        subjectFingerprint: verificationRecords.subjectFingerprint,
        artifactHeadSha: verificationRecords.artifactHeadSha,
        artifactId: verificationRecords.artifactId,
      })
      .from(verificationRecords)
      .where(
        and(
          eq(verificationRecords.projectId, projectId),
          sql`${verificationRecords.workItemId} is not null`,
        ),
      )
      .orderBy(
        verificationRecords.workItemId,
        desc(verificationRecords.recordedAt),
        desc(verificationRecords.id),
      )
      .limit(MAX_COVERAGE_WORK + 1),
    db.execute<{ workItemId: string }>(sql`
      select distinct affected.work_item_id as "workItemId"
      from (
        select defect.work_item_id
        from defects defect
        where defect.project_id = ${projectId}
          and defect.status = 'open'
        union
        select artifact_link.work_item_id
        from defects defect
        inner join work_implementation_links artifact_link
          on artifact_link.artifact_id = defect.artifact_id
          and artifact_link.project_id = defect.project_id
          and artifact_link.removed_at is null
        where defect.project_id = ${projectId}
          and defect.status = 'open'
        union
        select verification.work_item_id
        from defects defect
        inner join verification_records verification
          on verification.id = defect.verification_id
          and verification.project_id = defect.project_id
        where defect.project_id = ${projectId}
          and defect.status = 'open'
        union
        select verification_link.work_item_id
        from defects defect
        inner join verification_records verification
          on verification.id = defect.verification_id
          and verification.project_id = defect.project_id
        inner join work_implementation_links verification_link
          on verification_link.artifact_id = verification.artifact_id
          and verification_link.project_id = verification.project_id
          and verification_link.removed_at is null
        where defect.project_id = ${projectId}
          and defect.status = 'open'
      ) affected
      where affected.work_item_id is not null
      limit ${MAX_PROJECT_EVIDENCE + 1}
    `),
    db
      .select({
        projectItemId: clientProjectItems.id,
        target: clientProjectItems.target,
        milestoneId: clientProjectItems.milestoneId,
        acceptanceTargetId: clientAcceptanceTargets.id,
        title: clientAcceptanceTargets.snapshotTitle,
        milestoneSourceUpdatedAt:
          clientAcceptanceTargets.milestoneSourceUpdatedAt,
        currentMilestoneUpdatedAt: milestones.updatedAt,
        action: clientAcceptanceActions.action,
      })
      .from(clientProjectItems)
      .leftJoin(
        clientAcceptanceTargets,
        and(
          eq(clientAcceptanceTargets.projectItemId, clientProjectItems.id),
          isNull(clientAcceptanceTargets.supersededAt),
        ),
      )
      .leftJoin(
        clientAcceptanceActions,
        eq(
          clientAcceptanceActions.acceptanceTargetId,
          clientAcceptanceTargets.id,
        ),
      )
      .leftJoin(milestones, eq(milestones.id, clientProjectItems.milestoneId))
      .where(
        and(
          eq(clientProjectItems.projectId, projectId),
          isNull(clientProjectItems.hiddenAt),
        ),
      )
      .limit(500),
  ]);
  const truncated =
    workRows.length > MAX_COVERAGE_WORK ||
    linkRows.length > MAX_PROJECT_EVIDENCE ||
    artifactRows.length > MAX_PROJECT_EVIDENCE ||
    verificationRows.length > MAX_COVERAGE_WORK ||
    defectRows.rows.length > MAX_PROJECT_EVIDENCE;
  const boundedWork = workRows.slice(0, MAX_COVERAGE_WORK);
  const artifactsById = new Map(
    artifactRows.slice(0, MAX_PROJECT_EVIDENCE).map((item) => [item.id, item]),
  );
  const artifactIdsByWork = new Map<string, string[]>();
  for (const link of linkRows.slice(0, MAX_PROJECT_EVIDENCE)) {
    const values = artifactIdsByWork.get(link.workItemId) ?? [];
    values.push(link.artifactId);
    artifactIdsByWork.set(link.workItemId, values);
  }
  const latestVerification = new Map(
    verificationRows
      .slice(0, MAX_COVERAGE_WORK)
      .flatMap((item) =>
        item.workItemId ? [[item.workItemId, item] as const] : [],
      ),
  );
  const workWithDefects = new Set(
    defectRows.rows
      .slice(0, MAX_PROJECT_EVIDENCE)
      .map((item) => item.workItemId),
  );
  const acceptanceByMilestone = new Map(
    acceptanceRows.flatMap((item) => {
      if (!item.milestoneId) return [];
      const milestoneFresh =
        !item.milestoneSourceUpdatedAt ||
        item.currentMilestoneUpdatedAt?.getTime() ===
          item.milestoneSourceUpdatedAt.getTime();
      return [[item.milestoneId, milestoneFresh ? item.action : null] as const];
    }),
  );
  const items = boundedWork.map((work) =>
    buildCoverageItem(
      work,
      projectRows[0].key,
      artifactsById,
      artifactIdsByWork,
      latestVerification,
      workWithDefects,
      acceptanceByMilestone,
    ),
  );
  const deliverableAcceptanceItems: CoverageItem[] = acceptanceRows.flatMap(
    (item) =>
      item.target === "deliverable" &&
      item.acceptanceTargetId &&
      item.action !== "accepted"
        ? [
            {
              workItemId: null,
              identifier: "Client deliverable",
              title: item.title ?? "Published deliverable",
              milestoneId: null,
              gaps: ["pending_acceptance"],
            },
          ]
        : [],
  );

  const requirementResult = await db.execute<{
    id: string;
    title: string;
  }>(sql`
    select current_scope.id, latest_revision.title
    from commercial_scope_items current_scope
    inner join commercial_baseline_versions version
      on version.id = current_scope.baseline_version_id
      and version.project_id = current_scope.project_id
      and version.state = 'effective'
    inner join lateral (
      select revision.title, revision.kind
      from commercial_scope_item_revisions revision
      where revision.scope_item_id = current_scope.id
        and revision.project_id = current_scope.project_id
      order by revision.revision_number desc
      limit 1
    ) latest_revision on true
    where current_scope.project_id = ${projectId}
      and current_scope.archived_at is null
      and latest_revision.kind in ('requirement', 'deliverable')
      and not exists (
        select 1
        from commercial_scope_items related_scope
        inner join commercial_scope_item_revisions related_revision
          on related_revision.scope_item_id = related_scope.id
          and related_revision.project_id = related_scope.project_id
        inner join commercial_basis_links basis
          on basis.scope_item_revision_id = related_revision.id
          and basis.project_id = related_scope.project_id
        inner join work_items planned_work
          on planned_work.id = basis.work_item_id
          and planned_work.project_id = basis.project_id
          and planned_work.purpose = 'client_delivery'
          and planned_work.archived_at is null
          and planned_work.status <> 'canceled'
        where related_scope.project_id = current_scope.project_id
          and related_scope.material_basis_scope_item_id = current_scope.material_basis_scope_item_id
      )
    order by latest_revision.title, current_scope.id
    limit 101
  `);
  const requirements = requirementResult.rows
    .slice(0, 100)
    .map((requirement) => ({
      workItemId: null,
      identifier: "Commercial requirement",
      title: requirement.title,
      milestoneId: null,
      gaps: ["missing_planned_work"],
    }));
  const allItems = [...requirements, ...items, ...deliverableAcceptanceItems];
  const countGap = (gap: string) =>
    allItems.filter((item) => item.gaps.includes(gap)).length;
  const start = (filters.page - 1) * filters.pageSize;
  return {
    summary: {
      incompleteMaterialWork: countGap("incomplete_material_work"),
      missingPlannedWork: countGap("missing_planned_work"),
      missingImplementation: countGap("missing_implementation"),
      openImplementation: countGap("open_implementation"),
      failingChecks: countGap("failing_checks"),
      pendingChecks: countGap("pending_checks"),
      unknownChecks: countGap("unknown_checks"),
      missingVerification: countGap("missing_verification"),
      failedVerification: countGap("failed_verification"),
      blockedVerification: countGap("blocked_verification"),
      pendingVerification: countGap("pending_verification"),
      staleVerification: countGap("stale_verification"),
      unresolvedDefects: countGap("unresolved_defect"),
      pendingAcceptance: countGap("pending_acceptance"),
    },
    items: allItems.slice(start, start + filters.pageSize),
    page: {
      number: filters.page,
      size: filters.pageSize,
      total: allItems.length,
      pages: Math.max(1, Math.ceil(allItems.length / filters.pageSize)),
    },
    truncated: truncated || requirementResult.rows.length > 100,
  };
}

export async function getDeliveryEvidenceTrace(
  actor: UserActor,
  workspaceId: string,
  projectId: string,
  workItemId: string,
) {
  await getProjectAccess(getDb(), actor, workspaceId, projectId);
  const db = getDb();
  const workRows = await db
    .select({
      id: workItems.id,
      number: workItems.number,
      title: workItems.title,
      description: workItems.description,
      acceptanceCriteria: workItems.acceptanceCriteria,
      purpose: workItems.purpose,
      status: workItems.status,
      milestoneId: workItems.milestoneId,
      projectKey: projects.key,
    })
    .from(workItems)
    .innerJoin(projects, eq(projects.id, workItems.projectId))
    .where(
      and(eq(workItems.id, workItemId), eq(workItems.projectId, projectId)),
    )
    .limit(1);
  if (!workRows[0]) throw notFound();
  const [basis, implementation, verification, defect, acceptance] =
    await Promise.all([
      db
        .select({
          id: commercialBasisLinks.id,
          basisType: commercialBasisLinks.basisType,
          scopeTitle: commercialScopeItemRevisions.title,
          decisionId: commercialBasisLinks.decisionId,
          disposition: commercialDecisions.disposition,
          requestId: commercialDecisions.requestId,
        })
        .from(commercialBasisLinks)
        .leftJoin(
          commercialScopeItemRevisions,
          eq(
            commercialScopeItemRevisions.id,
            commercialBasisLinks.scopeItemRevisionId,
          ),
        )
        .leftJoin(
          commercialDecisions,
          eq(commercialDecisions.id, commercialBasisLinks.decisionId),
        )
        .where(
          and(
            eq(commercialBasisLinks.projectId, projectId),
            eq(commercialBasisLinks.workItemId, workItemId),
          ),
        ),
      db
        .select({
          linkId: workImplementationLinks.id,
          provenance: workImplementationLinks.provenance,
          artifactId: implementationArtifacts.id,
          number: implementationArtifacts.number,
          title: implementationArtifacts.title,
          url: implementationArtifacts.url,
          state: implementationArtifacts.state,
          headSha: implementationArtifacts.headSha,
          reviewRollup: implementationArtifacts.reviewRollup,
          checkRollup: implementationArtifacts.checkRollup,
          staleAt: implementationArtifacts.staleAt,
        })
        .from(workImplementationLinks)
        .innerJoin(
          implementationArtifacts,
          eq(implementationArtifacts.id, workImplementationLinks.artifactId),
        )
        .where(
          and(
            eq(workImplementationLinks.projectId, projectId),
            eq(workImplementationLinks.workItemId, workItemId),
            isNull(workImplementationLinks.removedAt),
          ),
        ),
      db
        .select({
          id: verificationRecords.id,
          projectId: verificationRecords.projectId,
          workItemId: verificationRecords.workItemId,
          scopeItemRevisionId: verificationRecords.scopeItemRevisionId,
          artifactId: verificationRecords.artifactId,
          milestoneId: verificationRecords.milestoneId,
          acceptanceTargetId: verificationRecords.acceptanceTargetId,
          method: verificationRecords.method,
          category: verificationRecords.category,
          result: verificationRecords.result,
          referenceUrl: verificationRecords.referenceUrl,
          notes: verificationRecords.notes,
          subjectFingerprint: verificationRecords.subjectFingerprint,
          artifactHeadSha: verificationRecords.artifactHeadSha,
          recordedByUserId: verificationRecords.recordedByUserId,
          recordedAt: verificationRecords.recordedAt,
          currentArtifactHeadSha: implementationArtifacts.headSha,
          currentArtifactStaleAt: implementationArtifacts.staleAt,
        })
        .from(verificationRecords)
        .leftJoin(
          implementationArtifacts,
          eq(implementationArtifacts.id, verificationRecords.artifactId),
        )
        .where(
          and(
            eq(verificationRecords.projectId, projectId),
            eq(verificationRecords.workItemId, workItemId),
          ),
        )
        .orderBy(desc(verificationRecords.recordedAt))
        .limit(100),
      db
        .select()
        .from(defects)
        .where(
          and(
            eq(defects.projectId, projectId),
            sql`(
              ${defects.workItemId} = ${workItemId}
              or exists (
                select 1
                from work_implementation_links artifact_link
                where artifact_link.project_id = ${projectId}
                  and artifact_link.work_item_id = ${workItemId}
                  and artifact_link.artifact_id = ${defects.artifactId}
                  and artifact_link.removed_at is null
              )
              or exists (
                select 1
                from verification_records defect_verification
                where defect_verification.project_id = ${projectId}
                  and defect_verification.id = ${defects.verificationId}
                  and (
                    defect_verification.work_item_id = ${workItemId}
                    or exists (
                      select 1
                      from work_implementation_links verification_link
                      where verification_link.project_id = ${projectId}
                        and verification_link.work_item_id = ${workItemId}
                        and verification_link.artifact_id = defect_verification.artifact_id
                        and verification_link.removed_at is null
                    )
                  )
              )
            )`,
          ),
        )
        .orderBy(desc(defects.detectedAt))
        .limit(100),
      workRows[0].milestoneId
        ? db
            .select({
              id: clientAcceptanceTargets.id,
              title: clientAcceptanceTargets.snapshotTitle,
              version: clientAcceptanceTargets.versionNumber,
              action: clientAcceptanceActions.action,
              actedAt: clientAcceptanceActions.actedAt,
              publishedAt: clientAcceptanceTargets.publishedAt,
            })
            .from(clientProjectItems)
            .innerJoin(
              clientAcceptanceTargets,
              eq(clientAcceptanceTargets.projectItemId, clientProjectItems.id),
            )
            .leftJoin(
              clientAcceptanceActions,
              eq(
                clientAcceptanceActions.acceptanceTargetId,
                clientAcceptanceTargets.id,
              ),
            )
            .where(
              and(
                eq(clientProjectItems.projectId, projectId),
                eq(clientProjectItems.milestoneId, workRows[0].milestoneId),
              ),
            )
            .orderBy(desc(clientAcceptanceTargets.publishedAt))
            .limit(100)
        : Promise.resolve([]),
    ]);
  return {
    work: {
      ...workRows[0],
      identifier: `${workRows[0].projectKey}-${workRows[0].number}`,
    },
    commercialBasis: basis,
    implementation,
    verification: verification.map(
      ({ currentArtifactHeadSha, currentArtifactStaleAt, ...record }) => ({
        ...record,
        stale: isVerificationStale(workRows[0], record, {
          headSha: currentArtifactHeadSha,
          staleAt: currentArtifactStaleAt,
        }),
      }),
    ),
    defects: defect,
    acceptance,
  };
}

type GitHubWebhookPayload = {
  repository?: { id?: number };
  pull_request?: { number?: number };
  check_run?: { pull_requests?: Array<{ number?: number }> };
  check_suite?: { pull_requests?: Array<{ number?: number }> };
};

function webhookPullNumbers(payload: GitHubWebhookPayload) {
  const pullNumbers = new Set<number>();
  if (payload.pull_request?.number) {
    pullNumbers.add(payload.pull_request.number);
  }
  for (const pull of payload.check_run?.pull_requests ?? []) {
    if (pull.number) pullNumbers.add(pull.number);
  }
  for (const pull of payload.check_suite?.pull_requests ?? []) {
    if (pull.number) pullNumbers.add(pull.number);
  }
  return [...pullNumbers].slice(0, 10);
}

async function reconcileWebhookRepositories(
  repositoryIds: string[],
  pullNumbers: number[],
  eventName: string,
) {
  for (const repositoryId of repositoryIds) {
    if (pullNumbers.length) {
      for (const pullNumber of pullNumbers) {
        await reconcileRepositoryById(
          repositoryId,
          "integration",
          null,
          pullNumber,
        );
      }
    } else if (["push", "status"].includes(eventName)) {
      await reconcileRepositoryById(repositoryId, "integration", null);
    }
  }
}

export async function processGitHubWebhookDelivery(
  deliveryId: string,
  eventName: string,
  rawBody: string,
) {
  const db = getDb();
  const inserted = await db
    .insert(providerWebhookDeliveries)
    .values({
      id: randomUUID(),
      provider: "github",
      deliveryId,
      eventName,
    })
    .onConflictDoNothing()
    .returning({ id: providerWebhookDeliveries.id });
  if (!inserted[0]) return { duplicate: true, processed: 0 };
  let repositoryIds: string[] = [];
  try {
    const payload = JSON.parse(rawBody) as GitHubWebhookPayload;
    const providerRepositoryId = payload.repository?.id
      ? String(payload.repository.id)
      : null;
    if (!providerRepositoryId) {
      await db
        .update(providerWebhookDeliveries)
        .set({ state: "ignored", processedAt: new Date() })
        .where(eq(providerWebhookDeliveries.id, inserted[0].id));
      return { duplicate: false, processed: 0 };
    }
    const repositories = await db
      .select({ id: engineeringRepositories.id })
      .from(engineeringRepositories)
      .where(
        and(
          eq(engineeringRepositories.provider, "github"),
          eq(
            engineeringRepositories.providerRepositoryId,
            providerRepositoryId,
          ),
          eq(engineeringRepositories.state, "active"),
        ),
      )
      .limit(20);
    repositoryIds = repositories.map((repository) => repository.id);
    if (!repositoryIds.length) {
      await db
        .update(providerWebhookDeliveries)
        .set({ state: "ignored", processedAt: new Date() })
        .where(eq(providerWebhookDeliveries.id, inserted[0].id));
      return { duplicate: false, processed: 0 };
    }
    await reconcileWebhookRepositories(
      repositoryIds,
      webhookPullNumbers(payload),
      eventName,
    );
    await db
      .update(providerWebhookDeliveries)
      .set({ state: "processed", processedAt: new Date() })
      .where(eq(providerWebhookDeliveries.id, inserted[0].id));
    return { duplicate: false, processed: repositoryIds.length };
  } catch (error) {
    await Promise.all(
      repositoryIds.map((id) => markRepositoryStale(id, error)),
    );
    await db
      .update(providerWebhookDeliveries)
      .set({
        state: "failed",
        errorCode: providerErrorCode(error),
        processedAt: new Date(),
      })
      .where(eq(providerWebhookDeliveries.id, inserted[0].id));
    return { duplicate: false, processed: 0, failed: true };
  }
}

export function checkRollupForOutage(
  current: ImplementationCheckRollup,
  staleAt: Date | null,
) {
  return staleAt ? "unknown" : current;
}
