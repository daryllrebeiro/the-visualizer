# =============================================================================
# TheVisualizer: Pull Latest Code, Test & Deploy Pipeline (PowerShell)
# Modeled after support-master/scripts/pull-and-deploy.ps1
# =============================================================================

param(
    [Parameter(Mandatory = $false)][string]$ProjectId = $env:GOOGLE_CLOUD_PROJECT,
    [string]$Region = $(if ($env:GOOGLE_CLOUD_REGION) { $env:GOOGLE_CLOUD_REGION } else { "us-central1" })
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " TheVisualizer: Pull, Test & Deploy Pipeline" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

# 1. Stash any uncommitted changes
$status = git status --porcelain
$hasChanges = [bool]($status -and $status.Trim().Length -gt 0)

if ($hasChanges) {
    Write-Host "`n[1/4] Stashing local changes..." -ForegroundColor Yellow
    git stash push -m "pull-and-deploy-auto-stash-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
} else {
    Write-Host "`n[1/4] Working tree clean, skipping stash." -ForegroundColor Gray
}

# 2. Pull latest main branch
Write-Host "`n[2/4] Pulling latest code from origin..." -ForegroundColor Yellow
git pull --rebase origin main

# 3. Run workspace tests
Write-Host "`n[3/4] Running simulation and unit test suites..." -ForegroundColor Yellow
Set-Location $repoRoot
pnpm test

# 4. Trigger Deployment
Write-Host "`n[4/4] Executing Cloud Run deployment..." -ForegroundColor Yellow
$deployScript = Join-Path $scriptDir "deploy-cloudrun.ps1"

if ($ProjectId) {
    & $deployScript -ProjectId $ProjectId -Region $Region
} else {
    & $deployScript -Region $Region
}
