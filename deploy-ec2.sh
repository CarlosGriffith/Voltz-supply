#!/bin/bash

# ============================================================
# Voltz Industrial Supply — EC2 + Nginx + SSL Deployment
# Domain: voltzsupply.com
# ============================================================
#
# This script is run ON YOUR EC2 INSTANCE (not locally).
#
# FULL PROCESS OVERVIEW:
# ──────────────────────────────────────────────────────────
#
#   STEP A — NAMECHEAP DNS (do this FIRST, takes 5-30 min to propagate)
#   ─────────────────────────────────────────────────────────
#   1. Log into Namecheap → Domain List → voltzsupply.com → Manage
#   2. Go to "Advanced DNS" tab
#   3. Delete any existing A records or CNAME for @ and www
#   4. Add these records:
#
#      Type     Host    Value              TTL
#      ──────   ─────   ────────────────   ──────
#      A        @       YOUR_EC2_IP        Automatic
#      A        www     YOUR_EC2_IP        Automatic
#
#   5. Save changes. Wait 5-30 minutes for propagation.
#   6. Verify: ping voltzsupply.com (should return your EC2 IP)
#
#
#   STEP B — EC2 SECURITY GROUP (AWS Console)
#   ─────────────────────────────────────────────────────────
#   Make sure your EC2 Security Group allows:
#      - SSH    (port 22)   from your IP
#      - HTTP   (port 80)   from 0.0.0.0/0 and ::/0
#      - HTTPS  (port 443)  from 0.0.0.0/0 and ::/0
#
#
#   STEP C — LOCAL: Build & Upload (run on YOUR computer)
#   ─────────────────────────────────────────────────────────
#   npm run build
#   scp -i your-key.pem -r dist/* ec2-user@YOUR_EC2_IP:/tmp/voltzsupply/
#
#
#   STEP D — EC2: Run this script (SSH into EC2 and run)
#   ─────────────────────────────────────────────────────────
#   ssh -i your-key.pem ec2-user@YOUR_EC2_IP
#   chmod +x deploy-ec2.sh
#   ./deploy-ec2.sh
#
# ============================================================

set -e

# ─── Colors for output ──────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

DOMAIN="voltzsupply.com"
WWW_DOMAIN="www.voltzsupply.com"
WEB_ROOT="/var/www/voltzsupply"
NGINX_CONF="/etc/nginx/conf.d/voltzsupply.conf"
CERTBOT_WEBROOT="/var/www/certbot"
EMAIL="admin@voltzsupply.com"  # Change to your real email for Let's Encrypt notifications

echo ""
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  Voltz Supply — EC2 SSL Deployment${NC}"
echo -e "${BLUE}  Domain: ${DOMAIN}${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# ─── Check if running as root or with sudo ──────────────────
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}This script requires sudo privileges. Re-running with sudo...${NC}"
    exec sudo bash "$0" "$@"
fi

# ============================================================
# PHASE 1: INSTALL DEPENDENCIES
# ============================================================
echo -e "${GREEN}[1/7] Installing system dependencies...${NC}"

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
fi

if [[ "$OS" == "amzn" ]]; then
    echo "  Detected: Amazon Linux"
    dnf update -y -q
    dnf install -y -q nginx certbot python3-certbot-nginx
elif [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    echo "  Detected: Ubuntu/Debian"
    apt-get update -qq
    apt-get install -y -qq nginx certbot python3-certbot-nginx
elif [[ "$OS" == "centos" || "$OS" == "rhel" || "$OS" == "rocky" || "$OS" == "almalinux" ]]; then
    echo "  Detected: CentOS/RHEL"
    dnf install -y -q epel-release
    dnf install -y -q nginx certbot python3-certbot-nginx
else
    echo -e "${RED}  Unsupported OS: $OS. Install nginx and certbot manually.${NC}"
    exit 1
fi

echo -e "  ${GREEN}Done.${NC}"

# ============================================================
# PHASE 2: CREATE DIRECTORIES
# ============================================================
echo -e "${GREEN}[2/7] Creating web directories...${NC}"

mkdir -p $WEB_ROOT
mkdir -p $CERTBOT_WEBROOT

echo -e "  ${GREEN}Done. Web root: ${WEB_ROOT}${NC}"

# ============================================================
# PHASE 3: DEPLOY WEBSITE FILES
# ============================================================
echo -e "${GREEN}[3/7] Deploying website files...${NC}"

# Check if files were uploaded to /tmp/voltzsupply
if [ -d "/tmp/voltzsupply" ] && [ "$(ls -A /tmp/voltzsupply 2>/dev/null)" ]; then
    echo "  Copying files from /tmp/voltzsupply..."
    cp -r /tmp/voltzsupply/* $WEB_ROOT/
    rm -rf /tmp/voltzsupply
    echo -e "  ${GREEN}Files deployed from /tmp/voltzsupply.${NC}"
elif [ -d "./dist" ] && [ "$(ls -A ./dist 2>/dev/null)" ]; then
    echo "  Copying files from ./dist..."
    cp -r ./dist/* $WEB_ROOT/
    echo -e "  ${GREEN}Files deployed from ./dist.${NC}"
else
    echo -e "  ${YELLOW}WARNING: No build files found!${NC}"
    echo "  Upload your build files first:"
    echo "    scp -i key.pem -r dist/* ec2-user@YOUR_IP:/tmp/voltzsupply/"
    echo ""
    echo "  Or build on the server:"
    echo "    npm run build"
    echo "    cp -r dist/* ${WEB_ROOT}/"
    echo ""
    echo "  Creating a placeholder page for now..."
    cat > $WEB_ROOT/index.html << 'PLACEHOLDER'
<!DOCTYPE html>
<html>
<head><title>Voltz Supply - Coming Soon</title></head>
<body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#0f172a;color:#fff;">
<div style="text-align:center;">
<h1>Voltz Industrial Supply</h1>
<p>Website deployment in progress...</p>
</div>
</body>
</html>
PLACEHOLDER
fi

# Set proper ownership
chown -R nginx:nginx $WEB_ROOT 2>/dev/null || chown -R www-data:www-data $WEB_ROOT 2>/dev/null || true
chmod -R 755 $WEB_ROOT

echo -e "  ${GREEN}Done.${NC}"

# ============================================================
# PHASE 4: CONFIGURE NGINX
# ============================================================
echo -e "${GREEN}[4/7] Configuring Nginx...${NC}"

# Backup existing config if present
if [ -f "$NGINX_CONF" ]; then
    cp $NGINX_CONF ${NGINX_CONF}.bak.$(date +%s)
    echo "  Backed up existing config."
fi

# Remove default site config if it exists
rm -f /etc/nginx/conf.d/default.conf 2>/dev/null
rm -f /etc/nginx/sites-enabled/default 2>/dev/null

# Write Nginx configuration (HTTP only — Certbot will add SSL)
cat > $NGINX_CONF << 'NGINXCONF'
# Voltz Supply — Nginx Configuration
# SSL will be auto-configured by Certbot

server {
    listen 80;
    listen [::]:80;
    server_name voltzsupply.com www.voltzsupply.com;

    root /var/www/voltzsupply;
    index index.html;

    # Allow Certbot ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        allow all;
    }

    # SPA routing — serve index.html for all non-file routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets (JS, CSS with hashed filenames)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Cache images and fonts
    location ~* \.(jpg|jpeg|png|gif|ico|svg|webp|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public";
        access_log off;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        application/json
        application/javascript
        text/xml
        application/xml
        application/xml+rss
        text/javascript
        image/svg+xml
        application/font-woff
        application/font-woff2;
}
NGINXCONF

# Test Nginx configuration
echo "  Testing Nginx configuration..."
nginx -t

if [ $? -ne 0 ]; then
    echo -e "  ${RED}Nginx configuration test FAILED! Check the config.${NC}"
    exit 1
fi

echo -e "  ${GREEN}Done.${NC}"

# ============================================================
# PHASE 5: START NGINX
# ============================================================
echo -e "${GREEN}[5/7] Starting Nginx...${NC}"

systemctl enable nginx
systemctl restart nginx

echo -e "  ${GREEN}Nginx is running.${NC}"

# ============================================================
# PHASE 6: VERIFY DNS BEFORE SSL
# ============================================================
echo -e "${GREEN}[6/7] Verifying DNS resolution...${NC}"

echo "  Checking if ${DOMAIN} resolves to this server..."

# Get server's public IP
SERVER_IP=$(curl -s http://checkip.amazonaws.com 2>/dev/null || curl -s http://ifconfig.me 2>/dev/null || echo "unknown")
DNS_IP=$(dig +short ${DOMAIN} 2>/dev/null | head -1)

echo "  Server IP:  ${SERVER_IP}"
echo "  DNS points: ${DNS_IP:-not resolved yet}"

if [ "$SERVER_IP" != "$DNS_IP" ]; then
    echo ""
    echo -e "  ${YELLOW}═══════════════════════════════════════════════════${NC}"
    echo -e "  ${YELLOW}  DNS NOT READY YET${NC}"
    echo -e "  ${YELLOW}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Your domain ${DOMAIN} does not point to this server yet."
    echo "  DNS propagation can take 5-30 minutes."
    echo ""
    echo "  In Namecheap → Advanced DNS, add:"
    echo "    A Record  |  @    |  ${SERVER_IP}  |  Automatic"
    echo "    A Record  |  www  |  ${SERVER_IP}  |  Automatic"
    echo ""
    echo "  After DNS propagates, run the SSL step manually:"
    echo -e "    ${BLUE}sudo certbot --nginx -d ${DOMAIN} -d ${WWW_DOMAIN} --email ${EMAIL} --agree-tos --non-interactive --redirect${NC}"
    echo ""
    echo -e "  ${GREEN}Your site is live on HTTP: http://${SERVER_IP}${NC}"
    echo ""

    # Ask if user wants to proceed anyway
    read -p "  Try SSL anyway? (DNS might have propagated) [y/N]: " PROCEED
    if [[ ! "$PROCEED" =~ ^[Yy]$ ]]; then
        echo ""
        echo -e "${GREEN}==========================================${NC}"
        echo -e "${GREEN}  HTTP deployment complete!${NC}"
        echo -e "${GREEN}  Site: http://${SERVER_IP}${NC}"
        echo -e "${GREEN}==========================================${NC}"
        echo ""
        echo "  Run this command after DNS propagates:"
        echo -e "  ${BLUE}sudo certbot --nginx -d ${DOMAIN} -d ${WWW_DOMAIN} --email ${EMAIL} --agree-tos --non-interactive --redirect${NC}"
        echo ""
        exit 0
    fi
fi

# ============================================================
# PHASE 7: OBTAIN SSL CERTIFICATE
# ============================================================
echo -e "${GREEN}[7/7] Obtaining SSL certificate from Let's Encrypt...${NC}"
echo ""

certbot --nginx \
    -d ${DOMAIN} \
    -d ${WWW_DOMAIN} \
    --email ${EMAIL} \
    --agree-tos \
    --non-interactive \
    --redirect

if [ $? -eq 0 ]; then
    echo ""
    echo -e "  ${GREEN}SSL certificate installed successfully!${NC}"

    # ─── Enable auto-renewal ────────────────────────────────
    echo ""
    echo "  Setting up automatic certificate renewal..."

    # Enable certbot renewal timer
    systemctl enable certbot-renew.timer 2>/dev/null || true
    systemctl start certbot-renew.timer 2>/dev/null || true

    # Also add a cron job as backup
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | sort -u | crontab -

    echo -e "  ${GREEN}Auto-renewal configured (checks twice daily).${NC}"

    # ─── Add security headers to SSL block ──────────────────
    # Certbot creates the SSL server block; add HSTS header
    if ! grep -q "Strict-Transport-Security" $NGINX_CONF; then
        sed -i '/ssl_dhparam/a\    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;' $NGINX_CONF 2>/dev/null || true
    fi

    # Reload with final config
    nginx -t && systemctl reload nginx

    echo ""
    echo -e "${GREEN}==========================================${NC}"
    echo -e "${GREEN}  DEPLOYMENT COMPLETE — SSL ACTIVE${NC}"
    echo -e "${GREEN}==========================================${NC}"
    echo ""
    echo "  Your site is now live at:"
    echo -e "    ${BLUE}https://voltzsupply.com${NC}"
    echo -e "    ${BLUE}https://www.voltzsupply.com${NC}"
    echo ""
    echo "  SSL Certificate:"
    echo "    Issuer:  Let's Encrypt"
    echo "    Renews:  Automatically (every 60-90 days)"
    echo ""
    echo "  Verify SSL grade:"
    echo "    https://www.ssllabs.com/ssltest/analyze.html?d=voltzsupply.com"
    echo ""
else
    echo ""
    echo -e "  ${RED}SSL certificate installation failed!${NC}"
    echo ""
    echo "  Common causes:"
    echo "    1. DNS not pointing to this server yet"
    echo "    2. Ports 80/443 blocked by security group"
    echo "    3. Rate limit reached (5 certs per domain per week)"
    echo ""
    echo "  Your site is still accessible via HTTP:"
    echo -e "    http://${SERVER_IP}"
    echo ""
    echo "  After fixing the issue, retry SSL with:"
    echo -e "    ${BLUE}sudo certbot --nginx -d ${DOMAIN} -d ${WWW_DOMAIN} --email ${EMAIL} --agree-tos --non-interactive --redirect${NC}"
    echo ""
fi
