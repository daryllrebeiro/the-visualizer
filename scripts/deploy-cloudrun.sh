#!/usr/bin/env bash
# =============================================================================
# TheVisualizer: One-Command Google Cloud Run Deployment (Bash)
# Modeled after support-master/scripts/deploy-cloudrun.sh
# =============================================================================

set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-${1:-}}"
REGION="${GOOGLE_CLOUD_REGION:-${2:-us-central1}}"
SERVICE_NAME="the-visualizer"
REPO_NAME="the-visualizer"

echo "=========================================================="
echo " TheVisualizer: Cloud Run Single-Command Deployment (Bash)"
echo "=========================================================="

if [ -z "$PROJECT_ID" ]; then
    echo "No Project ID provided."
    read -rp "Enter your Google Cloud Project ID: " PROJECT_ID
fi

if [ -z "$PROJECT_ID" ]; then
    echo "Error: Google Cloud Project ID is required."
    exit 1
fi

echo "Project: $PROJECT_ID | Region: $REGION | Service: $SERVICE_NAME"

# 1. Verify gcloud
echo ""
echo "[1/5] Verifying gcloud authentication..."
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI not found. Install Google Cloud SDK."
    exit 1
fi

gcloud config set project "$PROJECT_ID" --quiet
ACCOUNT=$(gcloud config get-value account 2>/dev/null || true)
if [ -z "$ACCOUNT" ]; then
    echo "Error: No authenticated gcloud account. Run 'gcloud auth login' first."
    exit 1
fi
echo "    ✓ Authenticated as: $ACCOUNT"

# 2. Enable APIs
echo ""
echo "[2/5] Enabling required Google Cloud APIs..."
gcloud services enable run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com --quiet
echo "    ✓ APIs enabled: Cloud Run, Cloud Build, Artifact Registry"

# 3. Artifact Registry
echo ""
echo "[3/5] Configuring Artifact Registry repository..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" &>/dev/null; then
    echo "    Creating repository '$REPO_NAME' in $REGION..."
    gcloud artifacts repositories create "$REPO_NAME" \
        --repository-format=docker \
        --location="$REGION" \
        --description="Docker images for TheVisualizer Platform" \
        --quiet
fi
echo "    ✓ Artifact Registry ready: $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME"

# 4. Build & Push Image
echo ""
echo "[4/5] Building & pushing container image via Google Cloud Build..."
IMAGE_TAG="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/app:latest"

gcloud builds submit \
    --tag "$IMAGE_TAG" \
    --timeout="20m" \
    --quiet
echo "    ✓ Container image built and pushed: $IMAGE_TAG"

# 5. Deploy to Cloud Run
echo ""
echo "[5/5] Deploying service to Google Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_TAG" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 1Gi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --quiet

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format="value(status.url)")

echo ""
echo "=========================================================="
echo " 🎉 Deployment Successful!"
echo " TheVisualizer Live URL: $SERVICE_URL"
echo "=========================================================="
