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
REQUIRED_SA_ROLE="roles/iam.serviceAccountUser" # デプロイ実行者が対象SAに対して持つべきロール

# サービスアカウント自体がプロジェクトレベルで持つべき実行時ロール (可変長引数で受け取ることも可能だが、今回は固定で定義)
REQUIRED_RUNTIME_ROLES=(
  "roles/aiplatform.user"
  "roles/logging.logWriter"
  "roles/run.invoker" # FunctionがHTTPトリガーされるため、または他のサービスから呼び出される場合
  "roles/run.jobsExecutorWithOverrides" # FunctionがJobを起動するため
  # "roles/storage.objectAdmin" # 必要に応じて追加
)

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
     # DEPLOYER_ACCOUNT がサービスアカウントかユーザーかを判定 (簡易的に @ を含むかで判定)
     if [[ "${DEPLOYER_ACCOUNT}" == *"@"* && "${DEPLOYER_ACCOUNT}" != *"gserviceaccount.com"* ]]; then
       MEMBER_STRING="user:${DEPLOYER_ACCOUNT}" # ユーザーアカウントの場合
     else
       MEMBER_STRING="serviceAccount:${DEPLOYER_ACCOUNT}" # サービスアカウントの場合 (または他の形式)
     fi

     if [[ $role == *"Project Level"* ]]; then
       proj_role=$(echo $role | awk '{print $1}')
       echo "  gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} --member='${MEMBER_STRING}' --role='${proj_role}'" >&2
     elif [[ $role == *"on ${TARGET_SERVICE_ACCOUNT_EMAIL}"* ]]; then
       sa_role=$(echo $role | awk '{print $1}')
       echo "  gcloud iam service-accounts add-iam-policy-binding ${TARGET_SERVICE_ACCOUNT_EMAIL} --member='${MEMBER_STRING}' --role='${sa_role}'" >&2
     fi
  done
  exit 1 # エラー終了
else
  echo "必要な IAM ロールは付与されています。"
fi

# --- サービスアカウント自体の実行時ロールチェック ---
echo ""
echo "Checking required runtime roles for Service Account ${TARGET_SERVICE_ACCOUNT_EMAIL}..."
SA_PROJECT_ROLES=$(gcloud projects get-iam-policy "${GCP_PROJECT_ID}" \
  --flatten="bindings[].members" \
  --format='value(bindings.role)' \
  --filter="bindings.members:serviceAccount:${TARGET_SERVICE_ACCOUNT_EMAIL}" 2>/dev/null || echo "") # エラー時も継続

MISSING_RUNTIME_ROLES=()
for role in "${REQUIRED_RUNTIME_ROLES[@]}"; do
  if ! echo "${SA_PROJECT_ROLES}" | grep -q -w "${role}"; then
    MISSING_RUNTIME_ROLES+=("${role}")
  fi
done

if [[ ${#MISSING_RUNTIME_ROLES[@]} -ne 0 ]]; then
  echo "エラー: サービスアカウントに必要な実行時 IAM ロールが不足しています (${TARGET_SERVICE_ACCOUNT_EMAIL}):" >&2
  for role in "${MISSING_RUNTIME_ROLES[@]}"; do
    echo "- ${role}" >&2
  done
  # 権限付与コマンドの例を表示
  echo "" >&2
  echo "以下のコマンドなどで権限を付与してください:" >&2
  for role in "${MISSING_RUNTIME_ROLES[@]}"; do
     echo "  gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} --member='serviceAccount:${TARGET_SERVICE_ACCOUNT_EMAIL}' --role='${role}'" >&2
  done
  # デプロイ実行者の権限不足とは別にエラーとする
  # exit 1 # ここで exit するとデプロイ実行者の権限不足が見逃される可能性があるので、フラグを立てるか、最後にまとめてチェックする方が良いかもしれない。
  # 今回は両方表示させるために exit しない。
  echo "------------------------------"
  # デプロイ実行者の権限も不足している場合は両方表示される
  if [[ ${#MISSING_ROLES[@]} -ne 0 ]]; then
      exit 1 # デプロイ実行者の権限も不足していればここで終了
  else
      # SAの実行時ロールのみ不足している場合
      exit 1
  fi
else
  echo "必要な実行時 IAM ロールはサービスアカウントに付与されています。"
fi
echo "------------------------------"


# すべてのチェックをパスした場合
exit 0
