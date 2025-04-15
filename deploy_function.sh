#!/bin/bash
set -e # エラーが発生したらスクリプトを停止

# --- 設定値 (環境変数から取得) ---
# GCPプロジェクトID
GCP_PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID environment variable is not set}"
# リージョン (環境変数から取得, 例: asia-northeast1)
REGION="${REGION:?REGION environment variable is not set}"
# Cloud Functions名 (環境変数から取得, 例: slack-bot-handler)
FUNCTION_NAME="${FUNCTION_NAME:?FUNCTION_NAME environment variable is not set}"
# Cloud Functions用サービスアカウントのメールアドレス (環境変数から取得)
FUNCTION_SERVICE_ACCOUNT_EMAIL="${FUNCTION_SERVICE_ACCOUNT_EMAIL:?FUNCTION_SERVICE_ACCOUNT_EMAIL environment variable is not set}"
# Cloud Run Job名 (FunctionがJobを起動するために必要)
JOB_NAME="${JOB_NAME:?JOB_NAME environment variable is not set}"
# Functionに必要な環境変数 (config/config.js 参照)
SLACK_BOT_TOKEN="${SLACK_BOT_TOKEN:?SLACK_BOT_TOKEN environment variable is not set}"
SLACK_SIGNING_SECRET="${SLACK_SIGNING_SECRET:?SLACK_SIGNING_SECRET environment variable is not set}"
GCS_BUCKET_NAME="${GCS_BUCKET_NAME:?GCS_BUCKET_NAME environment variable is not set}"
GEMINI_API_KEY="${GEMINI_API_KEY:?GEMINI_API_KEY environment variable is not set}"

# --- 実行 ---

echo "--- Deploying Cloud Function: ${FUNCTION_NAME} ---"
# 環境変数の設定を組み立てる
# config/config.js で必須とされている環境変数をすべて含める
# CLOUD_RUN_JOB_NAME と CLOUD_RUN_JOB_REGION も Function が Job を起動するために必要
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

echo "--- Cloud Function deployment script completed. ---"
