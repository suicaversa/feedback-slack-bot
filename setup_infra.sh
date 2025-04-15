#!/bin/bash
set -e # エラーが発生したらスクリプトを停止

# --- 設定値 (環境変数から取得) ---
# GCPプロジェクトID
GCP_PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID environment variable is not set}"
# リージョン (環境変数から取得, 例: asia-northeast1)
REGION="${REGION:?REGION environment variable is not set}"
# Cloud Run Job用サービスアカウント名 (環境変数から取得)
JOB_SERVICE_ACCOUNT_NAME="${JOB_SERVICE_ACCOUNT_NAME:?JOB_SERVICE_ACCOUNT_NAME environment variable is not set}"
# Cloud Functions用サービスアカウントのメールアドレス (環境変数から取得)
FUNCTION_SERVICE_ACCOUNT_EMAIL="${FUNCTION_SERVICE_ACCOUNT_EMAIL:?FUNCTION_SERVICE_ACCOUNT_EMAIL environment variable is not set}"
# Artifact Registry リポジトリ名 (環境変数から取得, 例: docker-repo)
ARTIFACT_REPO_NAME="${ARTIFACT_REPO_NAME:?ARTIFACT_REPO_NAME environment variable is not set}"
# (オプション) Slack Bot Tokenを保存するSecret ManagerのシークレットID (環境変数から取得)
SLACK_BOT_TOKEN_SECRET_ID="${SLACK_BOT_TOKEN_SECRET_ID}"
# (オプション) Slack Signing Secretを保存するSecret ManagerのシークレットID (例: slack-signing-secret)
SLACK_SIGNING_SECRET_ID="${SLACK_SIGNING_SECRET_ID}"

# --- 実行 ---

echo "--- Creating Job Service Account: ${JOB_SERVICE_ACCOUNT_NAME} ---"
gcloud iam service-accounts create "${JOB_SERVICE_ACCOUNT_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --display-name="Service Account for Slack Bot Job" || echo "Job Service Account already exists or failed to create."

JOB_SERVICE_ACCOUNT_EMAIL="${JOB_SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

echo "--- Granting Roles to Job Service Account: ${JOB_SERVICE_ACCOUNT_EMAIL} ---"
# Vertex AI User Role
gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member="serviceAccount:${JOB_SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/aiplatform.user"
echo "Granted roles/aiplatform.user"

# Secret Manager Accessor Role (if secrets are used)
if [[ -n "${SLACK_BOT_TOKEN_SECRET_ID}" ]]; then
  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${JOB_SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/secretmanager.secretAccessor"
  echo "Granted roles/secretmanager.secretAccessor"
fi

echo "--- Granting Run Invoker Role to Function Service Account: ${FUNCTION_SERVICE_ACCOUNT_EMAIL} ---"
gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member="serviceAccount:${FUNCTION_SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/run.invoker"
echo "Granted roles/run.invoker"

echo "--- Creating Artifact Registry Repository: ${ARTIFACT_REPO_NAME} ---"
gcloud artifacts repositories create "${ARTIFACT_REPO_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --repository-format=docker \
  --location="${REGION}" \
  --description="Docker repository for Slack Bot" || echo "Artifact Registry repository already exists or failed to create."

# Secret Managerのシークレット作成 (値の設定は別途手動で行うことを推奨)
if [[ -n "${SLACK_BOT_TOKEN_SECRET_ID}" ]]; then
  echo "--- Creating Secret Manager Secret (if not exists): ${SLACK_BOT_TOKEN_SECRET_ID} ---"
  gcloud secrets create "${SLACK_BOT_TOKEN_SECRET_ID}" \
    --project="${GCP_PROJECT_ID}" \
    --replication-policy="automatic" || echo "Secret ${SLACK_BOT_TOKEN_SECRET_ID} already exists or failed to create."
  echo "IMPORTANT: Please add the Slack Bot Token value to the secret ${SLACK_BOT_TOKEN_SECRET_ID} manually via GCP Console or gcloud CLI."
fi
if [[ -n "${SLACK_SIGNING_SECRET_ID}" ]]; then
  echo "--- Creating Secret Manager Secret (if not exists): ${SLACK_SIGNING_SECRET_ID} ---"
  gcloud secrets create "${SLACK_SIGNING_SECRET_ID}" \
    --project="${GCP_PROJECT_ID}" \
    --replication-policy="automatic" || echo "Secret ${SLACK_SIGNING_SECRET_ID} already exists or failed to create."
  echo "IMPORTANT: Please add the Slack Signing Secret value to the secret ${SLACK_SIGNING_SECRET_ID} manually via GCP Console or gcloud CLI."
fi

echo "--- Initial infrastructure setup script completed. ---"
