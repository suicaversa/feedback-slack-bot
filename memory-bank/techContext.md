# 技術コンテキスト

*このドキュメントは、使用されている技術、開発セットアップ、技術的制約、依存関係、およびツールの使用パターンを詳述します。*

## 使用技術

*   **言語:** Node.js
*   **フレームワーク:** Express.js
*   **実行環境:** Google Cloud Run (Dockerコンテナ)
*   **AI:**
    *   Google Vertex AI Gemini Pro
    *   Google Vertex AI Gemini Pro Vision
*   **ストレージ:** 現在利用なし
*   **API:**
    *   Slack Events API
    *   Slack Web API
    *   Google Cloud APIs (Vertex AI: Gemini)
*   **その他:**
    *   Docker

## 開発セットアップ

*   **前提:** Node.js, Google Cloud SDK (`gcloud`), Docker
*   **設定:** `.env` ファイルに環境変数 (Slack Tokens, GCP Project ID, GCS Bucket Name等) を設定。 (`.env.example`参照)
*   **依存関係:** `npm install` でインストール。
*   **ローカル実行:** `npm start` (ngrok等での外部公開が必要)。
*   **ビルド (Docker):** `docker build -t <image_name> .` (Dockerfileが必要)。
*   **デプロイ:**
    *   Cloud Functions (Gen 2): `deploy.sh` スクリプトを使用 (環境変数のエクスポートが必要)。
    *   Cloud Run: Dockerイメージをビルドし、`gcloud run deploy` コマンドでデプロイ。

## 技術的制約

*   **Slack APIタイムアウト:** イベント通知への応答は3秒以内。非同期処理が必須。
*   **GCP認証:** Cloud RunからGCP APIを呼び出すための適切なサービスアカウントとIAMロール設定が必要。
*   **コスト:** 各GCPサービスの利用料金が発生。

## 依存関係

*   **主要ライブラリ (README記載):**
    *   `@google-cloud/vertexai`
    *   `@google-cloud/storage`
    *   `express`
    *   `body-parser`
    *   `dotenv`
    *   `axios` (Slack API通信、ファイルダウンロード用)
    *   `uuid`
    *   `winston` (ロギング用 - `utils/logger.js` でカスタム実装の可能性あり)
*   **管理:** `npm` (`package.json`, `package-lock.json`)

## ツールの使用パターン

*   **バージョン管理:** Git (リポジトリが存在することから推測)。
*   **コンテナ化:** Docker (Cloud Runデプロイ用)。
*   **デプロイメント:** `gcloud` CLI, `deploy.sh` スクリプト。
*   **インフラ:** Google Cloud Platform (Cloud Run, GCS, Vertex AI, Speech-to-Text)。
*   **開発支援:** `.env` ファイルによる環境変数管理。
