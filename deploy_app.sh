#!/bin/bash
set -e # エラーが発生したらスクリプトを停止

# --- 設定値 (環境変数から取得) ---
# GCPプロジェクトID
GCP_PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID environment variable is not set}"
# リージョン (環境変数から取得, 例: asia-northeast1)
REGION="${REGION:?REGION environment variable is not set}"
# Cloud Run Job名 (環境変数から取得, 例: slack-bot-processor)
JOB_NAME="${JOB_NAME:?JOB_NAME environment variable is not set}"
# Cloud Functions名 (環境変数から取得, 例: slack-bot-handler)
FUNCTION_NAME="${FUNCTION_NAME:?FUNCTION_NAME environment variable is not set}"
# Cloud Run Job用サービスアカウント名 (環境変数から取得)
JOB_SERVICE_ACCOUNT_NAME="${JOB_SERVICE_ACCOUNT_NAME:?JOB_SERVICE_ACCOUNT_NAME environment variable is not set}"
# Cloud Functions用サービスアカウントのメールアドレス (環境変数から取得)
FUNCTION_SERVICE_ACCOUNT_EMAIL="${FUNCTION_SERVICE_ACCOUNT_EMAIL:?FUNCTION_SERVICE_ACCOUNT_EMAIL environment variable is not set}"
# Artifact Registry リポジトリ名 (環境変数から取得, 例: docker-repo)
ARTIFACT_REPO_NAME="${ARTIFACT_REPO_NAME:?ARTIFACT_REPO_NAME environment variable is not set}"
# Cloud Run Job用Dockerイメージ名 (環境変数から取得, 例: slack-bot-job)
JOB_IMAGE_NAME="${JOB_IMAGE_NAME:?JOB_IMAGE_NAME environment variable is not set}"
# (オプション) Slack Bot Tokenを保存するSecret ManagerのシークレットID (環境変数から取得)
SLACK_BOT_TOKEN_SECRET_ID="${SLACK_BOT_TOKEN_SECRET_ID}"
# (オプション) Slack Signing Secretを保存するSecret ManagerのシークレットID (例: slack-signing-secret)
SLACK_SIGNING_SECRET_ID="${SLACK_SIGNING_SECRET_ID}"

# --- 実行 ---

JOB_SERVICE_ACCOUNT_EMAIL="${JOB_SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
JOB_IMAGE_URL="${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPO_NAME}/${JOB_IMAGE_NAME}:latest"

echo "--- Building and Pushing Job Docker Image: ${JOB_IMAGE_URL} ---"
# Use cloudbuild.yaml to specify the Dockerfile location
gcloud builds submit --config=cloudbuild.yaml --substitutions=_TAG="${JOB_IMAGE_URL}" --project="${GCP_PROJECT_ID}" .

echo "--- Deploying Cloud Run Job: ${JOB_NAME} ---"
# 環境変数の設定を組み立てる (job/index.js が必要とする変数を .envrc から渡す)
JOB_ENV_VARS="GCP_PROJECT_ID=${GCP_PROJECT_ID},SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN},GCS_BUCKET_NAME=${GCS_BUCKET_NAME},GEMINI_API_KEY=${GEMINI_API_KEY},SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET}"

# gcloud run jobs deploy を使う (存在しない場合は作成、存在する場合は更新)
gcloud run jobs deploy "${JOB_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${REGION}" \
  --image="${JOB_IMAGE_URL}" \
  --service-account="${JOB_SERVICE_ACCOUNT_EMAIL}" \
  --update-env-vars="${JOB_ENV_VARS}" \
  --task-timeout=1800s \
  --tasks=1 \
  --max-retries=1

echo "--- Deploying Cloud Function: ${FUNCTION_NAME} ---"
# 環境変数の設定を組み立てる
# SLACK_SIGNING_SECRET は Secret Manager から取得する想定だが、.envrc に直接書かれているため、
# ここでは環境変数として渡す。（本来は Secret Manager 経由が望ましい）
# config/config.js で必須とされている環境変数をすべて含める
FUNCTION_ENV_VARS="GCP_PROJECT_ID=${GCP_PROJECT_ID},CLOUD_RUN_JOB_NAME=${JOB_NAME},CLOUD_RUN_JOB_REGION=${REGION},SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN},SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET},GCS_BUCKET_NAME=${GCS_BUCKET_NAME},GEMINI_API_KEY=${GEMINI_API_KEY}"

gcloud functions deploy "${FUNCTION_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${REGION}" \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --entry-point=slackBotFunction \
  --source=. \
  --service-account="${FUNCTION_SERVICE_ACCOUNT_EMAIL}" \
  --update-env-vars="${FUNCTION_ENV_VARS}" \
  --allow-unauthenticated

echo "--- Application deployment script completed. ---"
