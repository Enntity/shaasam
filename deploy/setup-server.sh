#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() {
  echo -e "${GREEN}$1${NC}"
}

set_sshd_config() {
  local key="$1"
  local value="$2"
  if grep -qE "^#?${key} " /etc/ssh/sshd_config; then
    sed -i "s/^#\?${key}.*/${key} ${value}/" /etc/ssh/sshd_config
  else
    echo "${key} ${value}" >> /etc/ssh/sshd_config
  fi
}

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Shaasam Server Setup Script                        ║${NC}"
echo -e "${GREEN}║         For Hetzner Cloud (Ubuntu 22.04)                   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "${EUID}" -ne 0 ]; then
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

echo -e "${YELLOW}Please provide the following information:${NC}"
echo ""

read -r -p "Domain name (e.g., app.example.com): " DOMAIN
read -r -p "Email for SSL certificates: " ACME_EMAIL
read -r -p "MongoDB connection string: " MONGODB_URI
read -r -p "MongoDB database name (default: shaasam): " MONGODB_DB
MONGODB_DB=${MONGODB_DB:-shaasam}

read -r -p "Auth Secret (leave blank to generate): " AUTH_SECRET
if [ -z "${AUTH_SECRET}" ]; then
  AUTH_SECRET=$(openssl rand -base64 32)
  echo -e "${GREEN}Generated AUTH_SECRET${NC}"
fi

read -r -p "Shaasam API key (leave blank to generate): " SHAASAM_API_KEY
if [ -z "${SHAASAM_API_KEY}" ]; then
  SHAASAM_API_KEY=$(openssl rand -hex 24)
  echo -e "${GREEN}Generated SHAASAM_API_KEY${NC}"
fi

read -r -p "Shaasam Admin key (leave blank to generate): " SHAASAM_ADMIN_KEY
if [ -z "${SHAASAM_ADMIN_KEY}" ]; then
  SHAASAM_ADMIN_KEY=$(openssl rand -hex 32)
  echo -e "${GREEN}Generated SHAASAM_ADMIN_KEY${NC}"
fi

read -r -p "Platform fee in basis points (default: 0): " SHAASAM_PLATFORM_FEE_BPS
SHAASAM_PLATFORM_FEE_BPS=${SHAASAM_PLATFORM_FEE_BPS:-0}

read -r -p "Require review before listing? (true/false, default: true): " REQUIRE_REVIEW
REQUIRE_REVIEW=${REQUIRE_REVIEW:-true}

echo ""
echo -e "${YELLOW}Twilio (optional):${NC}"
read -r -p "Twilio Account SID: " TWILIO_ACCOUNT_SID
read -r -p "Twilio Auth Token: " TWILIO_AUTH_TOKEN
read -r -p "Twilio From Number: " TWILIO_FROM

echo ""
echo -e "${YELLOW}Stripe (optional):${NC}"
read -r -p "Stripe Secret Key: " STRIPE_SECRET_KEY
read -r -p "Stripe Webhook Secret: " STRIPE_WEBHOOK_SECRET
read -r -p "Stripe Connect Return URL (default: https://${DOMAIN}/dashboard): " STRIPE_CONNECT_RETURN_URL
read -r -p "Stripe Connect Refresh URL (default: https://${DOMAIN}/dashboard): " STRIPE_CONNECT_REFRESH_URL
STRIPE_CONNECT_RETURN_URL=${STRIPE_CONNECT_RETURN_URL:-https://${DOMAIN}/dashboard}
STRIPE_CONNECT_REFRESH_URL=${STRIPE_CONNECT_REFRESH_URL:-https://${DOMAIN}/dashboard}

echo ""
read -r -p "GitHub repository (e.g., enntity/shaasam): " GITHUB_REPOSITORY
GITHUB_REPOSITORY=$(echo "${GITHUB_REPOSITORY}" | tr '[:upper:]' '[:lower:]')

echo ""
echo -e "${YELLOW}Security hardening:${NC}"
read -r -p "Create non-root deploy user (default: deploy): " DEPLOY_USER
DEPLOY_USER=${DEPLOY_USER:-deploy}
read -r -p "Disable root SSH login? (y/n, default: y): " DISABLE_ROOT
DISABLE_ROOT=${DISABLE_ROOT:-y}

print_step "Step 1: Updating system..."
apt-get update && apt-get upgrade -y

print_step "Step 2: Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo -e "${GREEN}Docker installed successfully${NC}"
else
  echo -e "${YELLOW}Docker already installed${NC}"
fi

print_step "Step 3: Installing additional tools..."
apt-get install -y apache2-utils curl git ufw fail2ban unattended-upgrades
systemctl enable --now fail2ban
systemctl enable --now unattended-upgrades

read -r -p "Traefik dashboard username (default: admin): " TRAEFIK_USER
TRAEFIK_USER=${TRAEFIK_USER:-admin}
TRAEFIK_PASSWORD=$(openssl rand -base64 12 | tr -d '=+/')
TRAEFIK_DASHBOARD_AUTH=$(htpasswd -nb "${TRAEFIK_USER}" "${TRAEFIK_PASSWORD}" | sed 's/\$/\$\$/g')

print_step "Step 4: Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

print_step "Step 5: Creating deploy user and hardening SSH..."
if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG sudo,docker "${DEPLOY_USER}"

mkdir -p "/home/${DEPLOY_USER}/.ssh"
if [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
fi
chmod 700 "/home/${DEPLOY_USER}/.ssh"
chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys" || true
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"

set_sshd_config "PasswordAuthentication" "no"
set_sshd_config "ChallengeResponseAuthentication" "no"
set_sshd_config "PubkeyAuthentication" "yes"
if [ "${DISABLE_ROOT}" = "y" ] || [ "${DISABLE_ROOT}" = "Y" ]; then
  set_sshd_config "PermitRootLogin" "no"
  set_sshd_config "AllowUsers" "${DEPLOY_USER}"
else
  set_sshd_config "AllowUsers" "${DEPLOY_USER} root"
fi
systemctl restart ssh

print_step "Step 6: Creating application directory..."
mkdir -p /opt/shaasam
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" /opt/shaasam
cd /opt/shaasam

print_step "Step 7: Creating environment file..."
cat > .env << EOF_ENV
# Domain Configuration
DOMAIN=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}

# GitHub Container Registry
GITHUB_REPOSITORY=${GITHUB_REPOSITORY}
IMAGE_TAG=latest

# MongoDB
MONGODB_URI=${MONGODB_URI}
MONGO_URI=${MONGODB_URI}
MONGODB_DB=${MONGODB_DB}

# Authentication
AUTH_SECRET=${AUTH_SECRET}
SHAASAM_API_KEY=${SHAASAM_API_KEY}
SHAASAM_PLATFORM_FEE_BPS=${SHAASAM_PLATFORM_FEE_BPS}
SHAASAM_ADMIN_KEY=${SHAASAM_ADMIN_KEY}
REQUIRE_REVIEW=${REQUIRE_REVIEW}

# Twilio (optional)
TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
TWILIO_FROM=${TWILIO_FROM}

# Stripe (optional)
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
STRIPE_CONNECT_RETURN_URL=${STRIPE_CONNECT_RETURN_URL}
STRIPE_CONNECT_REFRESH_URL=${STRIPE_CONNECT_REFRESH_URL}

# Traefik Dashboard
TRAEFIK_DASHBOARD_AUTH=${TRAEFIK_DASHBOARD_AUTH}
EOF_ENV

chmod 600 .env
chown "${DEPLOY_USER}:${DEPLOY_USER}" .env

print_step "Step 8: Creating Docker network..."
docker network create shaasam_web 2>/dev/null || true

PUBLIC_IP=$(curl -s ifconfig.me || true)

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Setup Complete!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}Next steps:${NC}"

echo "1. Point your DNS:"
if [ -n "${PUBLIC_IP}" ]; then
  echo "   - ${DOMAIN} → ${PUBLIC_IP}"
  echo "   - traefik.${DOMAIN} → ${PUBLIC_IP} (optional, for dashboard)"
else
  echo "   - ${DOMAIN} → <your server IP>"
  echo "   - traefik.${DOMAIN} → <your server IP> (optional, for dashboard)"
fi

echo ""
echo "2. Add these secrets to your GitHub repository:"
echo "   Settings → Secrets and variables → Actions → New repository secret"

echo "   DEPLOY_HOST: ${PUBLIC_IP}"
echo "   DEPLOY_USER: ${DEPLOY_USER}"
echo "   DEPLOY_SSH_KEY: (your private SSH key)"
echo "   DEPLOY_PORT: 22 (only if not 22)"

echo ""
echo "3. Push to main branch to trigger deployment"

echo ""
echo -e "${YELLOW}Saved credentials:${NC}"
echo "   Traefik Dashboard: https://traefik.${DOMAIN}"
echo "   Username: ${TRAEFIK_USER}"
echo "   Password: ${TRAEFIK_PASSWORD}"

echo ""
echo "Environment file: /opt/shaasam/.env"
