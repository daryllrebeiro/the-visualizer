# =============================================================================
# TheVisualizer: One-Command Google Cloud Run Deployment (PowerShell)
# Modeled after support-master/scripts/deploy-cloudrun.ps1
# =============================================================================

param(
    [Parameter(Mandatory = $false)][string]$ProjectId = $env:GOOGLE_CLOUD_PROJECT,
    [string]$Region = $(if ($env:GOOGLE_CLOUD_REGION) { $env:GOOGLE_CLOUD_REGION } else { "us-central1" }),
    [string]$ServiceName = "the-visualizer",
    [string]$RepoName = "the-visualizer"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " TheVisualizer: Cloud Run Single-Command Deployment" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 0. Validate GCP Project ID
if (-not $ProjectId) {
    Write-Host ""
    $ProjectId = Read-Host "Enter your Google Cloud Project ID"
}

if (-not $ProjectId) {
    Write-Error "Google Cloud Project ID is required."
    exit 1
}

Write-Host "Project: $ProjectId | Region: $Region | Service: $ServiceName" -ForegroundColor White

# 1. Verify gcloud CLI & Active Auth
Write-Host ""
Write-Host "[1/5] Verifying gcloud authentication..." -ForegroundColor Yellow
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Error "gcloud CLI not found. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
    exit 1
}

& gcloud config set project $ProjectId --quiet
$account = & gcloud config get-value account 2>$null
if (-not $account) {
    Write-Error "No authenticated gcloud account found. Run 'gcloud auth login' first."
    exit 1
}
Write-Host "    [OK] Authenticated as: $account" -ForegroundColor Green

# 2. Enable Required GCP APIs
Write-Host ""
Write-Host "[2/5] Enabling required Google Cloud APIs..." -ForegroundColor Yellow
& gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --quiet
Write-Host "    [OK] APIs enabled: Cloud Run, Cloud Build, Artifact Registry" -ForegroundColor Green

# 3. Create Artifact Registry Repository (if not exists)
Write-Host ""
Write-Host "[3/5] Configuring Artifact Registry repository..." -ForegroundColor Yellow

$existingRepos = & gcloud artifacts repositories list --location=$Region --format="value(name)" 2>$null
$repoFullName = "projects/$ProjectId/locations/$Region/repositories/$RepoName"
$found = $false
foreach ($r in $existingRepos) {
    if ($r -match $RepoName) {
        $found = $true
        break
    }
}

if (-not $found) {
    Write-Host "    Creating repository '$RepoName' in $Region..." -ForegroundColor Gray
    & gcloud artifacts repositories create $RepoName --repository-format=docker --location=$Region --description="Docker images for TheVisualizer Platform" --quiet
}
Write-Host "    [OK] Artifact Registry ready: $Region-docker.pkg.dev/$ProjectId/$RepoName" -ForegroundColor Green

# 4. Build & Push Container Image via Cloud Build
Write-Host ""
Write-Host "[4/5] Building and pushing container image via Google Cloud Build..." -ForegroundColor Yellow
$imageTag = "$Region-docker.pkg.dev/$ProjectId/$RepoName/app:latest"

& gcloud builds submit --tag $imageTag --timeout="20m" --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Error "Cloud Build failed."
    exit 1
}
Write-Host "    [OK] Container image built and pushed: $imageTag" -ForegroundColor Green

# 5. Deploy to Google Cloud Run
Write-Host ""
Write-Host "[5/5] Deploying service to Google Cloud Run..." -ForegroundColor Yellow
& gcloud run deploy $ServiceName --image $imageTag --region $Region --platform managed --allow-unauthenticated --port 8080 --memory 1Gi --cpu 1 --min-instances 0 --max-instances 10 --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Error "Cloud Run deployment failed."
    exit 1
}

$serviceUrl = & gcloud run services describe $ServiceName --platform managed --region $Region --format="value(status.url)"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " [SUCCESS] Deployment Completed!" -ForegroundColor Green
Write-Host " Live URL: $serviceUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
