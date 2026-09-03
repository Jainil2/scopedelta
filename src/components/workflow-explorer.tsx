"use client";

import Link from "next/link";
import { useState } from "react";

export type WorkflowSummary = {
  name: string;
  title: string;
  category: string;
  description: string;
  actions: { name: string; confirmation: boolean; handoff: boolean }[];
  href: string;
};

export function WorkflowExplorer({
  flows,
  workspaceSlug,
}: {
  flows: WorkflowSummary[];
  workspaceSlug: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All workflows");
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const categories = [...new Set(flows.map((flow) => flow.category))];
  const filtered = flows.filter(
    (flow) =>
      (category === "All workflows" || flow.category === category) &&
      `${flow.title} ${flow.description} ${flow.name} ${flow.actions.map((action) => action.name).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function copyPrompt(flow: WorkflowSummary) {
    try {
      await navigator.clipboard.writeText(
        `Help me with ${flow.title.toLowerCase()} in ScopeDelta. Discover ${flow.name}, read the current state, and explain your proposed changes before taking action.`,
      );
      setCopied(flow.name);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <div className="app-content workflow-explorer">
      <header className="app-page-header">
        <div>
          <p className="app-eyebrow">Agent workflows</p>
          <h1>Agent workflows</h1>
          <p>
            Find a workflow, open its workspace, or copy a prompt for your
            browser agent. Every action uses your existing access.
          </p>
        </div>
      </header>
      <section
        className="workflow-start"
        aria-labelledby="workflow-start-title"
      >
        <h2 id="workflow-start-title">Start with an empty workspace</h2>
        <p>
          You can start from your own client and project. Demo data is optional.
        </p>
        <ol>
          <li>
            <Link href={`/app/${workspaceSlug}/clients`}>Create a client</Link>
          </li>
          <li>
            <Link href={`/app/${workspaceSlug}/projects`}>
              Create a project
            </Link>
          </li>
          <li>Plan milestones, assign work and track delivery</li>
          <li>Review outcomes and mark the project completed</li>
        </ol>
        <p>
          Try: “Create a client called Acme and a project called Website launch
          with key WEB. Make me the lead and add a kickoff task.”
        </p>
      </section>
      <div className="workflow-filters">
        <label>
          Find a workflow
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Projects, scope, client review…"
          />
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option>All workflows</option>
            {categories.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>
      <p role="status">
        {copyError
          ? "Copy is unavailable. Select a workflow name and ask your agent to discover it."
          : copied
            ? "Prompt copied. Paste it into your browser agent."
            : `${filtered.length} workflows found.`}
      </p>
      <div className="workflow-grid">
        {filtered.map((flow) => (
          <article key={flow.name} className="workflow-card">
            <p className="app-eyebrow">{flow.category}</p>
            <h2>{flow.title}</h2>
            <p>{flow.description}</p>
            <details>
              <summary>Available actions ({flow.actions.length})</summary>
              <code>{flow.name}</code>
              <ul>
                {flow.actions.map((action) => (
                  <li key={action.name}>
                    {action.name.replaceAll("_", " ")}
                    {action.handoff
                      ? " · continue in app"
                      : action.confirmation
                        ? " · asks for confirmation"
                        : ""}
                  </li>
                ))}
              </ul>
            </details>
            <div className="workflow-actions">
              <Link href={flow.href}>Open workspace</Link>
              <button type="button" onClick={() => void copyPrompt(flow)}>
                {copied === flow.name ? "Copied" : "Copy agent prompt"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length ? (
        <p>No workflows match. Try another search or category.</p>
      ) : null}
      <p>
        Browser tools require a compatible browser agent. You can always use the
        linked screens directly. Account verification, provider consent and
        payment completion happen in their ordinary screens.
      </p>
    </div>
  );
}
