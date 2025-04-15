#!/bin/bash
set -e

# --- 引数チェック ---
if [[ $# -lt 2 ]]; then
  echo "使用法: $0 <service_account_email> <required_project_role_1> [required_project_role_2 ...]" >&2
  exit 1
fi

TARGET_SERVICE_ACCOUNT_EMAIL=$1
shift # 最初の引数（SAメール）を削除
REQUIRED_PROJECT_ROLES=("$@") # 残りの引数をプロジェクトロール配列として取得
REQUIRED_SA_ROLE="roles/iam.serviceAccountUser" # サービスアカウントに対する必須ロール

# --- 実行 ---
echo "--- Checking IAM permissions ---"
DEPLOYER_ACCOUNT=$(gcloud config get-value account 2>/dev/null)
GCP_PROJECT_ID=$(gcloud config get-value project 2>/dev/null) # プロジェクトIDも取得

if [[ -z "${DEPLOYER_ACCOUNT}" || -z "${GCP_PROJECT_ID}" ]]; then
  echo "エラー: gcloud にログインしているアカウントまたはプロジェクトを取得できませんでした。" >&2
  echo "gcloud auth login および gcloud config set project <PROJECT_ID> を実行してください。" >&2
  exit 1
fi
echo "Deployer account: ${DEPLOYER_ACCOUNT}"
echo "Target Service Account: ${TARGET_SERVICE_ACCOUNT_EMAIL}"
echo "Project ID: ${GCP_PROJECT_ID}"

# プロジェクトレベルのロールを確認
echo "Checking project-level roles for ${DEPLOYER_ACCOUNT}..."
PROJECT_ROLES=$(gcloud projects get-iam-policy "${GCP_PROJECT_ID}" \
  --flatten="bindings[].members" \
  --format='value(bindings.role)' \
  --filter="bindings.members:${DEPLOYER_ACCOUNT}" 2>/dev/null || echo "") # エラー時も継続

MISSING_ROLES=()
for role in "${REQUIRED_PROJECT_ROLES[@]}"; do
  if ! echo "${PROJECT_ROLES}" | grep -q -w "${role}"; then
    MISSING_ROLES+=("${role} (Project Level)")
  fi
done

# iam.serviceAccountUser ロールを確認 (対象 SA に対して)
echo "Checking ${REQUIRED_SA_ROLE} role for ${DEPLOYER_ACCOUNT} on ${TARGET_SERVICE_ACCOUNT_EMAIL}..."
TARGET_SA_USER_ROLE=$(gcloud iam service-accounts get-iam-policy "${TARGET_SERVICE_ACCOUNT_EMAIL}" \
  --flatten="bindings[].members" \
  --format='value(bindings.role)' \
  --filter="bindings.members:${DEPLOYER_ACCOUNT}" 2>/dev/null || echo "") # エラー時も継続

if ! echo "${TARGET_SA_USER_ROLE}" | grep -q -w "${REQUIRED_SA_ROLE}"; then
  MISSING_ROLES+=("${REQUIRED_SA_ROLE} (on ${TARGET_SERVICE_ACCOUNT_EMAIL})")
fi

if [[ ${#MISSING_ROLES[@]} -ne 0 ]]; then
  echo "エラー: デプロイに必要な IAM ロールが不足しています (${DEPLOYER_ACCOUNT}):" >&2
  for role in "${MISSING_ROLES[@]}"; do
    echo "- ${role}" >&2
  done
  # 権限付与コマンドの例を表示
  echo "" >&2
  echo "以下のコマンドなどで権限を付与してください:" >&2
   for role in "${MISSING_ROLES[@]}"; do
     if [[ $role == *"Project Level"* ]]; then
       proj_role=$(echo $role | awk '{print $1}')
       echo "  gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} --member='${DEPLOYER_ACCOUNT}' --role='${proj_role}'" >&2
     elif [[ $role == *"on ${TARGET_SERVICE_ACCOUNT_EMAIL}"* ]]; then
       sa_role=$(echo $role | awk '{print $1}')
       echo "  gcloud iam service-accounts add-iam-policy-binding ${TARGET_SERVICE_ACCOUNT_EMAIL} --member='${DEPLOYER_ACCOUNT}' --role='${sa_role}'" >&2
     fi
  done
  exit 1 # エラー終了
else
  echo "必要な IAM ロールは付与されています。"
fi
echo "------------------------------"

# 成功時は終了コード 0 で抜ける
exit 0
