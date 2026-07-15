#!/bin/bash
# Local unzip script for Sales Order Management System

set -e

ZIP_FILE=${1:-"sales-order-system.zip"}

if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ Error: $ZIP_FILE not found"
    echo "Usage: bash scripts/unzip.sh [zip-file]"
    exit 1
fi

echo "📦 Unzipping $ZIP_FILE..."
unzip -o "$ZIP_FILE" -d ./extracted/

echo "✅ Unzipped successfully!"
echo ""
echo "Extracted files:"
ls -la ./extracted/
