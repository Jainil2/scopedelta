import { ArrowDown, ArrowRight, Check, Plus, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { BrandLockup, BrandMark } from "@/components/brand";
import { LeadForm } from "@/components/lead-form";

const workflowSteps = [
  {
    number: "01",
    title: "Anchor the agreement",
    copy: "Bring the scope both sides already understand into one commercial baseline.",
  },
  {
    number: "02",
    title: "Capture the new request",
    copy: "Record what changed in the same language your delivery team received.",
  },
  {
    number: "03",
    title: "Review the difference",
    copy: "Check the evidence, correct the classification, and decide what is billable.",
  },
  {
    number: "04",
    title: "Create the client decision",
    copy: "Move forward with a clear change order, delivery impact, and audit trail.",
  },
] as const;

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <main className="marketing-site" id="main-content">
        <section className="marketing-hero" aria-labelledby="page-title">
          <header className="marketing-header">
            <BrandLockup inverse />
            <nav aria-label="Account and pilot">
              <Link href="/sign-in">Sign in</Link>
              <a className="marketing-header-cta" href="#pilot">
                Apply for the pilot <ArrowRight aria-hidden="true" />
              </a>
            </nav>
          </header>

          <div className="marketing-hero-layout">
            <div className="marketing-hero-copy">
              <p className="marketing-kicker marketing-reveal-1">
                Commercial control for software delivery
              </p>
              <h1 className="marketing-reveal-2" id="page-title">
                Make every scope change visible before margin disappears.
              </h1>
              <p className="marketing-reveal-3">
                ScopeDelta connects the agreed plan, the work being delivered,
                and the client decision—without letting AI make the final call.
              </p>
              <div className="marketing-hero-actions marketing-reveal-4">
                <a href="#pilot">
                  Apply for a paid pilot <ArrowRight aria-hidden="true" />
                </a>
                <a href="#decision">
                  Explore the decision flow <ArrowDown aria-hidden="true" />
                </a>
              </div>
            </div>

            <ProductDecisionCanvas />
          </div>

          <div className="marketing-hero-note">
            <span>Built for agencies and senior freelancers</span>
            <span>Human approval stays mandatory</span>
          </div>
        </section>

        <section className="marketing-intro" aria-labelledby="problem-title">
          <div className="marketing-section-label">The margin problem</div>
          <div className="marketing-intro-copy">
            <h2 id="problem-title">
              The request sounds small. The delivery delta is not.
            </h2>
            <p>
              A new export, revised approval path, or recurring report often
              arrives as a quick favor. ScopeDelta turns that informal request
              into a decision while the agency still has time to protect the
              relationship and the margin.
            </p>
          </div>
          <figure className="marketing-editorial-image">
            <Image
              src="/images/scope-review-hero.png"
              alt="A project lead reviewing synthetic scope notes at a desk"
              fill
              sizes="(max-width: 900px) 100vw, 52vw"
            />
            <figcaption>
              Review the difference before delivery absorbs it.
            </figcaption>
          </figure>
        </section>

        <section
          className="marketing-decision"
          id="decision"
          aria-labelledby="decision-title"
        >
          <div className="marketing-decision-heading">
            <div className="marketing-section-label">One commercial record</div>
            <h2 id="decision-title">
              From incoming request to an evidence-backed client decision.
            </h2>
          </div>
          <div className="marketing-decision-flow">
            <article>
              <span>Agreed scope</span>
              <h3>Manual monthly CSV export</h3>
              <p>An administrator downloads the current month on demand.</p>
            </article>
            <div className="marketing-flow-connector" aria-hidden="true">
              <Plus />
            </div>
            <article>
              <span>New request</span>
              <h3>Scheduled, branded Excel emails</h3>
              <p>Each client receives a workbook automatically every Monday.</p>
            </article>
            <div className="marketing-flow-connector" aria-hidden="true">
              <ArrowRight />
            </div>
            <article className="marketing-decision-outcome">
              <span>Agency-reviewed outcome</span>
              <h3>Partially in scope</h3>
              <p>
                The export exists. Scheduling, branding, recipient rules, and
                delivery automation are new work.
              </p>
            </article>
          </div>
        </section>

        <section
          className="marketing-workflow"
          aria-labelledby="workflow-title"
        >
          <div className="marketing-workflow-heading">
            <div className="marketing-section-label">How the work moves</div>
            <h2 id="workflow-title">
              A disciplined path from request to commercial clarity.
            </h2>
          </div>
          <ol>
            {workflowSteps.map((step) => (
              <li key={step.number}>
                <span>{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
                <ArrowRight aria-hidden="true" />
              </li>
            ))}
          </ol>
        </section>

        <section className="marketing-control" aria-labelledby="control-title">
          <div>
            <div className="marketing-section-label">Built for judgment</div>
            <h2 id="control-title">
              Your team stays commercially accountable.
            </h2>
          </div>
          <div className="marketing-control-copy">
            <p>
              ScopeDelta supports a commercial conversation. It does not contact
              clients, approve work, or turn probabilistic output into
              authority.
            </p>
            <ul>
              <li>
                <Check aria-hidden="true" /> Human review before client
                communication
              </li>
              <li>
                <Check aria-hidden="true" /> Evidence remains connected to the
                decision
              </li>
              <li>
                <Check aria-hidden="true" /> Your team owns quote and timeline
                changes
              </li>
            </ul>
          </div>
        </section>

        <section
          className="marketing-pilot"
          id="pilot"
          aria-labelledby="pilot-title"
        >
          <div className="marketing-pilot-copy">
            <BrandMark />
            <div className="marketing-section-label">Paid pilot</div>
            <h2 id="pilot-title">
              Bring the scope conversations that keep slipping.
            </h2>
            <p>
              We are inviting small software agencies and senior freelancers to
              test ScopeDelta on the real handoff between request and change
              order.
            </p>
            <div className="marketing-pilot-trust">
              <ShieldCheck aria-hidden="true" />
              Do not submit contracts or confidential client material.
            </div>
          </div>
          <LeadForm />
        </section>

        <footer className="marketing-footer">
          <BrandLockup />
          <p>Make the change visible.</p>
          <Link href="/sign-in">Open your workspace</Link>
        </footer>
      </main>
    </>
  );
}

function ProductDecisionCanvas() {
  return (
    <div
      className="marketing-product-canvas marketing-reveal-3"
      aria-label="ScopeDelta product preview"
    >
      <div className="product-canvas-bar">
        <span>Northstar Retail</span>
        <strong>NOVA · Checkout recovery</strong>
        <span>September release</span>
      </div>
      <div className="product-canvas-body">
        <aside>
          <span>Overview</span>
          <strong>Scope decisions</strong>
          <span>Delivery evidence</span>
          <span>Client review</span>
        </aside>
        <div className="product-decision-main">
          <header>
            <div>
              <span>Decision required</span>
              <h2>Weekly branded account export</h2>
            </div>
            <span className="product-risk-label">Commercial review</span>
          </header>
          <div className="product-decision-columns">
            <section>
              <span>Baseline</span>
              <h3>Manual CSV download</h3>
              <p>Administrator initiated · monthly · raw CSV</p>
            </section>
            <section>
              <span>Requested change</span>
              <h3>Automated Excel delivery</h3>
              <p>Scheduled · branded · per-client recipient rules</p>
            </section>
          </div>
          <div className="product-decision-summary">
            <div>
              <span>Scope position</span>
              <strong>Partially in scope</strong>
            </div>
            <p>
              Data export is covered. Scheduling, presentation, and automated
              delivery require a commercial decision.
            </p>
          </div>
          <footer>
            <span>
              <ShieldCheck aria-hidden="true" /> Human review required
            </span>
            <span className="product-canvas-action">Prepare change order</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
