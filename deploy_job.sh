#!/bin/bash
set -e # エラーが発生したらスクリプトを停止

# --- 設定値 (環境変数から取得) ---
# GCPプロジェクトID
GCP_PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID environment variable is not set}"
# リージョン (環境変数から取得, 例: asia-northeast1)
REGION="${REGION:?REGION environment variable is not set}"
# Cloud Run Job名 (環境変数から取得, 例: slack-bot-processor)
JOB_NAME="${JOB_NAME:?JOB_NAME environment variable is not set}"
# Cloud Run Job用サービスアカウント名 (Functionと共通化するため FUNCTION_SERVICE_ACCOUNT_EMAIL を使用)
FUNCTION_SERVICE_ACCOUNT_EMAIL="${FUNCTION_SERVICE_ACCOUNT_EMAIL:?FUNCTION_SERVICE_ACCOUNT_EMAIL environment variable is not set}" # Function SAのEmailを読み込む
# Artifact Registry リポジトリ名 (環境変数から取得, 例: docker-repo)
ARTIFACT_REPO_NAME="${ARTIFACT_REPO_NAME:?ARTIFACT_REPO_NAME environment variable is not set}"
# Cloud Run Job用Dockerイメージ名 (環境変数から取得, 例: slack-bot-job)
JOB_IMAGE_NAME="${JOB_IMAGE_NAME:?JOB_IMAGE_NAME environment variable is not set}"
# Jobに必要な環境変数 (config/config.js 参照)
SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN:?SLACK_BOT_TOKEN environment variable is not set}"
GCS_BUCKET_NAME="${GCS_BUCKET_NAME:?GCS_BUCKET_NAME environment variable is not set}"
GEMINI_API_KEY="${GEMINI_API_KEY:?GEMINI_API_KEY environment variable is not set}"
SLACK_SIGNING_SECRET="${SLACK_SIGNING_SECRET:?SLACK_SIGNING_SECRET environment variable is not set}" # Jobもconfigを読むので必要
DEEPGRAM_API_KEY="${DEEPGRAM_API_KEY:?DEEPGRAM_API_KEY environment variable is not set}"
# --- 実行 ---
JOB_IMAGE_URL="${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO_NAME}/${JOB_IMAGE_NAME}:latest"

echo "--- Building and Pushing Job Docker Image: ${JOB_IMAGE_URL} ---"
# Use cloudbuild.yaml to specify the Dockerfile location
# Note: Cloud Build uses the job/ directory context specified in cloudbuild.yaml
gcloud builds submit --config=cloudbuild.yaml --substitutions=_TAG="${JOB_IMAGE_URL}" --project="${GCP_PROJECT_ID}" .

echo "--- Deploying Cloud Run Job: ${JOB_NAME} ---"
# 環境変数の設定を組み立てる (job/index.js が必要とする変数を .envrc から渡す)
JOB_ENV_VARS="GCP_PROJECT_ID=${GCP_PROJECT_ID},SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN},GCS_BUCKET_NAME=${GCS_BUCKET_NAME},GEMINI_API_KEY=${GEMINI_API_KEY},SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET},DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY}"

# gcloud run jobs deploy を使う (存在しない場合は作成、存在する場合は更新)
gcloud run jobs deploy "${JOB_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${REGION}" \
  --image="${JOB_IMAGE_URL}" \
  --service-account="${FUNCTION_SERVICE_ACCOUNT_EMAIL}" \
  --update-env-vars="${JOB_ENV_VARS}" \
  --memory=4Gi \
  --task-timeout=1800s \
  --tasks=1 \
  --max-retries=0

echo "--- Cloud Run Job deployment script completed. ---"
