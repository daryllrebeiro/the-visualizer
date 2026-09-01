# =============================================================================
# TheVisualizer: One-Command Google Cloud Run Deployment (PowerShell)
# Modeled after support-master/scripts/deploy-cloudrun.ps1
#
# Prerequisites:
#   1. gcloud CLI installed and authenticated (gcloud auth login)
#   2. A GCP project with billing enabled
#
# Usage:
#   .\scripts\deploy-cloudrun.ps1 -ProjectId "my-gcp-project" -Region "us-central1"
# =============================================================================

param(
    [Parameter(Mandatory = $false)][string]$ProjectId = $env:GOOGLE_CLOUD_PROJECT,
    [string]$Region = $(if ($env:GOOGLE_CLOUD_REGION) { $env:GOOGLE_CLOUD_REGION } else { "us-central1" }),
    [string]$ServiceName = "the-visualizer",
    [string]$RepoName = "the-visualizer"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " TheVisualizer: Cloud Run Single-Command Deployment" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 0. Validate GCP Project ID
if (-not $ProjectId) {
    Write-Host "`nNo Project ID provided." -ForegroundColor Yellow
    $ProjectId = Read-Host "Enter your Google Cloud Project ID"
}

if (-not $ProjectId) {
    throw "Google Cloud Project ID is required. Pass -ProjectId 'my-project' or set `$env:GOOGLE_CLOUD_PROJECT."
}

Write-Host "Project: $ProjectId | Region: $Region | Service: $ServiceName" -ForegroundColor White

# 1. Verify gcloud CLI & Active Auth
Write-Host "`n[1/5] Verifying gcloud authentication..." -ForegroundColor Yellow
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    throw "gcloud CLI not found. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
}
gcloud config set project $ProjectId | Out-Null
$account = gcloud config get-value account 2>$null
if (-not $account) {
    throw "No authenticated gcloud account found. Run 'gcloud auth login' first."
}
Write-Host "    ✓ Authenticated as: $account" -ForegroundColor Green

# 2. Enable Required GCP APIs
Write-Host "`n[2/5] Enabling required Google Cloud APIs..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com `
    cloudbuild.googleapis.com `
    artifactregistry.googleapis.com --quiet
Write-Host "    ✓ APIs enabled: Cloud Run, Cloud Build, Artifact Registry" -ForegroundColor Green

# 3. Create Artifact Registry Repository (if not exists)
Write-Host "`n[3/5] Configuring Artifact Registry repository..." -ForegroundColor Yellow
$repoExists = gcloud artifacts repositories describe $RepoName --location=$Region 2>$null
if (-not $repoExists) {
    Write-Host "    Creating repository '$RepoName' in $Region..." -ForegroundColor Gray
    gcloud artifacts repositories create $RepoName `
        --repository-format=docker `
        --location=$Region `
        --description="Docker images for TheVisualizer Platform" `
        --quiet
}
Write-Host "    ✓ Artifact Registry ready: $Region-docker.pkg.dev/$ProjectId/$RepoName" -ForegroundColor Green

# 4. Build & Push Container Image via Cloud Build
Write-Host "`n[4/5] Building & pushing container image via Google Cloud Build..." -ForegroundColor Yellow
$imageTag = "$Region-docker.pkg.dev/$ProjectId/$RepoName/app:latest"

gcloud builds submit `
    --tag $imageTag `
    --timeout="20m" `
    --quiet
Write-Host "    ✓ Container image built and pushed: $imageTag" -ForegroundColor Green

# 5. Deploy to Google Cloud Run
Write-Host "`n[5/5] Deploying service to Google Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image $imageTag `
    --region $Region `
    --platform managed `
    --allow-unauthenticated `
    --port 8080 `
    --memory 1Gi `
    --cpu 1 `
    --min-instances 0 `
    --max-instances 10 `
    --quiet

$serviceUrl = gcloud run services describe $ServiceName --platform managed --region $Region --format="value(status.url)"

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " 🎉 Deployment Successful!" -ForegroundColor Green
Write-Host " TheVisualizer Live URL: $serviceUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
