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
