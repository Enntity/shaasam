# Deploying Shaasam to Hetzner

This guide sets up a Hetzner VPS with Docker, Traefik SSL, and CI/CD via GitHub Actions.

## Prerequisites

- Hetzner Cloud VPS (Ubuntu 22.04)
- A domain name pointing to the VPS
- GitHub repo for this project

## Server setup

SSH into the server as root and run:

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/YOUR_REPO/main/deploy/setup-server.sh | bash
```

Or clone the repo and run locally:

```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO
sudo ./deploy/setup-server.sh
```

The script will:
- Install Docker, UFW, fail2ban, unattended-upgrades
- Create a non-root deploy user
- Harden SSH (disable password auth, optionally disable root login)
- Create `/opt/shaasam/.env`
- Create the Docker network

Production phone verification requires `TWILIO_ACCOUNT_SID`,
`TWILIO_VERIFY_SERVICE_SID`, `TWILIO_API_KEY_SID`, and `TWILIO_API_KEY_SECRET`.
Use a Restricted Twilio key with only `twilio/verify/verification/create` and
`twilio/verify/verification-check/create`. Do not install the full account Auth
Token on the production host. Missing restricted-key configuration fails closed;
production never falls back to direct Messaging or locally generated OTPs.

For migration, retain the previous immutable image/configuration until the new
image passes health and real send/check/session tests. Deploy the restricted key,
verify its policy and rejection of unrelated APIs, then rotate the account token
and verify that the old token is rejected. After revocation, rollback must retain
the restricted-key integration; the old image cannot use the revoked token.

## DNS

Point your domain to the server IP:

- `A` record for `${DOMAIN}`
- Optional: `traefik.${DOMAIN}` for Traefik dashboard

## GitHub Actions secrets

Add these repo secrets:

- `DEPLOY_HOST`: server IP or hostname
- `DEPLOY_USER`: deploy user (from setup script)
- `DEPLOY_SSH_KEY`: private key for the deploy user
- `DEPLOY_PORT`: optional, if not 22

## Deploy

Push to `main`:

```bash
git push origin main
```

The pipeline builds a Docker image, pushes to GHCR, and deploys on the VPS.
