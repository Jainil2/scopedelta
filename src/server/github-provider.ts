import "server-only";

import { createHmac, createSign, timingSafeEqual } from "node:crypto";

import { getGitHubAppCallbackUrl, getGitHubAppConfig } from "@/lib/env";
import type {
  ImplementationArtifactState,
  ImplementationCheckRollup,
  ImplementationReviewRollup,
} from "@/db/schema";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const USER_AGENT = "ScopeDelta-GitHub-App";

type GitHubInstallation = {
  id: number;
  account: { id: number; login: string };
};

export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
  owner: { login: string };
  permissions?: { admin?: boolean };
};

type GitHubPullRequest = {
  id: number;
  number: number;
  html_url: string;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  merged_at: string | null;
  merge_commit_sha: string | null;
  updated_at: string;
  user: { id: number; login: string } | null;
  requested_reviewers?: Array<{ id: number }>;
  requested_teams?: Array<{ id: number }>;
  head: { ref: string; sha: string };
  base: { ref: string };
};

type GitHubReview = {
  user: { id: number; login: string } | null;
  state: string;
  submitted_at: string | null;
};

type GitHubCheckRuns = {
  total_count: number;
  check_runs: Array<{ status: string; conclusion: string | null }>;
};

type GitHubCombinedStatus = {
  state: "error" | "failure" | "pending" | "success";
  total_count: number;
};

export type ProviderPullRequestEvidence = {
  providerArtifactId: string;
  number: number;
  url: string;
  title: string;
  state: ImplementationArtifactState;
  headRef: string;
  headSha: string;
  baseBranch: string;
  authorRef: string | null;
  reviewRollup: ImplementationReviewRollup;
  approvalsCount: number;
  changesRequestedCount: number;
  checkRollup: ImplementationCheckRollup;
  mergedAt: Date | null;
  mergeCommitSha: string | null;
  providerUpdatedAt: Date;
};

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function createAppJwt() {
  const config = getGitHubAppConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: config.appId }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(config.privateKey).toString("base64url")}`;
}

async function githubJson<T>(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": API_VERSION,
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`github_provider_${response.status}`);
  }
  return (await response.json()) as T;
}

async function installationToken(installationId: string) {
  const response = await githubJson<{ token: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    createAppJwt(),
    { method: "POST" },
  );
  return response.token;
}

export async function getGitHubInstallation(installationId: string) {
  return githubJson<GitHubInstallation>(
    `/app/installations/${encodeURIComponent(installationId)}`,
    createAppJwt(),
  );
}

export async function getGrantedGitHubRepository(
  installationId: string,
  fullName: string,
) {
  const token = await installationToken(installationId);
  return githubJson<GitHubRepository>(`/repos/${fullName}`, token);
}

export async function exchangeGitHubUserCode(code: string) {
  const { clientId, clientSecret } = getGitHubAppConfig();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: getGitHubAppCallbackUrl(),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!response.ok || !payload.access_token || payload.error) {
    throw new Error(`github_oauth_${response.status}`);
  }
  return payload.access_token;
}

export async function getGitHubUserInstallationRepository(
  userAccessToken: string,
  installationId: string,
  repositoryFullName: string,
) {
  const expected = repositoryFullName.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const result = await githubJson<{
      repositories: GitHubRepository[];
    }>(
      `/user/installations/${encodeURIComponent(installationId)}/repositories?per_page=100&page=${page}`,
      userAccessToken,
    );
    const repository = result.repositories.find(
      (item) => item.full_name.toLowerCase() === expected,
    );
    if (repository?.permissions?.admin) return repository;
    if (repository) throw new Error("github_provider_403");
    if (result.repositories.length < 100) break;
  }
  throw new Error("github_provider_404");
}

function aggregateReviewRollup(
  approvalsCount: number,
  changesRequestedCount: number,
  hasReviewActivity: boolean,
): ImplementationReviewRollup {
  if (changesRequestedCount) return "changes_requested";
  if (approvalsCount) return "approved";
  return hasReviewActivity ? "pending" : "unknown";
}

async function reviewRollup(
  repository: GitHubRepository,
  pullNumber: number,
  requestedReviewCount: number,
  token: string,
) {
  const reviews = await githubJson<GitHubReview[]>(
    `/repos/${repository.full_name}/pulls/${pullNumber}/reviews?per_page=100`,
    token,
  );
  const latestByReviewer = new Map<string, GitHubReview>();
  for (const review of reviews) {
    if (!review.user || !review.submitted_at) continue;
    const state = review.state.toLowerCase();
    if (
      state !== "approved" &&
      state !== "changes_requested" &&
      state !== "dismissed"
    ) {
      continue;
    }
    const previous = latestByReviewer.get(String(review.user.id));
    if (
      !previous?.submitted_at ||
      new Date(review.submitted_at) >= new Date(previous.submitted_at)
    ) {
      latestByReviewer.set(String(review.user.id), review);
    }
  }
  let approvalsCount = 0;
  let changesRequestedCount = 0;
  for (const review of latestByReviewer.values()) {
    if (review.state.toLowerCase() === "approved") approvalsCount += 1;
    if (review.state.toLowerCase() === "changes_requested") {
      changesRequestedCount += 1;
    }
  }
  const rollup = aggregateReviewRollup(
    approvalsCount,
    changesRequestedCount,
    Boolean(reviews.length || requestedReviewCount),
  );
  return { rollup, approvalsCount, changesRequestedCount };
}

export function githubCheckRollup(
  checks: GitHubCheckRuns,
  statuses: GitHubCombinedStatus,
): ImplementationCheckRollup {
  const hasEvidence =
    checks.check_runs.length > 0 ||
    checks.total_count > 0 ||
    statuses.total_count > 0;
  if (!hasEvidence) return "unknown";
  const conclusions = checks.check_runs.map((check) => check.conclusion);
  const hasFailingCheck = conclusions.some((value) =>
    [
      "action_required",
      "cancelled",
      "failure",
      "startup_failure",
      "timed_out",
    ].includes(value ?? ""),
  );
  if (hasFailingCheck || ["error", "failure"].includes(statuses.state)) {
    return "failing";
  }
  if (checks.total_count > checks.check_runs.length) return "unknown";
  const hasPendingCheck = checks.check_runs.some(
    (check) => check.status !== "completed" || check.conclusion === null,
  );
  if (hasPendingCheck || statuses.state === "pending") return "pending";
  return "passing";
}

function artifactState(pull: GitHubPullRequest): ImplementationArtifactState {
  if (pull.merged_at) return "merged";
  if (pull.state === "open" && pull.draft) return "draft";
  return pull.state === "open" ? "open" : "closed";
}

async function normalizePullRequest(
  repository: GitHubRepository,
  pull: GitHubPullRequest,
  token: string,
): Promise<ProviderPullRequestEvidence> {
  const requestedReviewCount =
    (pull.requested_reviewers?.length ?? 0) +
    (pull.requested_teams?.length ?? 0);
  const [review, checks, statuses] = await Promise.all([
    reviewRollup(repository, pull.number, requestedReviewCount, token),
    githubJson<GitHubCheckRuns>(
      `/repos/${repository.full_name}/commits/${pull.head.sha}/check-runs?per_page=100`,
      token,
    ),
    githubJson<GitHubCombinedStatus>(
      `/repos/${repository.full_name}/commits/${pull.head.sha}/status`,
      token,
    ),
  ]);
  return {
    providerArtifactId: String(pull.id),
    number: pull.number,
    url: pull.html_url,
    title: pull.title,
    state: artifactState(pull),
    headRef: pull.head.ref,
    headSha: pull.head.sha,
    baseBranch: pull.base.ref,
    authorRef: pull.user ? `${pull.user.id}:${pull.user.login}` : null,
    reviewRollup: review.rollup,
    approvalsCount: review.approvalsCount,
    changesRequestedCount: review.changesRequestedCount,
    checkRollup: githubCheckRollup(checks, statuses),
    mergedAt: pull.merged_at ? new Date(pull.merged_at) : null,
    mergeCommitSha: pull.merge_commit_sha,
    providerUpdatedAt: new Date(pull.updated_at),
  };
}

export async function listGitHubPullRequestEvidence(
  installationId: string,
  repository: GitHubRepository,
  limit = 50,
) {
  const token = await installationToken(installationId);
  const pulls = await githubJson<GitHubPullRequest[]>(
    `/repos/${repository.full_name}/pulls?state=all&sort=updated&direction=desc&per_page=${Math.min(100, limit)}`,
    token,
  );
  const evidence: ProviderPullRequestEvidence[] = [];
  for (const pull of pulls.slice(0, limit)) {
    evidence.push(await normalizePullRequest(repository, pull, token));
  }
  return evidence;
}

export async function getGitHubPullRequestEvidence(
  installationId: string,
  repository: GitHubRepository,
  pullNumber: number,
) {
  const token = await installationToken(installationId);
  const pull = await githubJson<GitHubPullRequest>(
    `/repos/${repository.full_name}/pulls/${pullNumber}`,
    token,
  );
  return normalizePullRequest(repository, pull, token);
}

export function verifyGitHubWebhookSignature(
  rawBody: string,
  signature: string,
) {
  const secret = getGitHubAppConfig().webhookSecret;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(signature);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}
