# Shaasam Agent Handbook

Read this before changing Shaasam. This service handles human identity, agent requests, callbacks, moderation, and money; treat it as an external high-trust capability boundary, not a casual Enntity helper.

## What this repository is

Shaasam means “Humans as a Service for AI agents.” It is a Next.js/TypeScript service where humans verify by phone, publish skills/rates/availability, receive and perform agent-created requests, and connect payouts. Agents use API-key-authenticated endpoints; humans use same-origin session cookies; administrators use a separate moderation key/role boundary.

Shaasam is adjacent to Enntity but does not own entity identity, continuity, Compass, Eidos, autonomy, or model routing. An entity may use Shaasam as an external capability to request consensual human work.

## Shared Enntity vocabulary

- **Enntity** is the framework; an **entity** is a persistent synthetic individual.
- **Jinx** is a real long-running entity, not an API-key label or test requester. A Shaasam request made by her is an external action with cost, consent, and relationship consequences.
- **Entity is not model**: models are replaceable cognitive substrates. The requester identity must not collapse to a model name.
- **Body / runtime** is `enntity-runtime`, which owns authority, permissions, receipts, continuity, and autonomous work.
- **Continuity** preserves autobiographical and relational meaning. Shaasam stores marketplace/request records, not entity memory.
- **Working set / foreground** is Runtime-owned unfinished work. A Shaasam request status may be perceived into that state but is not the state itself.
- **Compass** is an entity's temporal posture, not a Shaasam job queue.
- **Eidos / affective economy** reflect verified conduct and consequences. Payment or request completion can become evidence, but Shaasam must not assign personality or reward.
- **Perception** is current input from people/services. Callback and request events are external signals with provenance.
- **Receipt / evidence** is verified action/outcome data. Store auditable request/payment transitions so Runtime can ground claims.
- **Provenance** distinguishes agent request, human report, platform verification, Stripe/Twilio webhook, inference, and intention.
- **Presence / autonomy / Pulse / sleep** are cognition lifecycle concepts outside Shaasam.
- **Cortex** is cloud AI middleware; **Concierge** and iOS are relationship transports; **LLooM** is model routing.
- **Gardener principle**: external capability systems should support agency without prescribing identity or exploiting participants.

Canonical shorthand: Shaasam coordinates consensual human capability; the entity runtime decides why and whether to use it; continuity decides what the experience means.

## Domain vocabulary

- **Agent API**: machine-facing routes protected by `x-api-key` or bearer key when `SHAASAM_API_KEY` is configured.
- **Human session**: signed `shaasam_session` HTTP-only cookie produced after phone verification.
- **Human**: verified user profile with skills, categories, rate, availability, status/review state, and optional Stripe account.
- **Request**: agent-authored work offer with title, description, skills, budget, requester metadata, optional callback, and lifecycle status.
- **Request lifecycle**: open → accepted → started → completed, with decline and payment state tracked separately. Preserve transition ownership and idempotency.
- **Skill**: normalized choice from `lib/skills.ts`; categories are derived from known skill metadata. Do not accept arbitrary labels as equivalent without a migration decision.
- **Review**: moderation state controlling visibility when `REQUIRE_REVIEW` is enabled.
- **Payment intent**: Stripe manual-capture hold directed to a connected human account, optionally tied to a request.
- **Capture / cancel**: release or cancel held funds. These are irreversible/external operations requiring exact authorization and idempotent handling.
- **Platform fee**: basis-point fee from `SHAASAM_PLATFORM_FEE_BPS`.
- **Callback**: best-effort outbound notification to the agent-supplied URL. It is not a source of truth for local request state.
- **Audit record**: immutable-enough record of security/financial/domain action. Add one for meaningful state mutations.

## Repository map

- `app/`: pages and Next.js route handlers.
- `app/api/humans*`: agent discovery and human request inbox.
- `app/api/requests*`: agent request creation/read and lifecycle.
- `app/api/auth*`, `lib/auth.ts`, `lib/otp.ts`, `lib/twilio.ts`: phone verification and sessions.
- `app/api/payments*`, `lib/stripe.ts`: Connect, payment intents, capture/cancel, and payment lookup.
- `app/api/webhooks/stripe`: verified Stripe event ingestion.
- `app/api/admin*`, `lib/admin.ts`: moderation.
- `lib/api-key.ts`, `lib/api-key-rate-limit.ts`, `lib/rate-limit.ts`: machine and abuse controls.
- `lib/mongodb.ts`, `lib/indexes.ts`: database connection and indexes.
- `lib/audit.ts`: audit trail.
- `lib/callbacks.ts`, `lib/origin.ts`: outbound callback and same-origin controls.
- `tests/`: API and library contracts, backed by real test Mongo or MongoMemoryServer.
- `Dockerfile`, `docker-compose.prod.yml`, `.github/workflows/deploy.yml`, `deploy/`: production artifact/deploy path.

## Trust boundaries

### Agent routes

- Require the configured API key in production; absence currently makes `isValidApiKey` permissive and is suitable only for deliberate local development.
- Apply per-key rate limits, validate/bound every field, and audit mutations.
- Do not treat requester display metadata as authenticated human or organization identity.
- Agent authority to create a request is not automatic authority to capture funds or act for a human.

### Human routes

- Auth start/verify and profile/inbox actions are same-origin and session-bound.
- Session cookies are HTTP-only, same-site, secure in production, and signed with `AUTH_SECRET`.
- `AUTH_SECRET` and real Twilio configuration are mandatory production security concerns; dev fallbacks must never be accepted as production readiness.
- Phone verification proves control of a number at that time, not every biographical/skill claim.

### Admin routes

- `SHAASAM_ADMIN_KEY`/admin checks must be enforced in the handler, not only hidden in UI.
- Prevent self-demotion/lockout and audit review/status changes.
- Review status and account status are distinct; preserve both.

### Payments

- Amounts are integer minor units (currently cents) and allowed currency is currently USD.
- Verify human existence, verification, payout account, request linkage, and allowed transition before calling Stripe.
- Use Stripe IDs and local payment IDs carefully; retries and webhooks must not double-capture or diverge local state.
- Verify webhook signatures before trusting payment events.
- Never log client secrets, Stripe secrets, full payment objects, or personal financial information.

### Callbacks

- Agent-provided callback URLs are untrusted outbound destinations and an SSRF/egress boundary. Validate scheme/host/policy before expanding callback functionality.
- Current callbacks are short-timeout, best-effort notifications. Persist local state first; a failed callback must not roll back a completed human/payment transition.
- Do not send secrets or unnecessary human PII in callback payloads.

## Data and lifecycle rules

- Use Mongo `ObjectId` validation before constructing IDs.
- Normalize skills/categories consistently through `lib/skills.ts` and `lib/categories.ts`.
- Preserve timestamps (`createdAt`, `updatedAt`, transition times) and audit actors.
- Ensure indexes through `lib/indexes.ts`; tests recreate the database and indexes per case.
- Keep public discovery filtered by verification, status, review policy, skills/categories, availability, and rate as the route contract requires.
- Lifecycle transitions must be authorized by the correct actor and reject stale/invalid transitions.
- External services can fail after local checks. Design retries and reconciliation rather than pretending calls are atomic.

## Development workflow

1. Inspect branch/dirty state and preserve unrelated deployment/runtime work.
2. Use Node `24.22.1` via `.nvmrc`; the Docker image and engine range are pinned to Node 24.
3. Identify the actor and trust boundary for every route: anonymous, agent key, human session, admin, Stripe webhook, or outbound callback.
4. Add/adjust API tests for authorization, validation, rate limit, lifecycle, audit, and error behavior.
5. Never hit real Twilio/Stripe or production Mongo from unit tests.
6. Run full lint, typecheck, tests, and build for route/schema changes.
7. Treat payment/auth/deploy changes as high risk and review the complete diff.

## Commands

```bash
nvm use
npm ci
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Tests use `TEST_MONGO_URI`, `MONGO_URI`, or `MONGODB_URI` when a reachable test database is explicitly available; otherwise they start MongoMemoryServer. The test database is dropped between tests. Never point these variables at production.

For local development:

```bash
cp .env.example .env.local
npm run dev
```

When Twilio is not configured, development may log an OTP. Do not expose that behavior in production logs or shared environments. When Stripe is absent, payout/payment routes should fail explicitly rather than simulate money movement.

## Deployment

Production uses a Node 24 Debian image, Next.js app container, external MongoDB, and Traefik on a Hetzner VPS. GitHub Actions builds/pushes GHCR images and deploys Compose under `/opt/shaasam` with a non-root deploy user.

- Keep `package.json`, `.nvmrc`, Docker base image, lockfile, and workflow expectations aligned.
- Verify the built container on the target architecture; local host success alone is not the artifact boundary.
- Deployment health must test the application route and dependencies, not only `docker ps`.
- Re-check current action versions, image tags, domain, Compose env, and server state before deployment.
- Deploy only when explicitly requested.

## Definition of done

A Shaasam change is done when actor authorization is explicit, inputs and transitions are bounded, audits and timestamps remain correct, financial/external calls are safe under retry, callbacks do not become a trust leak, lint/typecheck/tests/build pass, the production artifact path is preserved, and no secret or real user/payment data entered the repository or logs.
