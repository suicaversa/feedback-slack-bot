#!/bin/bash

# Cloud Functions デプロイスクリプト (第2世代)

# --- 設定項目 (環境に合わせて編集してください) ---
FUNCTION_NAME="slack-feedback-bot" # デプロイする関数名
REGION="asia-northeast1"          # デプロイするリージョン
RUNTIME="nodejs20"                # 使用するNode.jsランタイム
ENTRY_POINT="slackBotFunction"    # index.jsでエクスポートした関数名
SERVICE_ACCOUNT="your-service-account-email@your-project-id.iam.gserviceaccount.com" # 実行サービスアカウント
# --- 設定項目ここまで ---

# --- 環境変数のチェック ---
required_vars=("SLACK_BOT_TOKEN" "SLACK_SIGNING_SECRET" "GCP_PROJECT_ID" "GCS_BUCKET_NAME" "GEMINI_API_KEY")
missing_vars=()

for var_name in "${required_vars[@]}"; do
  if [ -z "${!var_name}" ]; then
    missing_vars+=("$var_name")
  fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
  echo "エラー: 以下の環境変数が設定されていません:" >&2
  for missing_var in "${missing_vars[@]}"; do
    echo " - $missing_var" >&2
  done
  echo "スクリプトを実行する前に、これらの環境変数を設定してください。" >&2
  echo "例: export SLACK_BOT_TOKEN=your_token" >&2
  exit 1
fi
# --- 環境変数チェックここまで ---

echo "デプロイを開始します..."
echo "関数名: $FUNCTION_NAME"
echo "リージョン: $REGION"
echo "ランタイム: $RUNTIME"
echo "エントリーポイント: $ENTRY_POINT"
echo "サービスアカウント: $SERVICE_ACCOUNT"

gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 \
  --region="$REGION" \
  --runtime="$RUNTIME" \
  --entry-point="$ENTRY_POINT" \
  --source=. \
  --trigger-http \
  --allow-unauthenticated \
  --service-account="$SERVICE_ACCOUNT" \
  --set-env-vars="SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN,SLACK_SIGNING_SECRET=$SLACK_SIGNING_SECRET,GCP_PROJECT_ID=$GCP_PROJECT_ID,GCS_BUCKET_NAME=$GCS_BUCKET_NAME,GEMINI_API_KEY=$GEMINI_API_KEY,LOG_LEVEL=${LOG_LEVEL:-info}"

if [ $? -eq 0 ]; then
  echo "デプロイが成功しました。"
  echo "デプロイされた関数のURLを確認し、Slack AppのRequest URLに設定してください。"
else
  echo "デプロイに失敗しました。" >&2
  exit 1
fi

exit 0
