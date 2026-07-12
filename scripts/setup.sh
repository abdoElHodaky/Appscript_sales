#!/bin/bash
# Setup script for Sales Order Management System
# سكربت الإعداد لنظام إدارة المبيعات

set -e

echo "═══════════════════════════════════════════════════"
echo "  Sales Order Management System - Setup"
echo "═══════════════════════════════════════════════════"

# Check prerequisites
echo "📋 Checking prerequisites..."

# Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js >= 22"
    exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo "❌ Node.js version must be >= 22. Current: $(node -v)"
    exit 1
fi
echo "   ✅ Node.js $(node -v)"

# clasp
if ! command -v clasp &> /dev/null; then
    echo "📦 Installing clasp..."
    npm install -g @google/clasp
fi
echo "   ✅ clasp installed"

# Login
echo "🔐 Checking clasp login..."
if ! clasp show-authorized-user &> /dev/null; then
    echo "   Please login:"
    clasp login
fi
echo "   ✅ clasp logged in"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create .env if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
# Google Apps Script Settings
SCRIPT_ID=your_script_id_here
GCP_PROJECT_ID=your_gcp_project_id_here

# Admin emails (comma-separated)
ADMIN_EMAILS=admin@company.com

# WhatsApp API (optional)
ULTRAMSG_TOKEN=your_token_here
EOF
    echo "   ⚠️  Please update .env with your values"
fi

# Create src directories
echo "📁 Creating directories..."
mkdir -p src/{triggers,services,utils,web}
mkdir -p tests/{unit,integration}
mkdir -p docs/{ar,en}
mkdir -p assets/{diagrams,screenshots}

echo "═══════════════════════════════════════════════════"
echo "  ✅ Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Update .env with your values"
echo "  2. Run: clasp create-script --title 'Sales Order System'"
echo "  3. Copy scriptId to .clasp.json"
echo "  4. Run: npm run push"
echo "═══════════════════════════════════════════════════"
