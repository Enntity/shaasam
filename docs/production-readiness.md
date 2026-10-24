# Production readiness and rollout

This branch is a hardening and product pass, not evidence that production has been deployed or financially qualified. No real customer payment or SMS has been sent during development.

## Contract changes

- Give every agent a stable ID and independent key in SHAASAM_AGENT_KEYS. The legacy single key remains for local compatibility only. New records carry ownerId. Historical records without ownerId are inaccessible through agent APIs and cannot be claimed; do not assign all old records to the next caller. Reconcile ownership from existing receipts before any explicit migration.
- Task creation requires an Idempotency-Key, title, description, acceptanceCriteria, budgetCents (integer USD cents, $1–$1,000), and durationMinutes (1–120). Skills use the shared catalogue; [] means general help. The platform fee is fixed at creation. No callback URLs are accepted or executed, including existing records. Polling is supported.
- A human needs an active, verified profile, approval in production, and a Stripe account enabled for transfers/payouts to accept. Funding is bound to the accepted human and the agreed amount. Payment creation reserves one persistent record before calling Stripe. Funding retries reuse it; ambiguous attempts older than 23 hours stop for reconciliation because Stripe can prune idempotency keys after 24 hours.
- Starting work retrieves live Stripe authorization and requires enough time remaining for the task plus a day for review. Completion requires a written result. Agent capture requires completed, unreported work; cancellation requires accepted work that has not started. Both contend on the request document with human transitions and reports. Partial capture is not supported.
- Webhook signatures are verified. Stripe state is retrieved rather than trusting out-of-order event snapshots. Payment revisions protect overlapping reconciliations; duplicate event receipts are recorded after state persistence. GET payment also reconciles state, including expired hosted checkout. Refunds and provider owner/request/fee bindings are checked before settlement. Refunds are reflected from the charge, including the refunded amount.
- Phone sends/checks, profile operations, and agent operations use Mongo-backed quotas. Phone-specific send limits and atomic OTP attempt/consumption rules reduce concurrent abuse. Authenticated session mutations require a configured origin. Callers cannot broaden production origins through Host or a conflicting Referer.
- Tests never load .env.local or use application Mongo/provider credentials. They create and drop only a temporary MongoMemoryServer database.

## Before a release

1. Follow `deploy/README.md`: restore an approved production backup in an isolated environment, stop all writers, take and restore-verify the maintenance backup, generate a read-only migration plan, then explicitly apply it with the plan fingerprint and a private rollback journal. The script refuses changed records, duplicate bindings and conflicting definitions. Rehearse `node scripts/rehearse-migration.mjs` first; its synthetic backup/restore receipt does not verify a real production backup. No historical owner IDs are invented.
2. Set a random AUTH_SECRET and independent admin and agent secrets, each at least 32 characters. Set SITE_URL to the exact HTTPS origin. Configure restricted Twilio Verify credentials and live Stripe/Connect/webhook credentials. Keep secrets out of image build arguments. Review .env.example and the existing restricted Verify deployment guide.
3. The application must be reachable only through Traefik. Verify Traefik overwrites X-Real-IP and does not trust arbitrary forwarding headers. Only then set TRUST_PROXY=true. Confirm origin and CSRF failures from a different site. Protect the admin key outside browsers on shared machines.
4. Complete a Stripe test-mode round trip using an enabled connected account: hosted checkout, authorization, task start, result, capture, cancellation before start, failed/SCA payment, duplicate delivery, early webhook arrival, stale events, expiry, partial/full refund, and database failure between provider success and local persistence. Use Stripe's documented test tools. Verify human net amount and platform fees. Mocked unit tests do not establish these provider behaviors.
5. Establish staffed moderation and dispute handling, response times, a review deadline before hold expiry, refund/chargeback handling, and monitoring for completed-but-unpaid work. Alert on expired/expiring holds, reported tasks, failed webhook delivery, and operations requiring reconciliation. The application does not automatically adjudicate disputes or capture after a timeout.
6. Complete the commercial launch policies with appropriate counsel: permitted jurisdictions and ages, worker eligibility/classification, marketplace/payment terms, privacy and retention, taxes, deletion requests, accessibility, prohibited work, and insurance/physical-task risks. The help page is product guidance, not complete legal terms.
7. Build and verify the container on the deployment architecture. CI checks lint, types, tests, audit and build; main pushes build an image, while production deployment requires a manual workflow dispatch. Deploy the immutable digest. Health checks require valid configuration and Mongo availability. Keep the previous digest for rollback. A healthy endpoint is not a payment or SMS canary.
8. Run a limited, supervised live task with an authorized payer and worker after approval to deploy. Verify actual receipts, payout readiness, deployed revision/digest, and ordinary mobile onboarding. Expand access only after this passes.

## Remaining product work before unrestricted launch

Agent access is operator-provisioned. There is no self-service organization billing, prepaid wallet, or delegated spending-token facility. The direct PaymentIntent route supports an existing Stripe.js integration; the hosted checkout route lets the authorized payer complete payment without exposing card data to the agent. Do not advertise autonomous saved-card charging.

The admin console lists reports and records an auditable resolution before resuming normal settlement. Support must investigate with both parties; there is no automatic arbitration or payout guarantee. Card holds expire. Funds are not escrow. There is no durable outbound callback delivery, worker notification service, automatic idle-task expiration, or fraud/identity risk engine. Skill claims are self-reported; phone access is not identity or qualification verification. These are launch constraints, not features to imply in marketing.

## Provider references

- https://docs.stripe.com/payments/place-a-hold-on-a-payment-method
- https://docs.stripe.com/api/idempotent_requests
- https://docs.stripe.com/webhooks

## Qualification status (2026-10-24)

- Production was inspected read-only at image tag `d5a74ef`: zero requests, zero payments, one user. No migration or new application deployment was performed.
- The deployed restricted Twilio key reached Verify (404 / 20404 for a nonexistent challenge) and was denied unrelated account access (401 / 8021). The operator reported that Twilio already works and asked not to repeat verification. No new delivery or sign-in receipt was collected. This pass did not send an SMS.
- Stripe credentials are absent locally and on the server. The operator explicitly deferred real Stripe qualification until credentials exist. Unit tests cover application contracts with provider mocks; no real Stripe round trip is claimed.
- A full production export to the local machine was rejected by automatic approval review because it would transfer personal data without specific destination authorization. No production backup was exported. Restore qualification must occur in an approved data environment before release.
