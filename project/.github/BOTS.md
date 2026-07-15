# 🤖 GitHub Bots

## Available Bots

### 1. Unzip Bot (`bot-unzip-push.yml`)
**Trigger:** Push with ZIP file

**What it does:**
1. Detects ZIP files in the repository
2. Extracts contents to repository root
3. Removes the ZIP file
4. Commits extracted files with bot signature
5. Pushes back to the same branch

**Features:**
- ✅ Automatic ZIP detection
- ✅ Smart folder handling (flattens single-root archives)
- ✅ Creates PR for non-main branches
- ✅ Workflow summary in Actions tab

**Usage:**
```bash
# Push a ZIP file
git add project.zip
git commit -m "Add project ZIP"
git push origin main

# Bot automatically extracts and pushes files!
```

### 2. PR Review Bot (`bot-pr-review.yml`)
**Trigger:** PR with ZIP files

**What it does:**
1. Detects ZIP files in PR
2. Analyzes ZIP contents (size, file count)
3. Comments on PR with recommendations

**Comment includes:**
- ZIP file name and size
- Warning about automatic extraction
- Recommendation to extract before merge

### 3. Deploy Bot (`unzip-and-deploy.yml`)
**Trigger:** Push to `main`

**What it does:**
1. Unzips if ZIP exists
2. Runs tests
3. Deploys to Google Apps Script
4. Creates new deployment version

## Bot Configuration

Edit `.github/bot-config.yml`:
```yaml
bot:
  name: "your-bot-name"

unzip:
  remove_zip: true      # Remove ZIP after extraction
  create_pr: true       # Create PR for non-main branches
```

## Required Secrets

| Secret | Purpose |
|--------|---------|
| `GITHUB_TOKEN` | Auto-provided, for pushing commits |
| `CLASPRC` | For Apps Script deployment |

## Bot Signature

All bot commits use:
```
Author: github-actions[bot] <github-actions[bot]@users.noreply.github.com>
Message: 🤖 Bot: Unzip [filename]
```
