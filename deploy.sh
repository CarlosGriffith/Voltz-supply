#!/bin/bash

# ============================================================
# Voltz Industrial Supply — S3 + CloudFront Deployment Script
# Domain: voltzsupply.com
# ============================================================
#
# PREREQUISITES:
#   1. AWS CLI installed:  https://aws.amazon.com/cli/
#   2. AWS CLI configured: aws configure
#   3. Node.js & npm installed
#
# USAGE:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# ============================================================

set -e  # Exit on any error

# ─── CONFIGURATION (UPDATE THESE) ───────────────────────────
S3_BUCKET="voltzsupply-website"           # Your S3 bucket name
CLOUDFRONT_DISTRIBUTION_ID=""             # Your CloudFront distribution ID (e.g., E1A2B3C4D5E6F7)
AWS_REGION="us-east-1"                    # Your AWS region
AWS_PROFILE="default"                     # Your AWS CLI profile name
# ─────────────────────────────────────────────────────────────

echo ""
echo "=========================================="
echo "  Voltz Supply — Production Deployment"
echo "  Domain: voltzsupply.com"
echo "=========================================="
echo ""

# ─── Step 1: Install dependencies ───────────────────────────
echo "[1/5] Installing dependencies..."
npm ci --silent
echo "      Done."

# ─── Step 2: Build for production ────────────────────────────
echo "[2/5] Building production bundle..."
npm run build
echo "      Done. Output: ./dist/"

# ─── Step 3: Upload to S3 ───────────────────────────────────
echo "[3/5] Uploading to S3 bucket: s3://$S3_BUCKET ..."

# Upload HTML files with no-cache headers (so CloudFront always checks for updates)
aws s3 cp dist/ s3://$S3_BUCKET/ \
  --recursive \
  --exclude "*" \
  --include "*.html" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html" \
  --region $AWS_REGION \
  --profile $AWS_PROFILE

# Upload JS files with long cache (hashed filenames = cache-safe)
aws s3 cp dist/ s3://$S3_BUCKET/ \
  --recursive \
  --exclude "*" \
  --include "assets/*.js" \
  --cache-control "public, max-age=31536000, immutable" \
  --content-type "application/javascript" \
  --region $AWS_REGION \
  --profile $AWS_PROFILE

# Upload CSS files with long cache
aws s3 cp dist/ s3://$S3_BUCKET/ \
  --recursive \
  --exclude "*" \
  --include "assets/*.css" \
  --cache-control "public, max-age=31536000, immutable" \
  --content-type "text/css" \
  --region $AWS_REGION \
  --profile $AWS_PROFILE

# Upload images/fonts/other assets with long cache
aws s3 cp dist/ s3://$S3_BUCKET/ \
  --recursive \
  --exclude "*.html" \
  --exclude "assets/*.js" \
  --exclude "assets/*.css" \
  --cache-control "public, max-age=86400" \
  --region $AWS_REGION \
  --profile $AWS_PROFILE

echo "      Done."

# ─── Step 4: Invalidate CloudFront cache ────────────────────
if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
  echo "[4/5] Invalidating CloudFront cache..."
  aws cloudfront create-invalidation \
    --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
    --paths "/*" \
    --region $AWS_REGION \
    --profile $AWS_PROFILE
  echo "      Done. Cache invalidation in progress (2-5 min)."
else
  echo "[4/5] Skipping CloudFront invalidation (no distribution ID set)."
  echo "      Set CLOUDFRONT_DISTRIBUTION_ID in this script after creating your distribution."
fi

# ─── Step 5: Summary ────────────────────────────────────────
echo "[5/5] Deployment complete!"
echo ""
echo "=========================================="
echo "  DEPLOYMENT SUMMARY"
echo "=========================================="
echo "  S3 Bucket:    s3://$S3_BUCKET"
echo "  Region:       $AWS_REGION"
echo "  CloudFront:   ${CLOUDFRONT_DISTRIBUTION_ID:-'Not configured'}"
echo ""
echo "  Your site will be live at:"
echo "    https://www.voltzsupply.com"
echo "    https://voltzsupply.com"
echo ""
echo "  If this is your first deploy, remember to:"
echo "    1. Set up CloudFront distribution"
echo "    2. Configure SSL certificate in ACM (us-east-1)"
echo "    3. Point DNS (Route 53 or Namecheap) to CloudFront"
echo "    4. Add the CloudFront distribution ID to this script"
echo "=========================================="
echo ""
