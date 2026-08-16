# Layer 6 — Cloud Economics, Billing, and Distribution Research

Date: 2026-08-16
Decision issue: SC-010 / #13

## Research question

How can ScopeDelta offer a genuinely useful free internal self-host path while
operating a managed cloud whose subscriptions and hard managed-resource limits
prevent unbounded founder-funded AI, email, database, and compute cost?

## Market and packaging findings

Current project and service-delivery products continue to support two durable
commercial patterns:

- Plane and OpenProject maintain useful no-cost self-host/community editions
  while selling cloud operations and paid self-managed capability.
- YouTrack keeps a self-managed option with a small-team free threshold.
- Jira, Linear, Teamwork, and Productive remain primarily seat-priced in the
  current market, but Productive explicitly separates client access from paid
  internal seats.
- Plane exposes included AI credits, and Teamwork has announced usage-based AI
  credits. Managed AI is becoming an explicit allowance rather than an
  invisible unlimited cost.

The evidence supports a useful self-host path and a paid cloud path, but it does
not prove that most 50–500-person agencies prefer self-hosting. Cloud remains
the lowest-friction default; self-host remains important for control, private
network operation, cost ownership, and adoption without vendor lock-in.

Representative sources:

- <https://plane.so/pricing>
- <https://developers.plane.so/self-hosting/editions-and-versions>
- <https://www.openproject.org/pricing/>
- <https://www.openproject.org/docs/faq/>
- <https://youtrack.jetbrains.com/articles/SUPPORT-A-2116/YouTrack-Server-subscriptions>
- <https://www.atlassian.com/software/jira/pricing>
- <https://linear.app/pricing>
- <https://www.teamwork.com/pricing/>
- <https://productive.io/pricing/>

## Distribution conclusion

ScopeDelta keeps one shared server-authoritative core for cloud and
customer-operated deployments.

- `self_host` is the default runtime distribution mode.
- Local/LAN capability, customer SMTP, hosted BYO AI, and local Ollama do not
  require a ScopeDelta Cloud phone-home or workspace billing row.
- Managed cloud sells hosting, upgrades, backups, managed providers,
  observability, and higher operational limits rather than disabling locally
  executable core workflows.
- Public source release and exact license text remain controlled by LIC-001.
  This implementation neither publishes the private repository nor claims an
  OSI license.

The repeatable production-oriented path is documented in `docs/SELF_HOST.md`.

## Payment-provider research

### Merchant of Record path

Paddle acts as Merchant of Record for SaaS/digital products, handling payment,
subscription, tax/VAT, fraud/chargeback, and buyer billing-support concerns.
Its public standard pricing is currently 5% + $0.50 per checkout transaction.
The headline fee is higher than a raw processor, but the reduction in tax and
small-team operational burden matches the current founder constraint.

Sources:

- <https://www.paddle.com/pricing>
- <https://developer.paddle.com/get-started/how-paddle-works/saas/>
- <https://developer.paddle.com/api-reference/transactions/create-transaction/>
- <https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session/>
- <https://developer.paddle.com/webhooks/about/signature-verification/>

### Processor + billing stack path

Stripe Billing offers flexible subscriptions and a mature hosted portal, with
public pay-as-you-go Billing pricing currently listed as 0.7% of Billing volume
in addition to payment processing and optional tax/compliance products.
Account and product availability is jurisdiction-dependent. Stripe currently
states new India accounts are invite-only and documents limitations for Billing
subscription plans there. Provider activation therefore cannot be assumed from
the founder's location.

Sources:

- <https://stripe.com/billing/pricing>
- <https://docs.stripe.com/billing/subscription-pricing>
- <https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india>

### Decision

The domain is provider-neutral and the first adapter targets Paddle sandbox.
The adapter uses provider-hosted checkout and customer portal links, never
stores card details, and rejects live mode. Enabling a live provider/account or
accepting money remains a founder decision.

Paddle does not provide a generic API idempotency key. ScopeDelta therefore
claims a workspace checkout attempt before the provider call, serializes
checkout initiation on the workspace, returns an already-created pending link
on retry, and leaves a process-interrupted `creating` attempt blocked for
explicit operator reconciliation. Outbound provider errors enter a short
reconciliation cooldown before a new attempt, limiting ambiguous retries rather
than risking uncontrolled duplicate subscriptions.

## Managed cost-driver evidence

### AI inference

SC-009 already records provider, model, input tokens, cached input tokens,
output tokens, duration, and failure state for each attempt. Its hard defaults
bound request size and concurrency, but managed cloud also needs a commercial
allowance.

Current public list prices show that a near-maximum request can vary by more
than an order of magnitude by model/provider. The entitlement domain therefore
reserves a configurable managed-AI credit before an attempt starts and settles
it once a provider call has begun. It does not embed vendor price tables.

Sources:

- <https://openai.com/api/pricing/>
- <https://ai.google.dev/gemini-api/docs/pricing>

### PostgreSQL and managed application operations

Authoritative delivery, commercial, client, engineering, QA, and AI history
lives in PostgreSQL. Managed database cost grows with compute, retained history,
backups, and storage. Netlify additionally meters application compute, traffic,
and deploy operations. These are operator margin inputs, not customer-facing
per-byte or per-request billing dimensions in Layer 6.

Provider references remain non-binding examples:

- <https://neon.com/pricing>
- <https://www.netlify.com/pricing/>

### Transactional email

Managed email has a low but nonzero provider cost and an abuse surface. Resend
currently lists a no-cost threshold and paid volume/overage tiers. ScopeDelta
therefore counts client invitation and collaboration-notification attempts and
enforces the configured managed-email allowance before SMTP. Self-host SMTP is
customer-operated and does not consume ScopeDelta-managed allowance.

Source: <https://resend.com/pricing>

### GitHub and future storage

GitHub API/webhook usage is a rate-limit and reliability concern rather than a
current direct cash meter, so SC-010 adds no GitHub billing entitlement. The
product also has no object-storage subsystem that justifies speculative
customer-facing byte billing. The plan shape keeps storage and processing
dimensions for future real cost drivers without building that infrastructure.

## Commercial-unit conclusion

The provider-neutral plan model supports:

> workspace subscription + active client-delivery capacity + included managed-resource allowance

It deliberately does not make per-seat the only primitive. Active projects are
the first hard delivery-capacity dimension. Internal-user capacity is an
optional guardrail. External client participants are measured separately and
never consume the internal-user capacity.

Plan keys, labels, display prices, provider price IDs, software capability
flags, active-project/internal-user limits, and managed AI/email/storage/
processing allowances live in one server configuration document. No public
plan name, price, or final allowance is committed in source.

## Trust and lifecycle conclusions

1. Browser redirects are informational. Only a correctly signed raw Paddle
   webhook can change paid entitlement.
2. Each provider event is stored by event ID with only type, object/workspace
   references, timestamp, payload hash, processing state, and safe error code.
   Full payloads are not persisted or logged.
3. Workspace subscription reconciliation serializes on the workspace and
   rejects customer/subscription/workspace mismatches.
4. Older events, including delayed payment failures, cannot regress newer
   provider state. Duplicate event IDs are idempotent.
5. `past_due` enters configurable grace. Grace and paid-through cancellation
   preserve reads/history. New managed-provider work is denied after the
   configured policy no longer permits it. Billing state never deletes project
   or commercial history.
6. Project creation/reactivation and internal invitation acceptance recheck
   capacity while holding the workspace lock. Concurrent requests cannot both
   consume the final slot.
7. Managed AI reserves within the job-attempt transaction before provider
   execution. Provider-started failures consume the credit; pre-provider
   validation/configuration failures do not.

## Operator evidence

The owner billing page and `pnpm billing:economics` expose bounded evidence for:

- active projects and internal/external participants;
- plan/subscription lifecycle;
- managed AI credits reserved/consumed;
- raw provider token/duration aggregates;
- client email attempts/failures;
- rejected/failed billing-event counts.

The export contains no customer document/request bodies, email content, card
data, API keys, or provider payloads. Provider price tables can be joined to
raw usage outside the authoritative entitlement state for cost analysis.

## Deferred founder/legal gates

- exact public plan names, prices, and allowances;
- live Paddle or replacement provider/account activation and material fees;
- accepting real customer payments;
- refund, tax, Terms, Privacy, and retention commitments;
- public source release, license text, and package boundary under LIC-001;
- material recurring infrastructure purchases.

## Implementation references

- `docs/decisions/ADR-012-billing-entitlement-resource-boundary.md`
- `docs/SELF_HOST.md`
- `src/lib/billing-plans.ts`
- `src/server/billing.ts`
- `src/server/paddle-billing.ts`
- migration `0015_subscription_cloud_economics.sql`
