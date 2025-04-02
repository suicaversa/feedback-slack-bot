// config/config.js
require('dotenv').config();

/**
 * 環境変数を取得し、存在しない場合はエラーをスローする
 * @param {string} name - 環境変数名
 * @param {boolean} [required=true] - 必須かどうか
 * @returns {string} - 環境変数の値
 */
function getEnv(name, required = true) {
  const value = process.env[name];
  
  if (required && !value) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  
  return value;
}

module.exports = {
  // Slack設定
  SLACK_BOT_TOKEN: getEnv('SLACK_BOT_TOKEN'),
  SLACK_SIGNING_SECRET: getEnv('SLACK_SIGNING_SECRET'),
  
  // Google Cloud設定
  GCP_PROJECT_ID: getEnv('GCP_PROJECT_ID'),
  GCP_LOCATION: getEnv('GCP_LOCATION', false) || 'us-central1',
  GCP_KEY_FILE: getEnv('GCP_KEY_FILE', false),
  
  // Cloud Storage設定
  GCS_BUCKET_NAME: getEnv('GCS_BUCKET_NAME'),
  
  // アプリケーション設定
  NODE_ENV: getEnv('NODE_ENV', false) || 'development',
  PORT: getEnv('PORT', false) || 8080,
  
  // API設定
  GEMINI_API_KEY: getEnv('GEMINI_API_KEY', true), // 必須に変更
};
