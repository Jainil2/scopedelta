import Image from "next/image";

import { LeadForm } from "@/components/lead-form";

const workflowSteps = [
  {
    number: "01",
    title: "Bring the agreed scope",
    copy: "Start from the work both sides already understand—not from a blank change-order template.",
  },
  {
    number: "02",
    title: "Add the new request",
    copy: "Capture what the client is now asking for in the language your delivery team received.",
  },
  {
    number: "03",
    title: "Review the scope decision",
    copy: "Check the reasoning, correct the classification, and decide what should become billable.",
  },
  {
    number: "04",
    title: "Send a clear change order",
    copy: "Turn the approved difference into client-ready language with the impact made explicit.",
  },
] as const;

export default function Home() {
  return (
    <main>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <section className="hero" aria-labelledby="page-title">
        <Image
          className="hero-image"
          src="/images/scope-review-hero.png"
          alt="A project lead reviewing synthetic scope notes at a desk"
          fill
          loading="eager"
          fetchPriority="high"
          sizes="100vw"
        />
        <div className="hero-shade" aria-hidden="true" />

        <header className="site-header content-width">
          <a
            className="wordmark"
            href="#page-title"
            aria-label="ScopeDelta home"
          >
            <BrandMark />
            ScopeDelta
          </a>
          <nav className="site-header-actions" aria-label="Account and pilot">
            <a className="header-link" href="/sign-in">
              Sign in <span aria-hidden="true">→</span>
            </a>
            <a className="header-link" href="#pilot">
              Paid pilot <span aria-hidden="true">↘</span>
            </a>
          </nav>
        </header>

        <div className="hero-content content-width" id="main-content">
          <p className="hero-eyebrow hero-stagger-1">
            For software agencies &amp; senior freelancers
          </p>
          <h1 className="hero-stagger-2" id="page-title">
            Turn scope creep into approved, billable work.
          </h1>
          <p className="hero-intro hero-stagger-3">
            Compare each new request with what was agreed, review the reasoning,
            and move toward a clear change order before margin quietly
            disappears.
          </p>
          <div className="hero-actions hero-stagger-4">
            <a className="button button-accent" href="#pilot">
              Apply for a paid pilot <span aria-hidden="true">↘</span>
            </a>
            <a className="text-link" href="#example">
              See a scope decision <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>

        <p className="image-note content-width">
          Original synthetic scene · no client data
        </p>
      </section>

      <section
        className="problem-section section-pad"
        aria-labelledby="problem-title"
      >
        <div className="content-width editorial-grid reveal">
          <p className="section-index">01 / The margin problem</p>
          <div>
            <h2 id="problem-title">
              The request sounds small.
              <br />
              The margin loss isn’t.
            </h2>
            <div className="problem-copy columns-copy">
              <p>
                A new export, a revised approval flow, or “just one” recurring
                report can arrive in a friendly message and leave without a
                commercial decision.
              </p>
              <p>
                ScopeDelta is designed to make the difference visible while
                there is still time to discuss it—before delivery pressure turns
                extra work into an unplanned write-off.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        className="decision-section section-pad"
        id="example"
        aria-labelledby="example-title"
      >
        <div className="content-width">
          <div className="section-heading reveal">
            <p className="section-index">02 / A scope decision</p>
            <div>
              <p className="section-kicker">Illustrative synthetic example</p>
              <h2 id="example-title">
                See the difference, not just the request.
              </h2>
            </div>
          </div>

          <div className="decision-board reveal">
            <div className="decision-input">
              <article>
                <p className="decision-label">Agreed scope</p>
                <h3>Manual monthly CSV export</h3>
                <p>
                  An administrator can download the current month’s account data
                  as a CSV file from the reporting screen.
                </p>
              </article>
              <article>
                <p className="decision-label">New request</p>
                <h3>Scheduled, branded Excel emails</h3>
                <p>
                  Every Monday, email each client a branded Excel workbook for
                  their account—without an administrator running the export.
                </p>
              </article>
            </div>

            <article
              className="decision-result"
              aria-label="Illustrative scope decision"
            >
              <div className="classification-row">
                <p className="decision-label">Illustrative classification</p>
                <code>partially_in_scope</code>
              </div>
              <div className="decision-reasoning">
                <div>
                  <span className="delta-marker" aria-hidden="true">
                    ✓
                  </span>
                  <p>
                    <strong>Covered:</strong> producing the underlying monthly
                    data as a manual CSV export.
                  </p>
                </div>
                <div>
                  <span className="delta-marker delta-new" aria-hidden="true">
                    +
                  </span>
                  <p>
                    <strong>New work:</strong> scheduling, branded Excel output,
                    recipient rules, and automated email delivery.
                  </p>
                </div>
              </div>
              <div className="review-rule">
                <BrandMark />
                <p>
                  <strong>Agency review is mandatory.</strong> The team checks
                  the reasoning and decides what to propose before anything
                  reaches the client.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section
        className="workflow-section section-pad"
        aria-labelledby="workflow-title"
      >
        <div className="content-width">
          <div className="section-heading reveal">
            <p className="section-index">03 / The workflow</p>
            <h2 id="workflow-title">
              From “quick favor” to a commercial decision.
            </h2>
          </div>
          <ol className="workflow-list reveal">
            {workflowSteps.map((step) => (
              <li key={step.number}>
                <span className="step-number">{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
                <span className="step-arrow" aria-hidden="true">
                  ↘
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="trust-section section-pad"
        aria-labelledby="trust-title"
      >
        <div className="content-width trust-layout reveal">
          <p className="section-index">04 / Built for judgment</p>
          <div>
            <h2 id="trust-title">Your agency stays in control.</h2>
            <p className="trust-lead">
              ScopeDelta supports a commercial conversation. It does not make
              the final scope decision, contact clients, or approve work on your
              behalf.
            </p>
            <div className="trust-points">
              <p>Human review before client communication</p>
              <p>Your team controls the quote and timeline</p>
              <p>No confidential documents needed to apply</p>
            </div>
          </div>
        </div>
      </section>

      <section
        className="pilot-section"
        id="pilot"
        aria-labelledby="pilot-title"
      >
        <div className="content-width pilot-layout">
          <div className="pilot-copy reveal">
            <p className="section-index">05 / Paid pilot</p>
            <h2 id="pilot-title">
              Bring us the scope conversations that keep slipping.
            </h2>
            <p>
              We’re inviting small software agencies and senior freelancers to
              apply for a paid pilot. Tell us where the handoff from request to
              change order breaks down today.
            </p>
          </div>
          <div className="reveal">
            <LeadForm />
          </div>
        </div>
        <footer className="site-footer content-width">
          <span>ScopeDelta</span>
          <span>Make the change visible.</span>
        </footer>
      </section>
    </main>
  );
}

function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 2 22 21H2L12 2Zm0 5.1L6.7 18h10.6L12 7.1Z"
        fill="currentColor"
      />
    </svg>
  );
}
