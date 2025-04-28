#!/bin/bash
set -e # エラーが発生したらスクリプトを停止

echo "--- Starting full application deployment ---"

# スクリプトが存在するディレクトリを取得
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

# --- 環境変数の読み込み (チェックで必要) ---
# .envrc が存在すれば読み込む (direnv がなくても動作するように)
if [[ -f "${SCRIPT_DIR}/.envrc" ]]; then
  echo "Loading environment variables from .envrc..."
  # export を削除し、eval で現在のシェルに設定
  eval "$(grep '^export ' "${SCRIPT_DIR}/.envrc" | sed 's/export //')"
else
    echo "Warning: .envrc not found. Assuming environment variables are set."
fi

# --- 必要な変数の存在確認 (deploy_job/function 内のチェックを一部ここでも行う) ---
: "${GCP_PROJECT_ID:?GCP_PROJECT_ID environment variable is not set}"
: "${REGION:?REGION environment variable is not set}"
: "${JOB_NAME:?JOB_NAME environment variable is not set}"
: "${FUNCTION_NAME:?FUNCTION_NAME environment variable is not set}"
: "${FUNCTION_SERVICE_ACCOUNT_EMAIL:?FUNCTION_SERVICE_ACCOUNT_EMAIL environment variable is not set}"
# 他の変数は個別のスクリプト内でチェックされる

echo ""
echo "--- Checking IAM permissions for deployment (using common SA: ${FUNCTION_SERVICE_ACCOUNT_EMAIL}) ---"
# JobとFunctionに必要なロールをまとめてチェック
bash "${SCRIPT_DIR}/check_permissions.sh" "${FUNCTION_SERVICE_ACCOUNT_EMAIL}" "roles/run.admin" "roles/cloudbuild.builds.editor"
echo ""

# --- デプロイ実行 ---

# Jobのデプロイを実行
echo ""
echo "--- Running Job Deployment Script ---"
bash "${SCRIPT_DIR}/deploy_job.sh"

# Functionのデプロイを実行
echo ""
echo "--- Running Function Deployment Script ---"
bash "${SCRIPT_DIR}/deploy_function.sh"

echo ""
echo "--- Full application deployment script completed. ---"
