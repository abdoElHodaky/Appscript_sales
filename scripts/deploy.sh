#!/bin/bash
# Deployment script for Sales Order Management System
# سكربت النشر لنظام إدارة المبيعات

set -e

ENVIRONMENT=${1:-development}
SCRIPT_ID=$(jq -r '.scriptId' .clasp.json)

echo "═══════════════════════════════════════════════════"
echo "  Sales Order Management System - Deployment"
echo "  Environment: $ENVIRONMENT"
echo "  Script ID: $SCRIPT_ID"
echo "═══════════════════════════════════════════════════"

# Validate environment
if [ "$ENVIRONMENT" != "development" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo "❌ Error: Invalid environment. Use 'development' or 'production'"
    exit 1
fi

# Run tests
echo "🧪 Running tests..."
npm test

# Lint code
echo "🔍 Linting code..."
npm run lint

# Check for secrets
echo "🔐 Checking for secrets..."
if grep -r "token\|password\|secret\|api_key" src/ --include="*.gs" --include="*.js" | grep -v "PropertiesService"; then
    echo "⚠️  Warning: Potential secrets found in code!"
    echo "   Use PropertiesService for secrets."
    exit 1
fi

# Push to Apps Script
echo "🚀 Pushing to Apps Script..."
clasp push

# Create version
echo "📦 Creating version..."
VERSION=$(clasp create-version "Deploy to $ENVIRONMENT")
echo "   Version: $VERSION"

# Deploy
echo "🌐 Deploying..."
if [ "$ENVIRONMENT" == "production" ]; then
    clasp deploy -d "Production v$(date +%Y%m%d)"
else
    clasp deploy -d "Development v$(date +%Y%m%d)"
fi

echo "═══════════════════════════════════════════════════"
echo "  ✅ Deployment complete!"
echo "═══════════════════════════════════════════════════"
