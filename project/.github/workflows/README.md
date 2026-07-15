# GitHub Actions Workflows

## Workflows Overview

### 1. CI / Tests (`ci.yml`)
**Trigger:** Push to `main`/`develop`, Pull Requests

**Steps:**
1. Checkout code
2. Setup Node.js 22
3. Install dependencies
4. **Unzip project** (if ZIP exists)
5. Run linter
6. Run tests
7. Secret detection (TruffleHog)
8. Verify project structure

### 2. Unzip & Deploy (`unzip-and-deploy.yml`)
**Trigger:** Push to `main`

**Steps:**
1. Checkout code
2. Setup Node.js 22
3. Install dependencies
4. **Unzip project files**
5. Run linter
6. Run tests
7. Secret detection
8. Setup clasp
9. **Deploy to Apps Script**
10. Create deployment
11. Upload artifacts

## Required Secrets

Go to: `Settings → Secrets and variables → Actions`

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `CLASPRC` | Clasp credentials | Run `cat ~/.clasprc.json` locally |
| `SCRIPT_ID` | Apps Script ID | From `.clasp.json` or Apps Script URL |

## Manual Trigger

You can manually trigger workflows from:
`Actions → [Workflow Name] → Run workflow`

## ZIP File Handling

If your repository contains a ZIP file (e.g., `sales-order-system.zip`),
the workflow will automatically extract it before running tests and deployment.

### Creating a ZIP
```bash
zip -r sales-order-system.zip src/ appsscript.json .clasp.json
```

### Excluding from Git
Add to `.gitignore`:
```
*.zip
!sales-order-system.zip  # If you want to keep specific ZIP
```
