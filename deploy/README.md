# Deploying Shaasam

Production runs on a Hetzner VPS with Docker, Traefik and external MongoDB. Source checks, provider qualification, migration and deployment are separate gates. A green build does not verify payments or SMS.

## Configuration

For a new host, review `deploy/setup-server.sh` before running it as root. It changes the firewall, SSH policy and installed software. Keep a working recovery session open. Existing hosts should update their configuration deliberately rather than rerun bootstrap.

Use `deploy/env.example` as the contract for `/opt/shaasam/.env`, mode 600. Set `SITE_URL` to the canonical HTTPS origin. Generate independent random auth, admin and agent keys of at least 32 characters. Production requires `SHAASAM_AGENT_KEYS`, a JSON map from stable agent IDs to keys; the legacy `SHAASAM_API_KEY` is not accepted in production. Rotating a value must retain its agent ID so ownership remains intact.

Production phone verification requires `TWILIO_ACCOUNT_SID`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET`. Use a Restricted Twilio key with only `twilio/verify/verification/create` and `twilio/verify/verification-check/create`. Do not put the account Auth Token on the host. Verify unrelated API access is denied and complete a real send/check/session flow. After credential revocation, any rollback must retain restricted-key support.

Configure Stripe Connect and `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`. First qualify test-mode checkout, authorization, capture, cancellation, expiry, refunds, webhooks and failure recovery. See `docs/production-readiness.md`. Test keys and mocked tests do not establish live financial readiness.

The app must have no published port or path around Traefik. Confirm the proxy overwrites client-supplied `X-Real-IP` before setting `TRUST_PROXY=true`. Otherwise clients can evade IP quotas. Readiness deliberately fails until required configuration is present.

## Database maintenance

Never run the migration from the application startup path. Read-only planning is the default. Migration touches only the two payment indexes and the request ownership/idempotency index; it does not assign historical ownership, rewrite records or delete data.

1. Restore a recent production backup into an isolated, access-controlled database within the approved data environment. Check document counts and content, rehearse migration, verify application indexes, and rehearse rollback there. `node scripts/rehearse-migration.mjs` exercises these mechanics with synthetic data using local `mongodump`/`mongorestore`; it is not a production-backup restore receipt.
2. Schedule maintenance and stop **all** app/worker writers. Confirm Stripe retries can arrive after downtime. Take the final consistent backup while writers remain stopped, and verify its restoration. Keep its location, revision, counts and original image digest in the release record.
3. Explicitly select `MONGODB_URI` and `MONGODB_DB` in a protected operator session. The migration does not load `.env.local`. Never put credentials into command arguments, terminal output or source control.
4. Create and inspect a plan. The file records index definitions, document counts/digests, collection IDs and a fingerprint. It contains no document bodies. Blockers must be reconciled manually; do not delete financial records to satisfy an index.

```bash
node scripts/migrate-payment-indexes.mjs --plan /secure/release/plan.json
node scripts/migrate-payment-indexes.mjs \
  --apply /secure/release/plan.json \
  --journal /secure/release/migration-journal.json \
  --maintenance-confirmed --backup-verified
node scripts/migrate-payment-indexes.mjs
```

The final plan must show no changes or blockers. Apply refuses a stale/edited plan, duplicate bindings, custom conflicting indexes, or an unwritable journal. Journal files are private and atomically updated with fsync. Existing journal files are never overwritten on a new apply. Keep writers stopped until verification succeeds. If interrupted, inspect the journal before retrying; do not assume all indexes changed together.

Before traffic resumes, index rollback is:

```bash
node scripts/migrate-payment-indexes.mjs \
  --rollback /secure/release/migration-journal.json --maintenance-confirmed
```

Rollback restores only the indexes recorded by this migration. It refuses changed financial/request documents or unexpected indexes. After new writes, the old schema/image may no longer be compatible: prefer a forward fix; do not blindly restore a backup and discard new work.

## Release and rollback

Set repository or protected `production` environment secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, and optional `DEPLOY_PORT`. Require review on the production environment.

PRs run checks. Main pushes run checks and build a GHCR image. **Only a manual workflow dispatch from main deploys.** Complete the maintenance and provider gates before dispatch. The workflow deploys an immutable digest, waits for application/database health and then persists it in `/opt/shaasam/.release.env`. It retains `.release.previous.env` and older images for rollback. Record the previous image digest manually on the first release from the legacy tag-based setup.

For subsequent Compose operations, include both env files:

```bash
docker compose --env-file .env --env-file .release.env -f docker-compose.prod.yml up -d
```

A failed health check leaves the candidate release file for diagnosis and does not mark it as the verified release. Before reverting to the previous image, check schema compatibility and the maintenance journal. With a compatible database, use `.release.previous.env` instead of `.release.env`, verify health, then persist the selected release. Do not reuse `latest` as rollback evidence.

After deployment, verify the image digest, health, origin/IP controls, human onboarding and an explicitly authorized supervised payment. Keep the market restricted until the operating policies, moderation, dispute/refund handling and live provider checks are complete.
