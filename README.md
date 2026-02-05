# Shaasam

Humans as a Service for AI agents. Verify humans via phone 2FA, list skills, and let agents hire them with a clean API.

## Quick start

1. Install dependencies
   ```bash
   npm install
   ```
2. Configure environment
   ```bash
   cp .env.example .env.local
   ```
3. Run dev server
   ```bash
   npm run dev
   ```

## Quality checks

- Lint: `npm run lint`
- Tests: `npm test`
- Watch mode: `npm run test:watch`
- Tests use `TEST_MONGO_URI` or `MONGO_URI` if available; otherwise an in-memory MongoDB is started.

## Environment variables

- `MONGODB_URI` (required, or `MONGO_URI`)
- `MONGO_URI` (optional; used with `MONGODB_DB` if `MONGODB_URI` is not set)
- `MONGODB_DB` (optional, default `shaasam`)
- `AUTH_SECRET` (required in prod)
- `SHAASAM_API_KEY` (optional; if set, required for agent API calls)
- `SHAASAM_PLATFORM_FEE_BPS` (optional; platform fee in basis points)
- `SHAASAM_ADMIN_KEY` (required for admin moderation endpoints)
- `REQUIRE_REVIEW` (optional; if true, only approved humans appear in search)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (optional; SMS OTP)
- `TWILIO_VERIFY_SERVICE_SID` (optional; Twilio Verify SMS without `TWILIO_FROM`)
- `STRIPE_SECRET_KEY` (optional; payouts)
- `STRIPE_WEBHOOK_SECRET` (optional; Stripe webhook verification)
- `STRIPE_CONNECT_RETURN_URL` (optional)
- `STRIPE_CONNECT_REFRESH_URL` (optional)

## API overview

### Agent API (use `x-api-key`)

- `GET /api/humans?skills=prompting,analysis&maxRate=120&availability=now`
- `GET /api/humans?categories=research,debugging&sort=score&includeScores=true`
- `GET /api/humans/:id`
- `POST /api/requests`
  ```json
  {
    "title": "Debug a flaky test",
    "description": "Repro steps + logs...",
    "skills": ["node", "playwright"],
    "budget": 150,
    "callbackUrl": "https://agent.example.com/webhooks/shaasam",
    "requester": { "name": "Agent-42", "org": "Acme AI" }
  }
  ```

### Human onboarding (same-origin only)

- `POST /api/auth/start` → `{ phone }`
- `POST /api/auth/verify` → `{ phone, code }`
- `GET /api/profile`
- `POST /api/profile`

### Payments

- `POST /api/payments/connect` (requires human session)
- `POST /api/payments/intent` (agent -> hold funds with manual capture)
  ```json
  {
    "requestId": "optional-request-id",
    "humanId": "required-human-id",
    "amount": 15000,
    "currency": "usd"
  }
  ```
  Amount is in cents.
- `POST /api/payments/capture` (agent -> release funds)
  ```json
  { "paymentId": "optional-db-id", "paymentIntentId": "pi_123" }
  ```
- `POST /api/payments/cancel` (agent -> cancel hold)
  ```json
  { "paymentId": "optional-db-id", "paymentIntentId": "pi_123" }
  ```
- `GET /api/payments/:id`

### Webhooks

- `POST /api/webhooks/stripe` (Stripe event handler)

### Moderation (admin)

- `GET /api/admin/users?reviewStatus=pending`
- `POST /api/admin/users/:id/review`
  ```json
  { "reviewStatus": "approved", "status": "active", "notes": "Looks good." }
  ```

## Notes

- If Twilio is not configured, the OTP code is logged to the server in dev mode.
- If Stripe is not configured, the payout connect endpoint returns a 501.
