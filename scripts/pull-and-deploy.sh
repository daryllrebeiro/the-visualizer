#!/usr/bin/env bash
# =============================================================================
# TheVisualizer: Pull Latest Code, Test & Deploy Pipeline (Bash)
# Modeled after support-master/scripts/pull-and-deploy.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================================="
echo " TheVisualizer: Pull, Test & Deploy Pipeline (Bash)"
echo "=========================================================="

# 1. Stash changes if any
if [ -n "$(git status --porcelain)" ]; then
    echo "[1/4] Stashing local changes..."
    git stash push -m "pull-and-deploy-auto-stash-$(date +%Y%m%d-%H%M%S)"
else
    echo "[1/4] Working tree clean, skipping stash."
fi

# 2. Pull latest
echo "[2/4] Pulling latest code from origin..."
git pull --rebase origin main

# 3. Test
echo "[3/4] Running simulation and unit test suites..."
cd "$REPO_ROOT"
pnpm test

# 4. Deploy
echo "[4/4] Executing Cloud Run deployment..."
bash "$SCRIPT_DIR/deploy-cloudrun.sh" "$@"
